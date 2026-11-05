import { describe, expect, it } from "vitest";
import { bazarrLines, linesFingerprint } from "./bazarr-lines.ts";

/** One SRT cue: its index, a fixed timing line and its text lines. */
function cue(index: number, ...text: string[]): string {
	return `${index}\n00:00:0${index % 10},000 --> 00:00:0${index % 10},500\n${text.join("\n")}\n\n`;
}

describe("bazarrLines", () => {
	it("gives each cue's text with its position, counted from 0", () => {
		expect(bazarrLines(cue(1, "Hello.") + cue(2, "World."))).toEqual([
			{ position: 0, line: "Hello." },
			{ position: 1, line: "World." },
		]);
	});

	it("keeps a multi-line cue as one line with line breaks", () => {
		expect(bazarrLines(cue(1, "First line,", "second line."))).toEqual([
			{ position: 0, line: "First line,\nsecond line." },
		]);
	});

	it("leaves out blank cues but still counts their positions", () => {
		const srt = `${cue(1, "One.")}2\n00:00:02,000 --> 00:00:02,500\n\n${cue(3, "Three.")}`;
		expect(bazarrLines(srt)).toEqual([
			{ position: 0, line: "One." },
			{ position: 2, line: "Three." },
		]);
	});

	it("leaves out a cue whose text is only markup", () => {
		expect(bazarrLines(cue(1, "<i></i>{\\an8}") + cue(2, "Two."))).toEqual([
			{ position: 1, line: "Two." },
		]);
	});

	it("reads CRLF and lone CR line ends as line breaks", () => {
		const srt =
			"1\r\n00:00:01,000 --> 00:00:01,500\r\nA\r\nB\r\n\r\n2\r00:00:02,000 --> 00:00:02,500\rC\r";
		expect(bazarrLines(srt)).toEqual([
			{ position: 0, line: "A\nB" },
			{ position: 1, line: "C" },
		]);
	});

	it("drops a byte-order mark, which sits on the first index line", () => {
		expect(bazarrLines(`\uFEFF${cue(1, "Hi.")}`)).toEqual([{ position: 0, line: "Hi." }]);
	});

	it("reads a file without a final line break", () => {
		expect(bazarrLines("1\n00:00:01,000 --> 00:00:01,500\nLast")).toEqual([
			{ position: 0, line: "Last" },
		]);
	});

	it("starts a cue only at a line with exactly two timestamps", () => {
		const srt = "1\n00:00:01,000 --> 00:00:01,500\nAt 00:00:05,000 sharp\n\n";
		expect(bazarrLines(srt)).toEqual([{ position: 0, line: "At 00:00:05,000 sharp" }]);
	});

	it("accepts timestamps with a dot and short fields", () => {
		expect(bazarrLines("1\n0:0:1.5 --> 0:0:2.25\nShort\n")).toEqual([
			{ position: 0, line: "Short" },
		]);
	});

	it("ignores text before the first timestamp line", () => {
		expect(bazarrLines(`stray header\n\n${cue(1, "Hi.")}`)).toEqual([{ position: 0, line: "Hi." }]);
	});

	it("strips Python's whitespace around a cue, not JavaScript's", () => {
		// U+001C and U+0085 are whitespace to Python's strip(); U+FEFF is whitespace only to trim().
		expect(bazarrLines(cue(1, "\u001C\u0085 Kept\uFEFF \u3000"))).toEqual([
			{ position: 0, line: "Kept\uFEFF" },
		]);
	});

	it("leaves out a cue that is only Python whitespace", () => {
		expect(bazarrLines(cue(1, "\u001F\u0085 ") + cue(2, "Two."))).toEqual([
			{ position: 1, line: "Two." },
		]);
	});

	it("keeps a cue that is only U+FEFF, which Python doesn't strip", () => {
		expect(bazarrLines(cue(1, "\uFEFF"))).toEqual([{ position: 0, line: "\uFEFF" }]);
	});

	it("drops a final line of only digits, which pysubs2 takes for the next index", () => {
		expect(bazarrLines(cue(1, "The year was", "1984"))).toEqual([
			{ position: 0, line: "The year was" },
		]);
	});

	it("drops a final line of Unicode digits too", () => {
		expect(bazarrLines(cue(1, "Number", "١٢"))).toEqual([{ position: 0, line: "Number" }]);
	});

	it("keeps a cue that is only digits on one line", () => {
		expect(bazarrLines(cue(1, "1984"))).toEqual([{ position: 0, line: "1984" }]);
	});

	it("reads blank lines then a number as an empty cue", () => {
		const srt = "1\n00:00:01,000 --> 00:00:01,500\n\n2\n00:00:02,000 --> 00:00:02,500\nTwo.\n";
		expect(bazarrLines(srt)).toEqual([{ position: 1, line: "Two." }]);
	});

	it("removes the four style tags, spaces inside them included", () => {
		expect(bazarrLines(cue(1, "<i>a</i> < b >b< / b > <u>c</u> <s>d</s>"))).toEqual([
			{ position: 0, line: "a b c d" },
		]);
	});

	it("removes other HTML tags", () => {
		expect(bazarrLines(cue(1, '<font color="#ff0000">Red</font> <br/>x'))).toEqual([
			{ position: 0, line: "Red x" },
		]);
	});

	it("removes a tag that spans two lines", () => {
		expect(bazarrLines(cue(1, "<font", 'color="red">Red</font>'))).toEqual([
			{ position: 0, line: "Red" },
		]);
	});

	it("keeps a < that doesn't start a tag", () => {
		expect(bazarrLines(cue(1, "1 < 2 and 3 > 2"))).toEqual([
			{ position: 0, line: "1 < 2 and 3 > 2" },
		]);
	});

	it("removes {…} blocks, the style tags' own blocks included", () => {
		// <i> becomes {\i1}, so a { opened before it closes at that block's }.
		expect(bazarrLines(cue(1, "{\\an8}Top {comment}text", "x{<i>y</i>z"))).toEqual([
			{ position: 0, line: "Top text\nxyz" },
		]);
	});

	it("reads \\N and \\n as line breaks and \\h as a space", () => {
		expect(bazarrLines(cue(1, "One\\NTwo\\nThree\\hFour"))).toEqual([
			{ position: 0, line: "One\nTwo\nThree Four" },
		]);
	});

	it("keeps Unicode text as it is", () => {
		const text = "你好 👋🏽 é שלום";
		expect(bazarrLines(cue(1, text))).toEqual([{ position: 0, line: text }]);
	});

	it("keeps a zero-length cue", () => {
		expect(bazarrLines("1\n00:00:01,000 --> 00:00:01,000\nInstant\n")).toEqual([
			{ position: 0, line: "Instant" },
		]);
	});
});

describe("linesFingerprint", () => {
	const lines = [
		{ position: 0, line: "A" },
		{ position: 2, line: "B" },
	];

	it("is the SHA-256 of the position and line pairs in position order", () => {
		expect(linesFingerprint(lines)).toMatch(/^[0-9a-f]{64}$/);
		expect(linesFingerprint([...lines].reverse())).toBe(linesFingerprint(lines));
	});

	it("changes with a line's text or position", () => {
		expect(linesFingerprint([{ position: 0, line: "A" }])).not.toBe(
			linesFingerprint([{ position: 1, line: "A" }]),
		);
		expect(linesFingerprint([{ position: 0, line: "A" }])).not.toBe(
			linesFingerprint([{ position: 0, line: "a" }]),
		);
	});
});
