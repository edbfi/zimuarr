import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogging } from "./logger.ts";
import { logUnexpectedError } from "./unexpected-error.ts";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	configureLogging({ debug: false });
});

const url = new URL("http://zimuarr.test/setup?token=abcd-efgh-ijkl");
const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("logUnexpectedError", () => {
	it("logs an unknown error as one redacted error entry, with the path but never the query", () => {
		const error = new Error(
			"fetch https://bazarr:6767/api/system/status?apikey=0123456789abcdef failed",
		);
		expect(logUnexpectedError({ kind: "unknown", error, url })).toBeUndefined();

		expect(entries()).toEqual([
			expect.objectContaining({
				level: "error",
				source: "request",
				message: "unexpected error",
				metadata: expect.objectContaining({ kind: "unknown", status: 500, path: "/setup" }),
			}),
		]);
		const [entry] = entries();
		const logged = (entry?.metadata as { error: { message: string } } | undefined)?.error;
		expect(logged?.message).toBe(
			"fetch https://bazarr:6767/api/system/status?apikey=[redacted] failed",
		);
		expect(lines[0]).not.toContain("0123456789abcdef");
		expect(lines[0]).not.toContain("abcd-efgh-ijkl");
		expect(console.error).not.toHaveBeenCalled();
	});

	it("logs an unknown error at error level even when it carries a status of its own", () => {
		logUnexpectedError({ kind: "unknown", error: { status: 404 }, url });
		expect(entries()).toEqual([expect.objectContaining({ level: "error" })]);
	});

	it("logs SvelteKit's own errors below 500, such as a 404, only at debug level", () => {
		const notFound = { kind: "framework", error: { status: 404, message: "Not Found" }, url };
		logUnexpectedError(notFound);
		logUnexpectedError({ kind: "app", error: { message: "Not Found" }, url });
		expect(lines).toHaveLength(0);

		configureLogging({ debug: true });
		logUnexpectedError(notFound);
		expect(entries()).toEqual([
			expect.objectContaining({
				level: "debug",
				metadata: expect.objectContaining({ kind: "framework", status: 404, path: "/setup" }),
			}),
		]);
	});

	it("logs SvelteKit's own errors of 500 or more at error level", () => {
		logUnexpectedError({ kind: "framework", error: { status: 503, message: "x" }, url });
		expect(entries()).toEqual([expect.objectContaining({ level: "error" })]);
	});
});
