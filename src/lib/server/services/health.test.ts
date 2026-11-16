import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "@tursodatabase/database";
import { drizzle } from "drizzle-orm/tursodatabase/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import { createHealthCheck, HEALTH_KEY, healthResponse, probeDatabase } from "./health.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "zimuarr-health-"));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

/** What the health check logged during the current test. */
let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

async function newDatabase(name: string): Promise<Database> {
	const db = await openDatabase(join(root, name));
	await migrateDatabase(db);
	return db;
}

describe("probeDatabase", () => {
	it("writes its own row, commits it and reads it back", async () => {
		const db = await newDatabase("probe.db");
		try {
			await probeDatabase(db, new Date(1_700_000_000_000));
			expect(await readSetting(db, "health.checked_at")).toBe("2023-11-14T22:13:20.000Z");
		} finally {
			await db.$client.close();
		}
	});

	it("fails on a database it can read but not write", async () => {
		const path = join(root, "read-only.db");
		const writable = await newDatabase("read-only.db");
		await writable.$client.close();
		const db = drizzle({ client: await connect(path, { readonly: true }) });
		try {
			expect(await readSetting(db, HEALTH_KEY)).toBeUndefined();
			await expect(probeDatabase(db, new Date())).rejects.toThrow();
			const check = createHealthCheck({ probe: () => probeDatabase(db, new Date()) });
			expect(await check()).toBe(false);
		} finally {
			await db.$client.close();
		}
	});

	it("fails on a database that is closed", async () => {
		const db = await newDatabase("closed.db");
		await db.$client.close();
		await expect(probeDatabase(db, new Date())).rejects.toThrow();
	});
});

describe("healthResponse", () => {
	it("answers ok, or unavailable with 503, as plain text that is never cached", async () => {
		const ok = healthResponse(true);
		expect(ok.status).toBe(200);
		expect(await ok.text()).toBe("ok");
		const down = healthResponse(false);
		expect(down.status).toBe(503);
		expect(await down.text()).toBe("unavailable");
		for (const response of [ok, down]) {
			expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
	});
});

describe("createHealthCheck", () => {
	it("is healthy on a working database, and unhealthy once it is closed", async () => {
		const db = await newDatabase("working.db");
		const check = createHealthCheck({ probe: () => probeDatabase(db, new Date()), windowMs: 0 });
		expect(await check()).toBe(true);
		await db.$client.close();
		expect(await check()).toBe(false);
	});

	it("shares one probe between the requests within the window, and probes again after it", async () => {
		vi.useFakeTimers();
		const probe = vi.fn(async () => {});
		const check = createHealthCheck({ probe });
		expect(await Promise.all([check(), check(), check()])).toEqual([true, true, true]);
		expect(probe).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(4999);
		expect(await check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(await check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("never reuses a success past the window: a failing probe after it is unhealthy", async () => {
		vi.useFakeTimers();
		let failing = false;
		const check = createHealthCheck({
			probe: async () => {
				if (failing) throw new Error("disk full");
			},
		});
		expect(await check()).toBe(true);
		failing = true;
		vi.advanceTimersByTime(5000);
		expect(await check()).toBe(false);
	});

	it("answers unhealthy after 3 seconds from a probe that never answers", async () => {
		vi.useFakeTimers();
		const check = createHealthCheck({ probe: () => new Promise(() => {}) });
		const answer = check();
		await vi.advanceTimersByTimeAsync(2999);
		let settled = false;
		void answer.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await answer).toBe(false);
	});

	it("starts no second probe while one that timed out is still pending, even past the window", async () => {
		vi.useFakeTimers();
		const probe = vi.fn(() => new Promise<void>(() => {}));
		const check = createHealthCheck({ probe });
		const first = check();
		await vi.advanceTimersByTimeAsync(3000);
		expect(await first).toBe(false);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await check()).toBe(false);
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it("probes again once a hung probe finally settles", async () => {
		vi.useFakeTimers();
		let release!: () => void;
		const probe = vi
			.fn<() => Promise<void>>()
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						release = resolve;
					}),
			)
			.mockResolvedValue(undefined);
		const check = createHealthCheck({ probe });
		const first = check();
		await vi.advanceTimersByTimeAsync(3000);
		expect(await first).toBe(false);
		release();
		await vi.advanceTimersByTimeAsync(5000);
		expect(await check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("is unhealthy, and probes again later, when the probe throws before it returns a promise", async () => {
		vi.useFakeTimers();
		let open = false;
		const probe = vi.fn((): Promise<void> => {
			if (!open) throw new Error("the database is used before startup opened it");
			return Promise.resolve();
		});
		const check = createHealthCheck({ probe });
		expect(await check()).toBe(false);
		open = true;
		await vi.advanceTimersByTimeAsync(5000);
		expect(await check()).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("logs each change of state once, not every probe", async () => {
		let failing = false;
		const check = createHealthCheck({
			probe: async () => {
				if (failing) throw new Error("database is locked");
			},
			windowMs: 0,
		});
		await check();
		failing = true;
		await check();
		await check();
		failing = false;
		await check();
		await check();
		expect(entries().map(({ level, message }) => ({ level, message }))).toEqual([
			{ level: "error", message: "health check failing" },
			{ level: "info", message: "health check passing again" },
		]);
		expect(JSON.stringify(entries()[0])).toContain("database is locked");
	});
});
