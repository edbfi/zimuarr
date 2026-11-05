import type { BazarrLine } from "./bazarr-lines.ts";

/**
 * How the contract harness steers the stand-in: a fixture's first cue can hold one
 * `zimuarr-spike: <directive>`.
 */
export type Directive =
	| { kind: "none" }
	| { kind: "delay"; seconds: number }
	| { kind: "fail-after"; seconds: number }
	| { kind: "incomplete" }
	| { kind: "empty-line" }
	| { kind: "bare-headers" }
	| { kind: "unknown"; text: string };

export type StandInOutcome = { ok: true; lines: BazarrLine[] } | { ok: false; error: string };

/** How long `bare-headers` holds, so C6's control sees a response open past its 30 seconds. */
const BARE_HEADERS_HOLD_SECONDS = 45;
const PREFIX = "zimuarr-spike: ";

/** The directive in the line with the lowest position, if any. */
export function readDirective(lines: readonly BazarrLine[]): Directive {
	const first = lines.reduce<BazarrLine | undefined>(
		(lowest, line) => (lowest === undefined || line.position < lowest.position ? line : lowest),
		undefined,
	);
	if (!first?.line.startsWith(PREFIX)) return { kind: "none" };
	const text = first.line.slice(PREFIX.length).trim();
	const timed = /^(delay|fail-after)=(\d+)$/.exec(text);
	if (timed) return { kind: timed[1] as "delay" | "fail-after", seconds: Number(timed[2]) };
	if (text === "incomplete" || text === "empty-line" || text === "bare-headers") {
		return { kind: text };
	}
	return { kind: "unknown", text };
}

function wait(seconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", stop);
			resolve();
		}, seconds * 1000);
		const stop = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		signal.addEventListener("abort", stop, { once: true });
	});
}

/**
 * The deterministic stand-in for a translation: each line prefixed with `[<target>] `, shaped by
 * the directive. Rejects with the signal's reason when aborted.
 */
export async function standInTranslate(
	request: { targetLanguage: string; lines: readonly BazarrLine[] },
	directive: Directive,
	signal: AbortSignal,
): Promise<StandInOutcome> {
	if (directive.kind === "unknown") {
		return { ok: false, error: `stand-in: unknown directive "${directive.text}"` };
	}
	if (directive.kind === "fail-after") {
		await wait(directive.seconds, signal);
		return { ok: false, error: `stand-in: failed after ${directive.seconds} seconds, as directed` };
	}
	if (directive.kind === "delay") await wait(directive.seconds, signal);
	if (directive.kind === "bare-headers") await wait(BARE_HEADERS_HOLD_SECONDS, signal);

	const translated = [...request.lines]
		.sort((a, b) => a.position - b.position)
		.map(({ position, line }) => ({ position, line: `[${request.targetLanguage}] ${line}` }));
	const last = translated.at(-1);
	if (directive.kind === "incomplete") translated.pop();
	if (directive.kind === "empty-line" && last) last.line = "";
	return { ok: true, lines: translated };
}
