import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { languageName } from "./language-name.ts";

/**
 * Runs `name` inside the middleware for a request that asks for `acceptLanguage`, so the
 * language comes from the request, as in the app, and returns what it named.
 */
async function inRequest(acceptLanguage: string, name: () => string): Promise<string> {
	const request = new Request("http://localhost/", {
		headers: { "accept-language": acceptLanguage },
	});
	let text = "";
	await paraglideMiddleware(request, () => {
		text = name();
		return new Response();
	});
	return text;
}

// D20's codes: two-letter ones, and the three regional tags Bazarr sends. `ff` is named differently
// in `en-GB` ("Fulah") and `en` ("Fula"), so it shows that English names come from `en-GB`.
describe.each([
	{
		language: "en",
		acceptLanguage: "en-US,en;q=0.9",
		names: {
			sv: "Swedish",
			da: "Danish",
			"zh-CN": "Chinese (China)",
			"zh-TW": "Chinese (Taiwan)",
			"pt-BR": "Brazilian Portuguese",
			ff: "Fulah",
			SV: "Swedish",
		},
	},
	{
		language: "da",
		acceptLanguage: "da-DK,da;q=0.9",
		names: {
			sv: "svensk",
			da: "dansk",
			"zh-CN": "kinesisk (Kina)",
			"zh-TW": "kinesisk (Taiwan)",
			"pt-BR": "brasiliansk portugisisk",
			ff: "fulah",
			SV: "svensk",
		},
	},
])("a request in $language", ({ acceptLanguage, names }) => {
	const name = (code: string) => inRequest(acceptLanguage, () => languageName(code));

	it.each(Object.entries(names))("names %s as %s, unchanged", async (code, want) => {
		expect(await name(code)).toBe(want);
	});

	// A malformed tag makes Intl.DisplayNames throw; an unknown one has no name. Neither breaks.
	it.each(["", "not a code", "e", "xx-yy", "XX"])(
		"gives %j back exactly as given",
		async (code) => {
			expect(await name(code)).toBe(code);
		},
	);
});
