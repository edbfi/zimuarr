import { createHash } from "node:crypto";

/** One line Bazarr sends: the cue's position among every cue of the file, and its plain text. */
export interface BazarrLine {
	position: number;
	line: string;
}

// Bazarr 1.6.2 loads an SRT with its vendored pysubs2 1.8.1 (`formats/subrip.py`), takes each cue's
// `plaintext` (`ssaevent.py`) and leaves out the cues whose Python `strip()` is empty
// (`lingarr_translator.py`). This replicates those steps exactly. Python's whitespace (`str.strip()`
// and `\s`) and digits (`\d`) differ from JavaScript's, so both are spelled out.
const PY_SPACE =
	"\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "gu");
const ONLY_SPACE = new RegExp(`^[${PY_SPACE}]*$`, "u");
const ONLY_NUMBER = new RegExp(`^[${PY_SPACE}]*\\p{Nd}+[${PY_SPACE}]*$`, "u");
const TIMESTAMP = /(\p{Nd}{1,2}):(\p{Nd}{1,2}):(\p{Nd}{1,2})[.,](\p{Nd}{1,3})/gu;
const NEXT_INDEX = /\n+ *\p{Nd}+ *$/u;
const STYLE_TAGS: ReadonlyArray<readonly [RegExp, string]> = ["i", "s", "u", "b"].flatMap((tag) => [
	[new RegExp(`< *${tag} *>`, "g"), `{\\${tag}1}`] as const,
	[new RegExp(`< */ *${tag} *>`, "g"), `{\\${tag}0}`] as const,
]);
const OTHER_TAG = /< *\/? *[a-zA-Z][^>]*>/g;
const OVERRIDE_BLOCK = /\{[^}]*\}/g;

function pyStrip(text: string): string {
	return text.replace(PY_STRIP, "");
}

/** pysubs2's `prepare_text`: one cue's raw lines (each with its `\n`) to SubStation text. */
function prepareText(lines: readonly string[]): string {
	if (
		lines.length >= 2 &&
		lines.slice(0, -1).every((line) => ONLY_SPACE.test(line)) &&
		ONLY_NUMBER.test(lines.at(-1) ?? "")
	) {
		return "";
	}
	let text = pyStrip(lines.join("")).replace(NEXT_INDEX, "");
	for (const [pattern, replacement] of STYLE_TAGS) text = text.replace(pattern, replacement);
	return text.replace(OTHER_TAG, "").replaceAll("\n", "\\N");
}

/** pysubs2's `SSAEvent.plaintext`. */
function plaintext(text: string): string {
	return text
		.replace(OVERRIDE_BLOCK, "")
		.replaceAll("\\h", " ")
		.replaceAll("\\n", "\n")
		.replaceAll("\\N", "\n");
}

/**
 * The lines Bazarr sends for an SRT file's text, decoded from UTF-8 with any byte-order mark kept
 * (Bazarr reads with `utf-8`, not `utf-8-sig`).
 */
export function bazarrLines(srt: string): BazarrLine[] {
	// Python's text mode reads `\r\n` and a lone `\r` as `\n`, then iterates lines with their `\n`.
	const fileLines = srt.replace(/\r\n?/g, "\n").match(/[^\n]*\n|[^\n]+/g) ?? [];
	const cues: string[][] = [];
	for (const line of fileLines) {
		if ([...line.matchAll(TIMESTAMP)].length === 2) cues.push([]);
		else cues.at(-1)?.push(line);
	}
	return cues.flatMap((cue, position) => {
		const line = plaintext(prepareText(cue));
		return pyStrip(line) === "" ? [] : [{ position, line }];
	});
}

/** SHA-256 (hex) of the lines as `[position, line]` pairs in position order. */
export function linesFingerprint(lines: readonly BazarrLine[]): string {
	const pairs = [...lines]
		.sort((a, b) => a.position - b.position)
		.map(({ position, line }) => [position, line]);
	return createHash("sha256").update(JSON.stringify(pairs)).digest("hex");
}
