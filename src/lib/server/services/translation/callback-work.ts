import { createHash, timingSafeEqual } from "node:crypto";
import process from "node:process";
import {
	type ContractSpikeConfig,
	contractSpikeConfig,
} from "#lib/server/config/contract-spike.ts";
import { type BazarrLine, linesFingerprint } from "./bazarr-lines.ts";
import { type CallbackRequest, parseCallbackRequest } from "./callback-request.ts";
import { type Answer, type HeldEnd, heldResponse, immediateAnswer } from "./held-response.ts";
import { type Directive, readDirective, standInTranslate } from "./stand-in-translator.ts";

/** What tells one job apart (D20): never the key itself, only its place in the list. */
export interface Identity {
	key: number;
	sourceLanguage: string;
	targetLanguage: string;
	sourceSubtitlePath: string;
	translatedSubtitlePath: string;
	fingerprint: string;
}

/** One JSON line on standard output; never the key or the lines. */
export type CallbackEvent = {
	event: "received" | "joined" | "replayed" | "answered" | "failed" | "disconnected";
	at: string;
	identity?: Identity;
	attempt?: number;
	[detail: string]: unknown;
};

export interface CallbackWorkDeps {
	config: () => ContractSpikeConfig;
	translate: typeof standInTranslate;
	log: (event: CallbackEvent) => void;
}

/** D20: a finished result is kept 7 days; a failure 5 minutes, for Bazarr's retries. */
const RESULT_KEPT_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_KEPT_MS = 5 * 60 * 1000;

interface Work {
	identity: Identity;
	attempts: number;
	startedAt: number;
	/** Settles only after the outcome is kept; rejects when cancelled on shutdown. */
	outcome: Promise<Answer>;
	kept?: { answer: Answer; until: number };
	cancel: () => void;
	holds: Set<() => void>;
}

class Cancelled extends Error {}
class DeadlineReached extends Error {}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

/** The index of the key, comparing every configured key in constant time; -1 if none matches. */
function keyIndex(presented: string | null, keys: readonly string[]): number {
	if (presented === null) return -1;
	const given = digest(presented);
	let found = -1;
	keys.forEach((key, index) => {
		if (timingSafeEqual(given, digest(key))) found = index;
	});
	return found;
}

/** The output check: exactly the positions Bazarr sent, each with a non-empty line. */
function checkedAnswer(sent: readonly BazarrLine[], output: readonly BazarrLine[]): Answer {
	const expected = new Set(sent.map((line) => line.position));
	const seen = new Set<number>();
	for (const { position, line } of output) {
		if (!expected.has(position)) return failure(`invalid-output: position ${position} wasn't sent`);
		if (seen.has(position)) return failure(`invalid-output: position ${position} appears twice`);
		if (line === "") return failure(`invalid-output: position ${position} is empty`);
		seen.add(position);
	}
	const missing = [...expected].filter((position) => !seen.has(position));
	if (missing.length > 0)
		return failure(`invalid-output: position ${missing.join(", ")} is missing`);
	return { kind: "lines", lines: [...output].sort((a, b) => a.position - b.position) };
}

function failure(error: string): Answer {
	return { kind: "failure", error };
}

function refusal(status: 401 | 404 | 422, error: string): Response {
	return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

/** The spike's callback work: checks, identities, joining, keeping, the deadline and shutdown. */
export function createCallbackWork(deps: CallbackWorkDeps) {
	const works = new Map<string, Work>();

	const log = (event: CallbackEvent["event"], details: Omit<CallbackEvent, "event" | "at">) =>
		deps.log({ event, at: new Date().toISOString(), ...details });

	function prune(now: number) {
		for (const [id, work] of works) if (work.kept && work.kept.until <= now) works.delete(id);
	}

	function start(
		id: string,
		identity: Identity,
		request: CallbackRequest,
		directive: Directive,
		config: ContractSpikeConfig,
	): Work {
		const controller = new AbortController();
		const deadline = setTimeout(() => controller.abort(new DeadlineReached()), config.deadlineMs);
		const startedAt = Date.now();
		const work: Work = {
			identity,
			attempts: 1,
			startedAt,
			holds: new Set(),
			cancel: () => controller.abort(new Cancelled()),
			outcome: deps
				.translate(request, directive, controller.signal)
				.then(
					(result) =>
						result.ok ? checkedAnswer(request.lines, result.lines) : failure(result.error),
					(error: unknown) => {
						if (error instanceof DeadlineReached) {
							return failure(
								`deadline: the translation took longer than ${config.deadlineMs / 1000} seconds`,
							);
						}
						if (error instanceof Cancelled) throw error;
						return failure(`internal: ${error instanceof Error ? error.message : String(error)}`);
					},
				)
				.then(
					(answer) => {
						// Kept before any held callback writes a byte of it (D25).
						const now = Date.now();
						const keptMs = answer.kind === "lines" ? RESULT_KEPT_MS : FAILURE_KEPT_MS;
						work.kept = { answer, until: now + keptMs };
						if (answer.kind === "failure") {
							log("failed", { identity, error: answer.error, workMs: now - startedAt });
						}
						return answer;
					},
					(error: unknown) => {
						works.delete(id);
						throw error;
					},
				)
				.finally(() => clearTimeout(deadline)),
		};
		// Cancelled work with nobody holding on would otherwise be an unhandled rejection.
		work.outcome.catch(() => {});
		works.set(id, work);
		return work;
	}

	function hold(work: Work, attempt: number, config: ContractSpikeConfig, bare: boolean): Response {
		const heldAt = Date.now();
		const onEnd = (how: HeldEnd) => {
			work.holds.delete(held.end);
			if (how === "ended") return;
			log(how, { identity: work.identity, attempt, heldMs: Date.now() - heldAt });
		};
		const held = heldResponse(work.outcome, {
			heartbeatMs: config.heartbeatMs,
			bareHeaders: bare,
			onEnd,
		});
		work.holds.add(held.end);
		return held.response;
	}

	async function answer(request: Request): Promise<Response> {
		const config = deps.config();
		if (config.keys.length === 0) return new Response("Not Found", { status: 404 });

		const key = keyIndex(request.headers.get("x-api-key"), config.keys);
		if (key < 0) {
			log("failed", { status: 401 });
			return refusal(401, "unauthorized: missing or unknown X-Api-Key");
		}

		let parsed: ReturnType<typeof parseCallbackRequest>;
		try {
			parsed = parseCallbackRequest(JSON.parse(await request.text()));
		} catch {
			log("failed", { status: 422, reason: "not JSON" });
			return refusal(422, "invalid: the body is not JSON");
		}
		if (!parsed.ok) {
			log("failed", { status: 422, reason: parsed.reason });
			return refusal(422, `invalid: ${parsed.reason}`);
		}

		const body = parsed.request;
		const identity: Identity = {
			key,
			sourceLanguage: body.sourceLanguage,
			targetLanguage: body.targetLanguage,
			sourceSubtitlePath: body.sourceSubtitlePath,
			translatedSubtitlePath: body.translatedSubtitlePath,
			fingerprint: linesFingerprint(body.lines),
		};
		const id = JSON.stringify(identity);

		// From here to the end, no await: finding running work and registering new work is one step.
		const now = Date.now();
		prune(now);
		const existing = works.get(id);
		const attempt = (existing?.attempts ?? 0) + 1;
		if (existing) existing.attempts = attempt;
		log("received", { identity, attempt, lineCount: body.lines.length });

		if (body.lines.length === 0) {
			log("failed", { identity, attempt, error: "empty: no translatable lines" });
			return immediateAnswer(failure("empty: no translatable lines"));
		}

		if (existing?.kept) {
			const kept = existing.kept.answer;
			log("replayed", { identity, attempt, kept: kept.kind === "lines" ? "result" : "failure" });
			if (kept.kind === "lines") return immediateAnswer(kept);
			const until = new Date(existing.kept.until).toISOString();
			return immediateAnswer(failure(`${kept.error} (kept; a new attempt runs from ${until})`));
		}

		const directive = readDirective(body.lines);
		if (existing) {
			log("joined", { identity, attempt });
			return hold(existing, attempt, config, directive.kind === "bare-headers");
		}
		const work = start(id, identity, body, directive, config);
		return hold(work, attempt, config, directive.kind === "bare-headers");
	}

	/** On `sveltekit:shutdown`: cancel all running work and end its held callbacks unanswered. */
	function shutdown() {
		for (const work of works.values()) {
			if (work.kept) continue;
			work.cancel();
			for (const end of work.holds) end();
		}
	}

	return { answer, shutdown };
}

const work = createCallbackWork({
	config: contractSpikeConfig,
	translate: standInTranslate,
	log: (event) => console.log(JSON.stringify(event)),
});
process.on("sveltekit:shutdown", work.shutdown);

/** Answers Bazarr's Lingarr callback (`contract-spike`). */
export const answerCallback = (request: Request): Promise<Response> => work.answer(request);
