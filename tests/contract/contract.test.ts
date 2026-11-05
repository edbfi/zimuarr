// The contract tests C1–C12 (docs/SPEC-contract-spike.md): a real, unmodified Bazarr 1.6.2 against
// zimuarr's production build. Every assertion is on Bazarr's outcome (job status, destination file,
// history, log), plus zimuarr's event lines and the recording proxy's timings. Phase 1 runs its cases
// at once; phase 2 runs the disruptive steps alone. `CONTRACT_FULL=1` adds C5. Needs `contract:up`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bazarrLines, linesFingerprint } from "#lib/server/services/translation/bazarr-lines.ts";
import type { CallbackEvent } from "#lib/server/services/translation/callback-work.ts";
import { Bazarr, type JobRecord } from "./bazarr.ts";
import { type Cue, type Exchange, FaultProxy } from "./fault-proxy.ts";
import {
	CONTRACT_DIR,
	INSTANCES,
	type Instance,
	loadRun,
	type Row,
	type Run,
	row,
	sourcePath,
} from "./setup.ts";

const FULL = process.env.CONTRACT_FULL === "1";
const REPO = path.resolve(CONTRACT_DIR, "../..");
const EVIDENCE_DIR = path.join(REPO, "test-results", "contract");
/** adapter-bun's default `BODY_SIZE_LIMIT`, which C12 checks the longest request against. */
const BODY_LIMIT = 512 * 1024;
const MINUTE = 60_000;

let run: Run;
const proxies = {} as Record<Instance, FaultProxy>;
const bazarrs = {} as Record<Instance, Bazarr>;
let zimuarr: Zimuarr;
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), full: FULL };
const cases: Record<string, unknown> = {};

type Event = CallbackEvent & { seenAt: number };

/** The production build (`bun ./build`) with the run's keys, its event lines collected. */
class Zimuarr {
	readonly events: Event[] = [];
	private constructor(private readonly proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {}

	static async start(heartbeatSeconds: number): Promise<Zimuarr> {
		const proc = Bun.spawn(["bun", "--no-env-file", "./build"], {
			cwd: REPO,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				PATH: process.env.PATH ?? "",
				HOME: process.env.HOME ?? "",
				HOST: run.gateway,
				PORT: String(run.zimuarrPort),
				ZIMUARR_CONTRACT_SPIKE_KEYS: INSTANCES.map((i) => run.lingarrKeys[i]).join(","),
				ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS: String(heartbeatSeconds),
			},
		});
		const server = new Zimuarr(proc);
		let listening!: () => void;
		const ready = new Promise<void>((resolve) => {
			listening = resolve;
		});
		void (async () => {
			let pending = "";
			for await (const chunk of proc.stdout) {
				pending += new TextDecoder().decode(chunk);
				const lines = pending.split("\n");
				pending = lines.pop() ?? "";
				for (const line of lines) {
					if (line.startsWith("Listening on")) listening();
					if (line.startsWith("{"))
						server.events.push({ ...(JSON.parse(line) as CallbackEvent), seenAt: Date.now() });
				}
			}
		})();
		await Promise.race([
			ready,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("zimuarr didn't start")), 20_000),
			),
		]);
		return server;
	}

	/** Sends a signal and resolves with how long the process took to exit. */
	async stop(signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): Promise<number> {
		const sent = Date.now();
		this.proc.kill(signal);
		await this.proc.exited;
		return Date.now() - sent;
	}

	for(source: string, since: number): Event[] {
		return this.events.filter(
			(e) => e.identity?.sourceSubtitlePath === source && e.seenAt >= since,
		);
	}
}

interface Translation {
	row: Row;
	source: string;
	job: JobRecord;
	exchanges: Exchange[];
	events: Event[];
	destination: string | undefined;
}

function target(r: Row) {
	const media = run.media;
	if (!media) throw new Error("media not provisioned");
	return r.video === "M"
		? { type: "movie" as const, id: media.radarrId, path: sourcePath(run, r) }
		: { type: "episode" as const, id: media.episodeIds[r.video], path: sourcePath(run, r) };
}

/** Dispatches a row through its Bazarr, waits for the job's end, and gathers what happened. */
async function translate(
	name: string,
	options: { cue?: Cue; deadlineMs?: number } = {},
): Promise<Translation> {
	const r = row(name);
	const source = sourcePath(run, r);
	if (options.cue) proxies[r.instance].cue(source, options.cue);
	const since = Date.now();
	const job = await bazarrs[r.instance].translate(r, target(r), options.deadlineMs ?? 10 * MINUTE);
	await new Promise((resolve) => setTimeout(resolve, 500)); // the last event lines
	const exchanges = proxies[r.instance].forSource(source).filter((e) => e.openedAt >= since);
	const destination = exchanges[0]?.requestBody
		? (JSON.parse(exchanges[0].requestBody.toString("utf8")).translatedSubtitlePath as string)
		: undefined;
	const result = {
		row: r,
		source,
		job,
		exchanges,
		events: zimuarr.for(source, since),
		destination,
	};
	record(name, result);
	return result;
}

function timings(exchange: Exchange) {
	const head = exchange.responseHeadAt;
	const delivered = exchange.body.filter((b) => b.delivered);
	const times = [head, ...delivered.map((b) => b.at)].filter((t): t is number => t !== undefined);
	const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
	return {
		status: exchange.status,
		contentEncoding: exchange.responseHeaders?.["content-encoding"],
		requestBytes: exchange.requestBody?.length,
		firstBodyMs: head && delivered[0] ? delivered[0].at - head : undefined,
		maxGapMs: gaps.length > 0 ? Math.max(...gaps) : undefined,
		bodyRuns: delivered.length,
		heldMs: head && exchange.endedAt ? exchange.endedAt - head : undefined,
		end: exchange.end,
	};
}

function record(name: string, t: Translation, extra: Record<string, unknown> = {}) {
	let entry = name;
	for (let n = 2; entry in cases; n++) entry = `${name}#${n}`;
	cases[entry] = {
		job: { status: t.job.status, name: t.job.name, ms: t.job.statusAt - t.job.firstSeenAt },
		destination: t.destination ? path.basename(t.destination) : undefined,
		attempts: t.exchanges.length,
		exchanges: t.exchanges.map(timings),
		events: t.events.map((e) => e.event),
		...extra,
	};
}

async function exists(file: string | undefined): Promise<boolean> {
	return file !== undefined && (await Bun.file(file).exists());
}

async function logged(instance: Instance, text: string): Promise<boolean> {
	return (await bazarrs[instance].logs()).some((entry) =>
		`${entry.message} ${entry.exception ?? ""}`.includes(text),
	);
}

/** SRT cues as timing and text, the way a reader sees them. */
function cues(srt: string): Array<{ timing: string; text: string }> {
	return srt
		.replace(/^\uFEFF/, "")
		.replace(/\r\n?/g, "\n")
		.split(/\n{2,}/)
		.map((block) => block.trim().split("\n"))
		.filter((lines) => lines.length >= 2)
		.map(([, timing = "", ...text]) => ({ timing, text: text.join("\n") }));
}

function decode(bytes: Uint8Array): string {
	return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

/** Waits for zimuarr's first `received` line for a source (cases that other tests dispatch). */
async function received(source: string, deadlineMs: number): Promise<Event> {
	const end = Date.now() + deadlineMs;
	for (;;) {
		const found = zimuarr.events.find(
			(e) => e.event === "received" && e.identity?.sourceSubtitlePath === source,
		);
		if (found) return found;
		if (Date.now() > end) throw new Error(`no callback for ${source}`);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

beforeAll(async () => {
	run = await loadRun();
	const ports = run.ports;
	if (!ports) throw new Error("services not started");
	evidence.versions = run.versions;
	evidence.provisioning = run.provisioning;
	zimuarr = await Zimuarr.start(5);
	const upstreams: Record<Instance, { host: string; port: number }> = {
		direct: { host: run.gateway, port: run.zimuarrPort },
		caddy: { host: "127.0.0.1", port: ports.caddy },
		nginx: { host: "127.0.0.1", port: ports.nginx },
	};
	for (const instance of INSTANCES) {
		proxies[instance] = await FaultProxy.start(
			{ host: run.gateway, port: run.proxyPorts[instance] },
			upstreams[instance],
		);
		bazarrs[instance] = new Bazarr(instance, ports.bazarr[instance], run.bazarrApiKeys[instance]);
		bazarrs[instance].startPolling();
	}
}, MINUTE);

afterAll(async () => {
	for (const instance of INSTANCES) {
		bazarrs[instance]?.stopPolling();
		await proxies[instance]?.close();
	}
	await zimuarr?.stop("SIGKILL");
	evidence.finishedAt = new Date().toISOString();
	evidence.cases = cases;
	await mkdir(EVIDENCE_DIR, { recursive: true });
	await writeFile(path.join(EVIDENCE_DIR, "evidence.json"), JSON.stringify(evidence, null, "\t"));
}, MINUTE);

describe.concurrent("phase 1", () => {
	it("C1: the request has D20's shape, from a JSON POST without browser headers", async () => {
		const t = await translate("C1");
		expect(t.job.status).toBe("completed");
		expect(t.exchanges).toHaveLength(1);
		const [exchange] = t.exchanges;
		expect(exchange?.method).toBe("POST");
		expect(exchange?.target).toBe("/bazarr/api/translate/content");
		const headers = exchange?.requestHeaders ?? {};
		// What sign-in's cross-origin check relies on (docs/SPEC.md, Module notes): JSON, and neither
		// `Origin` nor `Sec-Fetch-Site`.
		expect(headers["content-type"]).toBe("application/json");
		expect(headers.origin).toBeUndefined();
		expect(headers["sec-fetch-site"]).toBeUndefined();
		expect(headers["x-api-key"] === run.lingarrKeys.direct).toBe(true);
		const disk = bazarrLines(decode(await readFile(t.source)));
		const body = JSON.parse(exchange?.requestBody?.toString("utf8") ?? "{}");
		expect(body).toEqual({
			arrMediaId: run.media?.radarrId,
			title: expect.stringContaining(path.basename(t.source)),
			sourceLanguage: "en",
			targetLanguage: "pt-BR",
			mediaType: "Movie",
			lines: disk,
			sourceSubtitlePath: t.source,
			translatedSubtitlePath: expect.stringMatching(/\.pt-BR\.srt$/),
		});
		// Positions count every cue; the blank cue at position 5 is left out.
		expect(body.lines.map((l: { position: number }) => l.position)).toEqual([
			0, 1, 2, 3, 4, 6, 7, 8, 9, 10,
		]);
		expect(await exists(t.destination)).toBe(true);
		cases.C1 = {
			...(cases.C1 as object),
			contentType: headers["content-type"],
			userAgent: headers["user-agent"],
		};
	});

	it("C2: the fingerprint from the file on disk equals the callback's, for every fixture", async () => {
		const own = await Promise.all([translate("C2-bom"), translate("C2-ws")]);
		for (const t of own) expect(t.job.status).toBe("completed");
		const episode = JSON.parse(own[0]?.exchanges[0]?.requestBody?.toString("utf8") ?? "{}");
		expect(episode).toMatchObject({
			arrMediaId: run.media?.seriesId,
			mediaType: "Episode",
			sourceLanguage: "de",
			targetLanguage: "ca",
		});
		const fingerprints: Record<string, { disk: string; callback: string; lines: number }> = {};
		for (const name of ["C1", "C2-bom", "C2-ws", "C4", "C8-markup", "C12"]) {
			const source = sourcePath(run, row(name));
			const event = await received(source, 10 * MINUTE);
			const lines = bazarrLines(decode(await readFile(source)));
			fingerprints[row(name).fixture] = {
				disk: linesFingerprint(lines),
				callback: String(event.identity?.fingerprint),
				lines: lines.length,
			};
		}
		cases.C2 = fingerprints;
		for (const { disk, callback } of Object.values(fingerprints)) expect(callback).toBe(disk);
	});

	it("C3: two episodes at once, and a normal, forced and hearing-impaired subtitle from one source", async () => {
		const episodes = await Promise.all([translate("C3-e1"), translate("C3-e2")]);
		// One after another: the three share a source, so each is told apart by its own time window.
		const variants: Translation[] = [];
		for (const name of ["C3-normal", "C3-forced", "C3-hi"]) variants.push(await translate(name));
		for (const t of [...episodes, ...variants]) {
			expect(t.job.status).toBe("completed");
			expect(t.exchanges).toHaveLength(1);
			const answered = t.events.find((e) => e.event === "received");
			expect(answered?.identity?.translatedSubtitlePath).toBe(t.destination);
			expect(answered?.identity?.sourceSubtitlePath).toBe(t.source);
		}
		const identities = new Set(
			[...episodes, ...variants].map((t) => JSON.stringify(t.events[0]?.identity)),
		);
		expect(identities.size).toBe(5);
		const [normal, forced, hi] = variants.map((t) => path.basename(t.destination ?? ""));
		expect(new Set([normal, forced, hi]).size).toBe(3);
		expect(normal).toMatch(/\.cy\.srt$/);
		expect(forced).toMatch(/forced/);
		expect(hi).toMatch(/sdh/);
		for (const t of [...episodes, ...variants]) {
			const written = cues(await Bun.file(t.destination ?? "").text());
			expect(written.every((c) => c.text.startsWith(`[${t.row.target}] `))).toBe(true);
		}
		cases.C3 = { ...((cases.C3 as object) ?? {}), names: { normal, forced, hi } };
	});

	it("C4: the destination holds exactly the answered lines and the source's timing, post-processing on", async () => {
		const t = await translate("C4");
		expect(t.job.status).toBe("completed");
		const source = cues(await Bun.file(t.source).text());
		const written = cues(await Bun.file(t.destination ?? "").text());
		expect(written).toEqual(source.map((c) => ({ timing: c.timing, text: `[af] ${c.text}` })));
		const history = await bazarrs.nginx.history("episode");
		const entry = history.find((h) =>
			JSON.stringify(h).includes(path.basename(t.destination ?? "")),
		);
		expect(entry).toBeDefined();
		expect(await exists(path.join(run.mediaDir, ".postprocessing-ran-nginx"))).toBe(false);
		cases.C4 = { ...(cases.C4 as object), history: entry };
	});

	it.runIf(FULL)(
		"C5: a 35-minute translation succeeds on all three paths, the heartbeat arriving throughout",
		async () => {
			const all = await Promise.all(
				["C5-direct", "C5-caddy", "C5-nginx"].map((name) =>
					translate(name, { deadlineMs: 45 * MINUTE }),
				),
			);
			for (const t of all) {
				expect(t.job.status).toBe("completed");
				expect(t.exchanges).toHaveLength(1);
				expect(t.events.filter((e) => e.event === "received")).toHaveLength(1);
				const timing = timings(t.exchanges[0] as Exchange);
				expect(timing.heldMs).toBeGreaterThanOrEqual(35 * MINUTE - 1000);
				expect(timing.firstBodyMs).toBeLessThan(2000);
				expect(timing.maxGapMs).toBeLessThanOrEqual(10_000);
			}
		},
		50 * MINUTE,
	);

	it(
		"C6: a 5-minute translation succeeds on all three paths with default settings",
		async () => {
			const all = await Promise.all(
				["C6-direct", "C6-caddy", "C6-nginx"].map((name) => translate(name)),
			);
			for (const t of all) {
				expect(t.job.status).toBe("completed");
				expect(t.exchanges).toHaveLength(1);
				const timing = timings(t.exchanges[0] as Exchange);
				expect(timing.heldMs).toBeGreaterThanOrEqual(5 * MINUTE - 1000);
				expect(timing.firstBodyMs).toBeLessThan(2000);
				expect(timing.maxGapMs).toBeLessThanOrEqual(10_000);
			}
		},
		15 * MINUTE,
	);

	it("C6 control: without D25's headers, nginx with gzip holds the spaces back for 30 seconds", async () => {
		const t = await translate("C6-bare");
		// Judged from when the request left Bazarr: nginx may hold back the 200's head as well.
		const first = t.exchanges[0] as Exchange;
		const firstByte = first.body.find((b) => b.delivered)?.at ?? Number.POSITIVE_INFINITY;
		cases["C6-bare"] = {
			...(cases["C6-bare"] as object),
			headAfterMs: (first.responseHeadAt ?? 0) - first.openedAt,
			firstBodyByteAfterMs: firstByte - first.openedAt,
		};
		expect(firstByte - first.openedAt).toBeGreaterThanOrEqual(30_000);
	});

	it("C7: failures after the 200 fail the job at once, write nothing and log the reason", async () => {
		const existing = sourcePath(run, row("C7-empty")).replace(/\.el\.srt$/, ".bs.srt");
		const before = await readFile(existing);
		const [failAfter, incomplete, empty] = await Promise.all([
			translate("C7-fail"),
			translate("C7-incomplete"),
			translate("C7-empty"),
		]);
		for (const t of [failAfter, incomplete, empty]) {
			expect(t.job.status).toBe("failed");
			expect(t.exchanges).toHaveLength(1);
		}
		expect(await exists(failAfter?.destination)).toBe(false);
		expect(await exists(incomplete?.destination)).toBe(false);
		expect(empty?.destination).toBe(existing);
		expect(Buffer.compare(await readFile(existing), before)).toBe(0);
		expect(await logged("caddy", "stand-in: failed after 30 seconds, as directed")).toBe(true);
		expect(await logged("nginx", "invalid-output: position 4 is missing")).toBe(true);
		expect(await logged("direct", "invalid-output: position 4 is empty")).toBe(true);
	});

	it("C8: empty lines and a kept failure each fail the job after one attempt, with the reason", async () => {
		const markup = await translate("C8-markup");
		expect(markup.job.status).toBe("failed");
		expect(markup.exchanges).toHaveLength(1);
		expect(await exists(markup.destination)).toBe(false);
		expect(await logged("direct", "empty: no translatable lines")).toBe(true);

		const first = await translate("C8-kept");
		expect(first.job.status).toBe("failed");
		const kept = await translate("C8-kept");
		expect(kept.job.status).toBe("failed");
		expect(kept.exchanges).toHaveLength(1);
		expect(kept.events.map((e) => e.event)).toEqual(["received", "replayed"]);
		expect(await exists(kept.destination)).toBe(false);
		expect(await logged("direct", "(kept; a new attempt runs from ")).toBe(true);
	});

	it("C9: a retry after a cut connection joins the running work, which runs once", async () => {
		const t = await translate("C9", { cue: { kind: "cut-after", ms: 5000 } });
		expect(t.job.status).toBe("completed");
		expect(t.exchanges.map((e) => e.end)).toEqual(["cut", "complete"]);
		const kinds = t.events.map((e) => e.event);
		expect(kinds.filter((k) => k === "joined")).toHaveLength(1);
		expect(kinds.filter((k) => k === "received")).toHaveLength(2);
		expect(kinds).not.toContain("replayed");
		expect(
			cues(await Bun.file(t.destination ?? "").text()).every((c) => c.text.startsWith("[lb] ")),
		).toBe(true);
	});

	it("C10: a retry after a lost answer, and a later dispatch, get the kept result without a second run", async () => {
		const t = await translate("C10", { cue: { kind: "cut-on-answer" } });
		expect(t.job.status).toBe("completed");
		expect(t.exchanges.map((e) => e.end)).toEqual(["cut", "complete"]);
		expect(t.events.map((e) => e.event)).toEqual(["received", "answered", "received", "replayed"]);
		const later = await translate("C10");
		expect(later.job.status).toBe("completed");
		expect(later.events.map((e) => e.event)).toEqual(["received", "replayed"]);
		expect(
			cues(await Bun.file(t.destination ?? "").text()).every((c) => c.text.startsWith("[ka] ")),
		).toBe(true);
	});

	it("C12: the longest fixture's request fits the body limit with room to spare", async () => {
		const t = await translate("C12");
		expect(t.job.status).toBe("completed");
		const bytes = t.exchanges[0]?.requestBody?.length ?? 0;
		cases.C12 = { ...(cases.C12 as object), requestBytes: bytes, limit: BODY_LIMIT };
		expect(bytes * 2).toBeLessThanOrEqual(BODY_LIMIT);
	});
});

describe("phase 2", () => {
	it("C8: a wrong key gives three attempts, then a failed job, and nothing written", async () => {
		await bazarrs.nginx.setLingarrToken("wrong-key");
		try {
			const t = await translate("C8-key");
			expect(t.job.status).toBe("failed");
			expect(t.exchanges.map((e) => e.status)).toEqual([401, 401, 401]);
			expect(await exists(t.destination)).toBe(false);
			expect(await logged("nginx", "Authentication failed")).toBe(true);
		} finally {
			await bazarrs.nginx.setLingarrToken(run.lingarrKeys.nginx);
		}
	});

	it("C6 control: with the heartbeat off, Bun closes the connection within about 10 seconds", async () => {
		await zimuarr.stop();
		zimuarr = await Zimuarr.start(0);
		try {
			const t = await translate("C6-off");
			const first = t.exchanges[0] as Exchange;
			const held = (first.endedAt ?? 0) - (first.responseHeadAt ?? 0);
			cases["C6-off"] = { ...(cases["C6-off"] as object), firstConnectionHeldMs: held };
			expect(first.end).not.toBe("complete");
			expect(held).toBeGreaterThan(9000);
			expect(held).toBeLessThan(15_000);
		} finally {
			await zimuarr.stop();
			zimuarr = await Zimuarr.start(5);
		}
	});

	it("C11: SIGTERM mid-work exits once adapter-bun's 30-second window closes; the job fails, nothing written", async () => {
		const r = row("C11");
		const source = sourcePath(run, r);
		const since = Date.now();
		const job = bazarrs.direct.translate(r, target(r), 5 * MINUTE);
		await received(source, MINUTE);
		await new Promise((resolve) => setTimeout(resolve, 5000));
		const exitMs = await zimuarr.stop();
		try {
			const ended = await job;
			const exchanges = proxies.direct.forSource(source).filter((e) => e.openedAt >= since);
			const destination = JSON.parse(
				exchanges[0]?.requestBody?.toString("utf8") ?? "{}",
			).translatedSubtitlePath;
			cases.C11 = {
				exitMs,
				job: ended.status,
				attempts: exchanges.length,
				exchanges: exchanges.map(timings),
			};
			// "Within that window" read as "once it closes": a held callback keeps adapter-bun draining
			// for the full 30 seconds, so the process can't exit earlier.
			expect(exitMs).toBeGreaterThanOrEqual(30_000);
			expect(exitMs).toBeLessThanOrEqual(35_000);
			expect(ended.status).toBe("failed");
			expect(exchanges.length).toBeGreaterThanOrEqual(1);
			expect(exchanges.length).toBeLessThanOrEqual(3);
			expect(await exists(destination)).toBe(false);
		} finally {
			zimuarr = await Zimuarr.start(5);
		}
	});
});
