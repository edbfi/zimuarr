import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Answer, answerBody, heldResponse, immediateAnswer } from "./held-response.ts";

const decoder = new TextDecoder();

/** Reads a body continuously; `take()` returns what arrived since the last call. */
function collect(reader: ReadableStreamDefaultReader<Uint8Array>) {
	let text = "";
	void (async () => {
		for (;;) {
			const next = await reader.read().catch(() => ({ done: true as const, value: undefined }));
			if (next.done) return;
			text += decoder.decode(next.value);
		}
	})();
	return {
		async take(): Promise<string> {
			await vi.advanceTimersByTimeAsync(0);
			const taken = text;
			text = "";
			return taken;
		},
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const success: Answer = { kind: "lines", lines: [{ position: 0, line: "[da] Hej." }] };

describe("answerBody", () => {
	it("writes a list as position and line pairs", () => {
		expect(JSON.parse(answerBody(success))).toEqual([{ position: 0, line: "[da] Hej." }]);
	});

	it("writes a failure as an object naming it", () => {
		expect(JSON.parse(answerBody({ kind: "failure", error: "deadline: too slow" }))).toEqual({
			error: "deadline: too slow",
		});
	});

	it("never writes an empty list", () => {
		expect(JSON.parse(answerBody({ kind: "lines", lines: [] }))).toEqual({
			error: "internal: refused to answer an empty list",
		});
	});
});

describe("immediateAnswer", () => {
	it("answers 200 at once with the body and no caching", async () => {
		const response = immediateAnswer({ kind: "failure", error: "empty: no translatable lines" });
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
		expect(await response.json()).toEqual({ error: "empty: no translatable lines" });
	});
});

describe("heldResponse", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("answers 200 with D25's headers and no length", () => {
		const { response } = heldResponse(new Promise(() => {}), {
			heartbeatMs: 5000,
			bareHeaders: false,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		expect(response.headers.get("content-length")).toBeNull();
	});

	it("leaves out the proxy headers for bare-headers", () => {
		const { response } = heldResponse(new Promise(() => {}), {
			heartbeatMs: 5000,
			bareHeaders: true,
		});
		expect(response.headers.get("cache-control")).toBeNull();
		expect(response.headers.get("x-accel-buffering")).toBeNull();
		expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
	});

	it("writes a space at once and one every heartbeat", async () => {
		const { response } = heldResponse(new Promise(() => {}), {
			heartbeatMs: 5000,
			bareHeaders: false,
		});
		const body = collect(response.body!.getReader());
		expect(await body.take()).toBe(" ");
		await vi.advanceTimersByTimeAsync(4999);
		expect(await body.take()).toBe("");
		await vi.advanceTimersByTimeAsync(1);
		expect(await body.take()).toBe(" ");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await body.take()).toBe("  ");
	});

	it("writes only the first space with the heartbeat off", async () => {
		const { response } = heldResponse(new Promise(() => {}), {
			heartbeatMs: 0,
			bareHeaders: false,
		});
		const body = collect(response.body!.getReader());
		expect(await body.take()).toBe(" ");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await body.take()).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("writes the answer whole after the spaces, then closes and stops the heartbeat", async () => {
		const outcome = deferred<Answer>();
		const ended = vi.fn();
		const { response } = heldResponse(outcome.promise, {
			heartbeatMs: 5000,
			bareHeaders: false,
			onEnd: ended,
		});
		await vi.advanceTimersByTimeAsync(5000);
		outcome.resolve(success);
		const text = await response.text();
		expect(text).toBe(`  ${answerBody(success)}`);
		expect(JSON.parse(text)).toEqual(success.lines);
		expect(vi.getTimerCount()).toBe(0);
		expect(ended).toHaveBeenCalledWith("answered");
	});

	it("writes a failure answer the same way", async () => {
		const outcome = deferred<Answer>();
		const { response } = heldResponse(outcome.promise, { heartbeatMs: 5000, bareHeaders: false });
		outcome.resolve({ kind: "failure", error: "stand-in: failed" });
		expect(JSON.parse(await response.text())).toEqual({ error: "stand-in: failed" });
	});

	it("writes nothing more once the client is gone", async () => {
		const outcome = deferred<Answer>();
		const ended = vi.fn();
		const enqueue = vi.spyOn(ReadableStreamDefaultController.prototype, "enqueue");
		const { response } = heldResponse(outcome.promise, {
			heartbeatMs: 5000,
			bareHeaders: false,
			onEnd: ended,
		});
		const reader = response.body!.getReader();
		await collect(reader).take();
		await reader.cancel();
		const writes = enqueue.mock.calls.length;
		expect(writes).toBeGreaterThan(0);
		await vi.advanceTimersByTimeAsync(20_000);
		outcome.resolve(success);
		await vi.advanceTimersByTimeAsync(0);
		expect(enqueue.mock.calls.length).toBe(writes);
		expect(vi.getTimerCount()).toBe(0);
		expect(ended).toHaveBeenCalledExactlyOnceWith("disconnected");
		enqueue.mockRestore();
	});

	it("ends without an answer when told to, and only once", async () => {
		const ended = vi.fn();
		const held = heldResponse(new Promise(() => {}), {
			heartbeatMs: 5000,
			bareHeaders: false,
			onEnd: ended,
		});
		held.end();
		held.end();
		await expect(held.response.text()).rejects.toThrow();
		expect(vi.getTimerCount()).toBe(0);
		expect(ended).toHaveBeenCalledExactlyOnceWith("ended");
	});

	it("ends without an answer when the outcome fails", async () => {
		const outcome = Promise.reject(new Error("cancelled"));
		const ended = vi.fn();
		const { response } = heldResponse(outcome, {
			heartbeatMs: 5000,
			bareHeaders: false,
			onEnd: ended,
		});
		await expect(response.text()).rejects.toThrow();
		expect(ended).toHaveBeenCalledWith("ended");
	});
});
