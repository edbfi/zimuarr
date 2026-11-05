import { describe, expect, it } from "vitest";
import { parseCallbackRequest } from "./callback-request.ts";

const valid = {
	arrMediaId: 12,
	title: "Show · Show - S01E01.en.srt",
	sourceLanguage: "en",
	targetLanguage: "pt-BR",
	mediaType: "Episode",
	lines: [
		{ position: 0, line: "Hello." },
		{ position: 2, line: "World." },
	],
	sourceSubtitlePath: "/media/tv/Show/Show - S01E01.en.srt",
	translatedSubtitlePath: "/media/tv/Show/Show - S01E01.pt-BR.srt",
};

function without(field: keyof typeof valid): Record<string, unknown> {
	const { [field]: _, ...rest } = valid;
	return rest;
}

describe("parseCallbackRequest", () => {
	it("accepts the D20 shape and returns its fields", () => {
		expect(parseCallbackRequest(valid)).toEqual({ ok: true, request: valid });
	});

	it("accepts a movie, an id of 0 and an empty lines list", () => {
		const movie = { ...valid, mediaType: "Movie", arrMediaId: 0, lines: [] };
		expect(parseCallbackRequest(movie)).toEqual({ ok: true, request: movie });
	});

	it("ignores fields D20 doesn't list", () => {
		expect(parseCallbackRequest({ ...valid, extra: true })).toEqual({ ok: true, request: valid });
	});

	it.each([null, [], "text", 3])("refuses a body that isn't an object: %j", (body) => {
		expect(parseCallbackRequest(body).ok).toBe(false);
	});

	it.each(Object.keys(valid) as (keyof typeof valid)[])("refuses a body without %s", (field) => {
		const result = parseCallbackRequest(without(field));
		expect(result).toEqual({ ok: false, reason: expect.stringContaining(field) });
	});

	it.each([
		["arrMediaId", "12"],
		["arrMediaId", -1],
		["arrMediaId", 1.5],
		["title", 1],
		["sourceLanguage", ""],
		["targetLanguage", null],
		["mediaType", "Series"],
		["mediaType", "episode"],
		["lines", {}],
		["sourceSubtitlePath", ""],
		["translatedSubtitlePath", 5],
	])("refuses %s = %j", (field, value) => {
		const result = parseCallbackRequest({ ...valid, [field]: value });
		expect(result).toEqual({ ok: false, reason: expect.stringContaining(field) });
	});

	it.each([
		["a line that isn't an object", ["Hello."]],
		["a position that isn't an integer", [{ position: "0", line: "a" }]],
		["a negative position", [{ position: -1, line: "a" }]],
		["a fractional position", [{ position: 0.5, line: "a" }]],
		["an empty line", [{ position: 0, line: "" }]],
		["a line that isn't a string", [{ position: 0, line: 3 }]],
		[
			"a repeated position",
			[
				{ position: 1, line: "a" },
				{ position: 1, line: "b" },
			],
		],
	])("refuses lines with %s", (_, lines) => {
		const result = parseCallbackRequest({ ...valid, lines });
		expect(result).toEqual({ ok: false, reason: expect.stringContaining("lines") });
	});
});
