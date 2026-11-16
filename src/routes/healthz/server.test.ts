import { afterEach, describe, expect, it, vi } from "vitest";
import * as health from "#lib/server/services/health.ts";
import { GET } from "./+server.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

// The handler reads nothing from the request event.
const get = () => GET({} as Parameters<typeof GET>[0]);

describe("GET /healthz", () => {
	it("answers ok while the health check passes", async () => {
		vi.spyOn(health, "checkHealth").mockResolvedValue(true);
		const response = await get();
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("answers 503 unavailable while it fails", async () => {
		vi.spyOn(health, "checkHealth").mockResolvedValue(false);
		const response = await get();
		expect(response.status).toBe(503);
		expect(await response.text()).toBe("unavailable");
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
	});
});
