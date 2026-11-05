import type { BazarrLine } from "./bazarr-lines.ts";

/** What Bazarr's Lingarr translator sends (D20). */
export interface CallbackRequest {
	arrMediaId: number;
	title: string;
	sourceLanguage: string;
	targetLanguage: string;
	mediaType: "Episode" | "Movie";
	lines: BazarrLine[];
	sourceSubtitlePath: string;
	translatedSubtitlePath: string;
}

export type ParsedCallbackRequest =
	| { ok: true; request: CallbackRequest }
	| { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isFilled(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}

/** Checks a parsed JSON body against D20's shape; fields D20 doesn't list are ignored. */
export function parseCallbackRequest(body: unknown): ParsedCallbackRequest {
	if (!isRecord(body)) return { ok: false, reason: "the body is not a JSON object" };
	const fail = (field: string, expected: string): ParsedCallbackRequest => ({
		ok: false,
		reason: `${field} must be ${expected}`,
	});

	const { arrMediaId, title, sourceLanguage, targetLanguage, mediaType, lines } = body;
	const { sourceSubtitlePath, translatedSubtitlePath } = body;
	if (!isPosition(arrMediaId)) return fail("arrMediaId", "a non-negative integer");
	if (typeof title !== "string") return fail("title", "a string");
	if (!isFilled(sourceLanguage)) return fail("sourceLanguage", "a non-empty string");
	if (!isFilled(targetLanguage)) return fail("targetLanguage", "a non-empty string");
	if (mediaType !== "Episode" && mediaType !== "Movie") {
		return fail("mediaType", '"Episode" or "Movie"');
	}
	if (!Array.isArray(lines)) return fail("lines", "a list");
	const positions = new Set<number>();
	for (const entry of lines) {
		if (!isRecord(entry) || !isPosition(entry.position) || !isFilled(entry.line)) {
			return fail("lines", "a list of non-negative integer positions with non-empty lines");
		}
		if (positions.has(entry.position)) return fail("lines", "a list of unique positions");
		positions.add(entry.position);
	}
	if (!isFilled(sourceSubtitlePath)) return fail("sourceSubtitlePath", "a non-empty string");
	if (!isFilled(translatedSubtitlePath))
		return fail("translatedSubtitlePath", "a non-empty string");

	return {
		ok: true,
		request: {
			arrMediaId,
			title,
			sourceLanguage,
			targetLanguage,
			mediaType,
			lines: lines.map(({ position, line }) => ({ position, line })),
			sourceSubtitlePath,
			translatedSubtitlePath,
		},
	};
}
