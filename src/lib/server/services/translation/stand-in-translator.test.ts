import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BazarrLine } from "./bazarr-lines.ts";
import { readDirective, standInTranslate } from "./stand-in-translator.ts";

const lines: BazarrLine[] = [
	{ position: 3, line: "Third." },
	{ position: 1, line: "First." },
];

function withDirective(directive: string): BazarrLine[] {
	return [{ position: 0, line: `zimuarr-spike: ${directive}` }, ...lines];
}

describe("readDirective", () => {
	it("is none without a directive in the first line", () => {
		expect(readDirective(lines)).toEqual({ kind: "none" });
		expect(readDirective([])).toEqual({ kind: "none" });
	});

	it.each([
		["delay=12", { kind: "delay", seconds: 12 }],
		["fail-after=30", { kind: "fail-after", seconds: 30 }],
		["incomplete", { kind: "incomplete" }],
		["empty-line", { kind: "empty-line" }],
		["bare-headers", { kind: "bare-headers" }],
	])("reads %s from the lowest position", (text, directive) => {
		expect(readDirective(withDirective(text))).toEqual(directive);
	});

	it("reads a directive only from the first line", () => {
		expect(readDirective([...lines, { position: 9, line: "zimuarr-spike: incomplete" }])).toEqual({
			kind: "none",
		});
	});

	it("marks an unknown directive as such", () => {
		expect(readDirective(withDirective("delay=soon"))).toEqual({
			kind: "unknown",
			text: "delay=soon",
		});
	});
});

describe("standInTranslate", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const request = { targetLanguage: "da", lines };
	const never = new AbortController().signal;

	it("prefixes every line with the target language, at once", async () => {
		await expect(standInTranslate(request, { kind: "none" }, never)).resolves.toEqual({
			ok: true,
			lines: [
				{ position: 1, line: "[da] First." },
				{ position: 3, line: "[da] Third." },
			],
		});
	});

	it("answers after a delay", async () => {
		const result = standInTranslate(request, { kind: "delay", seconds: 10 }, never);
		const settled = vi.fn();
		void result.then(settled);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toMatchObject({ ok: true });
	});

	it("holds bare-headers for 45 seconds", async () => {
		const settled = vi.fn();
		void standInTranslate(request, { kind: "bare-headers" }, never).then(settled);
		await vi.advanceTimersByTimeAsync(44_999);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
	});

	it("fails after the given time", async () => {
		const result = standInTranslate(request, { kind: "fail-after", seconds: 30 }, never);
		await vi.advanceTimersByTimeAsync(30_000);
		await expect(result).resolves.toEqual({
			ok: false,
			error: "stand-in: failed after 30 seconds, as directed",
		});
	});

	it("drops the last position for incomplete", async () => {
		await expect(standInTranslate(request, { kind: "incomplete" }, never)).resolves.toEqual({
			ok: true,
			lines: [{ position: 1, line: "[da] First." }],
		});
	});

	it("blanks the last line for empty-line", async () => {
		await expect(standInTranslate(request, { kind: "empty-line" }, never)).resolves.toEqual({
			ok: true,
			lines: [
				{ position: 1, line: "[da] First." },
				{ position: 3, line: "" },
			],
		});
	});

	it("fails on an unknown directive", async () => {
		await expect(standInTranslate(request, { kind: "unknown", text: "x" }, never)).resolves.toEqual(
			{ ok: false, error: 'stand-in: unknown directive "x"' },
		);
	});

	it("stops waiting when aborted, rejecting with the abort reason", async () => {
		const controller = new AbortController();
		const result = standInTranslate(request, { kind: "delay", seconds: 60 }, controller.signal);
		controller.abort(new Error("stopped"));
		await expect(result).rejects.toThrow("stopped");
		expect(vi.getTimerCount()).toBe(0);
	});
});
