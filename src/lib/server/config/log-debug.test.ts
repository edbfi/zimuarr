import { describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { readLogDebug } from "./log-debug.ts";

describe("readLogDebug", () => {
	it("is off when unset or empty", () => {
		expect(readLogDebug({})).toBe(false);
		expect(readLogDebug({ ZIMUARR_LOG_DEBUG: "" })).toBe(false);
	});

	it("reads true and false", () => {
		expect(readLogDebug({ ZIMUARR_LOG_DEBUG: "true" })).toBe(true);
		expect(readLogDebug({ ZIMUARR_LOG_DEBUG: "false" })).toBe(false);
	});

	it.each(["yes", "1", "TRUE", " true", "on"])("refuses %j without echoing it", (value) => {
		let error: unknown;
		try {
			readLogDebug({ ZIMUARR_LOG_DEBUG: value });
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("ZIMUARR_LOG_DEBUG");
		expect((error as ConfigError).message).toBe("ZIMUARR_LOG_DEBUG must be true or false");
	});
});
