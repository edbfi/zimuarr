import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractSpikeConfig } from "#lib/server/config/contract-spike.ts";
import type { BazarrLine } from "./bazarr-lines.ts";
import { type CallbackEvent, createCallbackWork } from "./callback-work.ts";
import { standInTranslate } from "./stand-in-translator.ts";

const KEY = "key-one";
const OTHER_KEY = "key-two";
const lines: BazarrLine[] = [
	{ position: 0, line: "Hello." },
	{ position: 2, line: "World." },
];
const body = {
	arrMediaId: 7,
	title: "Movie · Movie.en.srt",
	sourceLanguage: "en",
	targetLanguage: "da",
	mediaType: "Movie",
	lines,
	sourceSubtitlePath: "/media/movies/Movie/Movie.en.srt",
	translatedSubtitlePath: "/media/movies/Movie/Movie.da.srt",
};

function callback(payload: unknown = body, key: string | null = KEY): Request {
	const headers = new Headers({ "content-type": "application/json" });
	if (key !== null) headers.set("x-api-key", key);
	const text = typeof payload === "string" ? payload : JSON.stringify(payload);
	return new Request("http://zimuarr/bazarr/api/translate/content", {
		method: "POST",
		headers,
		body: text,
	});
}

function directed(directive: string): typeof body {
	return {
		...body,
		lines: [{ position: 0, line: `zimuarr-spike: ${directive}` }, ...lines.slice(1)],
	};
}

function setup(config: Partial<ContractSpikeConfig> = {}) {
	const events: CallbackEvent[] = [];
	const translate = vi.fn(standInTranslate);
	const work = createCallbackWork({
		config: () => ({ keys: [KEY, OTHER_KEY], heartbeatMs: 5000, deadlineMs: 3_600_000, ...config }),
		translate,
		log: (event) => events.push(event),
	});
	return { work, translate, events, kinds: () => events.map((event) => event.event) };
}

/** A held body's text once its answer is written, with the leading spaces it got. */
async function settle(response: Response, ms = 0): Promise<string> {
	const text = response.text();
	await vi.advanceTimersByTimeAsync(ms);
	return text;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("checks before the 200", () => {
	it("answers 404 when no spike keys are set", async () => {
		const { work, translate } = setup({ keys: [] });
		const response = await work.answer(callback());
		expect(response.status).toBe(404);
		expect(translate).not.toHaveBeenCalled();
	});

	it.each([
		["no key", null],
		["a wrong key", "key-wrong"],
		["a key that only starts like one", "key-on"],
	])("answers 401 for %s, logging no key", async (_, key) => {
		const { work, translate, events } = setup();
		const response = await work.answer(callback(body, key));
		expect(response.status).toBe(401);
		expect(translate).not.toHaveBeenCalled();
		expect(events).toEqual([expect.objectContaining({ event: "failed", status: 401 })]);
		expect(JSON.stringify(events)).not.toContain("key-");
	});

	it("answers 422 for a body that isn't JSON", async () => {
		const { work } = setup();
		const response = await work.answer(callback("{not json"));
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: expect.stringMatching(/^invalid: /) });
	});

	it("answers 422 for JSON that isn't the D20 shape", async () => {
		const { work } = setup();
		const response = await work.answer(callback({ ...body, mediaType: "Series" }));
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: expect.stringContaining("mediaType") });
	});

	it("answers empty lines at once with the failure object, and keeps nothing", async () => {
		const { work, translate, kinds } = setup();
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await work.answer(callback({ ...body, lines: [] }));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ error: "empty: no translatable lines" });
		}
		expect(translate).not.toHaveBeenCalled();
		expect(kinds()).toEqual(["received", "failed", "received", "failed"]);
	});
});

describe("the work", () => {
	it("holds the callback and answers the stand-in's list", async () => {
		const { work, translate, events } = setup();
		const response = await work.answer(callback(directed("delay=12")));
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		const text = await settle(response, 12_000);
		expect(text).toMatch(/^ {3}\[/);
		expect(JSON.parse(text)).toEqual([
			{ position: 0, line: "[da] zimuarr-spike: delay=12" },
			{ position: 2, line: "[da] World." },
		]);
		expect(translate).toHaveBeenCalledOnce();
		expect(events.map((event) => event.event)).toEqual(["received", "answered"]);
		expect(events[0]).toMatchObject({
			identity: {
				key: 0,
				sourceLanguage: "en",
				targetLanguage: "da",
				sourceSubtitlePath: body.sourceSubtitlePath,
				translatedSubtitlePath: body.translatedSubtitlePath,
				fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
			},
			attempt: 1,
		});
	});

	it("never logs the key or the lines", async () => {
		const { work, events } = setup();
		await settle(await work.answer(callback()));
		expect(JSON.stringify(events)).not.toContain(KEY);
		expect(JSON.stringify(events)).not.toContain("Hello.");
	});

	it("leaves out the proxy headers for bare-headers", async () => {
		const { work } = setup();
		const response = await work.answer(callback(directed("bare-headers")));
		expect(response.headers.get("cache-control")).toBeNull();
		expect(response.headers.get("x-accel-buffering")).toBeNull();
	});

	it.each([
		["incomplete", "invalid-output: position 2 is missing"],
		["empty-line", "invalid-output: position 2 is empty"],
	])("turns %s output into the failure answer, never a partial list", async (directive, error) => {
		const { work, events } = setup();
		const text = await settle(await work.answer(callback(directed(directive))));
		expect(JSON.parse(text)).toEqual({ error });
		expect(events.map((event) => event.event)).toEqual(["received", "failed", "answered"]);
	});

	it("answers the stand-in's failure", async () => {
		const { work } = setup();
		const text = await settle(await work.answer(callback(directed("fail-after=30"))), 30_000);
		expect(JSON.parse(text)).toEqual({ error: "stand-in: failed after 30 seconds, as directed" });
	});

	it("ends the work with a failure at its deadline", async () => {
		const { work } = setup({ deadlineMs: 10_000 });
		const text = await settle(await work.answer(callback(directed("delay=60"))), 10_000);
		expect(JSON.parse(text)).toEqual({
			error: "deadline: the translation took longer than 10 seconds",
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("joining", () => {
	it("starts one execution for two callbacks with one identity in the same tick", async () => {
		const { work, translate, kinds } = setup();
		const [first, second] = await Promise.all([
			work.answer(callback(directed("delay=5"))),
			work.answer(callback(directed("delay=5"))),
		]);
		const texts = await Promise.all([settle(first, 5000), settle(second)]);
		expect(translate).toHaveBeenCalledOnce();
		expect(JSON.parse(texts[0])).toEqual(JSON.parse(texts[1]));
		expect(kinds()).toEqual(["received", "received", "joined", "answered", "answered"]);
	});

	it("starts two executions for the same request under two keys", async () => {
		const { work, translate } = setup();
		await Promise.all([
			work.answer(callback(directed("delay=5"), KEY)),
			work.answer(callback(directed("delay=5"), OTHER_KEY)),
		]);
		expect(translate).toHaveBeenCalledTimes(2);
	});

	it("keeps working for a callback that stays when another disconnects", async () => {
		const { work, translate, kinds } = setup();
		const first = await work.answer(callback(directed("delay=20")));
		await vi.advanceTimersByTimeAsync(5000);
		const second = await work.answer(callback(directed("delay=20")));
		await first.body?.cancel();
		const text = await settle(second, 15_000);
		expect(JSON.parse(text)).toHaveLength(2);
		expect(translate).toHaveBeenCalledOnce();
		expect(kinds()).toEqual(["received", "received", "joined", "disconnected", "answered"]);
	});

	it("finishes and keeps the work when every callback disconnected", async () => {
		const { work, translate, kinds } = setup();
		const first = await work.answer(callback(directed("delay=20")));
		await first.body?.cancel();
		await vi.advanceTimersByTimeAsync(20_000);
		const retry = await work.answer(callback(directed("delay=20")));
		expect(JSON.parse(await retry.text())).toHaveLength(2);
		expect(translate).toHaveBeenCalledOnce();
		expect(kinds()).toEqual(["received", "disconnected", "received", "replayed"]);
	});
});

describe("keeping", () => {
	it("replays a kept result at once, for 7 days", async () => {
		const { work, translate, events } = setup();
		const first = await settle(await work.answer(callback()));
		const retry = await work.answer(callback());
		expect(await retry.text()).toBe(first.trimStart());
		expect(events.at(-1)).toMatchObject({ event: "replayed", attempt: 2, kept: "result" });
		await vi.advanceTimersByTimeAsync(7 * 24 * 3600 * 1000 - 1);
		await settle(await work.answer(callback()));
		expect(translate).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);
		await settle(await work.answer(callback()));
		expect(translate).toHaveBeenCalledTimes(2);
	});

	it("answers a kept failure at once for 5 minutes, naming it and when a new attempt runs", async () => {
		const { work, translate } = setup();
		const started = Date.now();
		await settle(await work.answer(callback(directed("fail-after=1"))), 1000);
		const retry = await work.answer(callback(directed("fail-after=1")));
		const until = new Date(started + 1000 + 5 * 60 * 1000).toISOString();
		expect(await retry.json()).toEqual({
			error: `stand-in: failed after 1 seconds, as directed (kept; a new attempt runs from ${until})`,
		});
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		await work.answer(callback(directed("fail-after=1")));
		expect(translate).toHaveBeenCalledTimes(2);
	});

	it("has the outcome kept by the time the first answer is written", async () => {
		const answered: Promise<Response>[] = [];
		const translate = vi.fn(standInTranslate);
		const work = createCallbackWork({
			config: () => ({ keys: [KEY], heartbeatMs: 5000, deadlineMs: 3_600_000 }),
			translate,
			// A retry that arrives while the answer is being written, as after a connection lost
			// mid-answer.
			log: (event) => {
				if (event.event === "answered" && answered.length === 0) {
					answered.push(work.answer(callback()));
				}
			},
		});
		await settle(await work.answer(callback()));
		const retry = await answered[0];
		// Answered at once from the kept result: no leading keep-alive space.
		const text = (await retry?.text()) ?? "";
		expect(text.startsWith("[")).toBe(true);
		expect(JSON.parse(text)).toHaveLength(2);
		expect(translate).toHaveBeenCalledOnce();
	});
});

describe("shutdown", () => {
	it("cancels running work, ends held callbacks without an answer and clears its timers", async () => {
		const { work, events } = setup();
		const held = await work.answer(callback(directed("delay=600")));
		const text = held.text();
		work.shutdown();
		await expect(text).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(600_000);
		expect(vi.getTimerCount()).toBe(0);
		expect(events.map((event) => event.event)).not.toContain("answered");
	});

	it("keeps nothing from cancelled work", async () => {
		const { work, translate } = setup();
		await work.answer(callback(directed("delay=600")));
		work.shutdown();
		await vi.advanceTimersByTimeAsync(0);
		await work.answer(callback(directed("delay=600")));
		expect(translate).toHaveBeenCalledTimes(2);
		work.shutdown();
	});
});
