import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, Database } from "@tursodatabase/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { KeyringError } from "#lib/server/security/secrets/keyring.ts";
import * as firstRun from "./first-run.ts";
import {
	closeServices,
	currentDatabase,
	handleShutdown,
	type ShutdownTarget,
	startUp,
} from "./startup.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "zimuarr-startup-"));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

/** What startup wrote to standard output during the current test. */
let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		// `flushLogs` waits for each entry's write callback, so the mock calls it.
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(async () => {
	// A test's startup leaves its database open and its token timer running; both are stopped.
	firstRun.stopFirstRun();
	await closeServices();
	vi.restoreAllMocks();
});

const key = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

async function failure(path: string): Promise<ConfigError> {
	try {
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("startup finished");
}

describe("startUp", () => {
	it("opens and migrates the database at the path", async () => {
		const path = join(root, "data", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		// Turso creates the file on open, so the tables are what show the migrations ran.
		const db = await connect(path);
		try {
			const tables = (await (
				await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			).all()) as { name: string }[];
			expect(tables.map((row) => row.name)).toEqual(
				expect.arrayContaining(["__drizzle_migrations", "owner", "settings"]),
			);
		} finally {
			db.close();
		}
	});

	it("checks the master key first, so a missing key opens and creates no database", async () => {
		const path = join(root, "no-key", "app.db");
		const error = await startUp({ ZIMUARR_DATABASE_PATH: path }, { dev: true }).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(KeyringError);
		// `Bun.file().exists()` is false for any folder, so the folder is checked with `stat`.
		await expect(stat(join(root, "no-key"))).rejects.toThrow();
	});

	it("checks the configuration before the database, so a bad path opens nothing", async () => {
		const file = join(root, "a-file");
		await writeFile(file, "");
		const error = await failure(join(file, "data", "app.db"));
		expect(error.variable).toBe("ZIMUARR_DATABASE_PATH");
		expect(error.message).toMatch(/names a folder that can't be created/);
	});

	// Turso's own messages hold the path, so startup replaces them.
	it("refuses a path that is a directory, naming the variable but not the path", async () => {
		const path = join(root, "a-directory");
		await mkdir(path);
		const error = await failure(path);
		expect(error.message).toBe(
			"ZIMUARR_DATABASE_PATH names a file that can't be opened as a database (I/O error (open): is a directory)",
		);
	});

	it("logs a failed step as one error entry before throwing it", async () => {
		const path = join(root, "logged-directory");
		await mkdir(path);
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true }).catch(
			() => {},
		);
		expect(lines).toHaveLength(1);
		const entry = JSON.parse(lines[0] ?? "");
		expect(entry).toMatchObject({
			level: "error",
			source: "startup",
			message: "startup failed",
			metadata: { error: { name: "ConfigError" } },
		});
		expect(lines[0]).not.toContain(root);
	});

	it("lets the failure's entry leave before throwing, even behind a slow reader", async () => {
		vi.restoreAllMocks();
		const pending: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done !== undefined) pending.push(done);
			return true;
		});
		const path = join(root, "slow-directory");
		await mkdir(path);
		let settled = false;
		const run = startUp(
			{ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path },
			{ dev: true },
		).catch(() => {
			settled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(pending).toHaveLength(1);
		expect(settled).toBe(false);
		for (const done of pending) done();
		await run;
		expect(settled).toBe(true);
	});

	it("refuses a ZIMUARR_LOG_DEBUG that isn't true or false, before the database opens", async () => {
		const path = join(root, "never-created", "app.db");
		const error = await startUp(
			{
				ZIMUARR_SECRET_KEY: key(),
				ZIMUARR_DATABASE_PATH: path,
				ZIMUARR_LOG_DEBUG: "yes",
			},
			{ dev: true },
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("ZIMUARR_LOG_DEBUG");
		await expect(stat(join(root, "never-created"))).rejects.toThrow();
	});

	it("refuses a bad ORIGIN before the database opens", async () => {
		const path = join(root, "origin-never-created", "app.db");
		const error = await startUp(
			{ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path, ORIGIN: "https://host/app" },
			{ dev: true },
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as ConfigError).variable).toBe("ORIGIN");
		await expect(stat(join(root, "origin-never-created"))).rejects.toThrow();
	});

	it("refuses a file that isn't a database, without echoing the path", async () => {
		const path = join(root, "text.db");
		await writeFile(path, "not a database, only text that is long enough to have a header\n");
		const error = await failure(path);
		expect(error.message).toMatch(/^ZIMUARR_DATABASE_PATH names a file that can't be opened/);
		expect(error.message).not.toContain(root);
	});
});

/** A stand-in for the process: it records the signals sent, and the exit code in `steps`. */
function fakeProcess(steps: string[] = []) {
	const events = new EventEmitter();
	const sent: string[] = [];
	let exitCode: number | undefined;
	const target: ShutdownTarget = {
		pid: 4242,
		on: (event, listener) => events.on(event, listener),
		once: (event, listener) => events.once(event, listener),
		kill: (pid, signal) => {
			sent.push(`${pid} ${signal}`);
			return true;
		},
		exit: (code) => {
			exitCode = code;
			steps.push(`exit ${code}`);
		},
	};
	return { target, events, sent, exitCode: () => exitCode };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("handleShutdown", () => {
	it("stops the work on SIGTERM and SIGINT, while adapter-bun drains", () => {
		const fake = fakeProcess();
		const stopped: string[] = [];
		handleShutdown(fake.target, async () => {}, { stopWork: () => stopped.push("stopped") });
		fake.events.emit("SIGTERM");
		fake.events.emit("SIGINT");
		expect(stopped).toEqual(["stopped", "stopped"]);
	});

	it("passes SIGHUP on as SIGTERM, which adapter-bun drains on", () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {});
		fake.events.emit("SIGHUP");
		expect(fake.sent).toEqual(["4242 SIGTERM"]);
	});

	it("exits 0 only after the cleanup on sveltekit:shutdown has finished", async () => {
		const steps: string[] = [];
		const fake = fakeProcess(steps);
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						steps.push("cleaned up");
						resolve();
					};
				}),
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(20);
		expect(steps).toEqual([]);
		finish();
		await settle(20);
		expect(steps).toEqual(["cleaned up", "exit 0"]);
	});

	it("exits non-zero when the cleanup never finishes by the deadline", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 100 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(50);
		expect(fake.exitCode()).toBeUndefined();
		await settle(500);
		expect(fake.exitCode()).toBe(1);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
	});

	it("exits non-zero once the deadline has fired, even if the cleanup finishes during its flush", async () => {
		// Hold every log write, so the deadline's bounded flush is still waiting when the cleanup ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			{ deadlineMs: 50 },
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
		finish();
		for (const release of held.splice(0)) release();
		await settle(50);
		expect(fake.exitCode()).toBe(1);
	});

	it("bounds the deadline's own flush, so a stuck stdout can't hold the exit", async () => {
		// Every write stays held, as if nothing read standard output, until the test ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 50 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		try {
			await settle(150);
			expect(fake.exitCode()).toBeUndefined();
			await settle(400);
			expect(fake.exitCode()).toBe(1);
		} finally {
			// The logger counts unfinished writes, so a held one would stall later flushes.
			for (const release of held.splice(0)) release();
		}
	});

	it("exits non-zero when the cleanup fails", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {
			throw new Error("close failed");
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(fake.exitCode()).toBe(1);
	});
});

describe("startUp's shutdown", () => {
	const watched = ["SIGHUP", "SIGTERM", "SIGINT", "sveltekit:shutdown"] as const;
	const counts = () => watched.map((event) => process.listenerCount(event));

	it("installs no handler in dev, where Ctrl+C must still end the dev server", async () => {
		const before = counts();
		await startUp(
			{ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: join(root, "dev", "app.db") },
			{ dev: true },
		);
		expect(counts()).toEqual(before);
		await closeServices();
	});

	it("installs the handlers in the built server, after adapter-bun's own", async () => {
		const before = watched.map((event) => process.listeners(event));
		await startUp(
			{ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: join(root, "built", "app.db") },
			{ dev: false },
		);
		try {
			// adapter-bun registers its handlers synchronously once `init` resolves; the app's come
			// on the next turn of the event loop, so a signal never reaches only the app's.
			expect(counts()).toEqual(before.map((listeners) => listeners.length));
			await new Promise((resolve) => setImmediate(resolve));
			expect(counts()).toEqual(before.map((listeners) => listeners.length + 1));
		} finally {
			watched.forEach((event, index) => {
				for (const listener of process.listeners(event)) {
					if (!before[index]?.includes(listener)) process.removeListener(event, listener);
				}
			});
			await closeServices();
		}
	});

	it("closeServices logs a failed close, flushes, and finishes, so the stop still exits 0", async () => {
		vi.spyOn(Database.prototype, "close").mockRejectedValueOnce(new Error("disk went away"));
		const path = join(root, "close-fails", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		await expect(closeServices()).resolves.toBeUndefined();
		const entry = JSON.parse(lines.find((line) => line.includes("closing the database")) ?? "{}");
		expect(entry).toMatchObject({
			level: "error",
			metadata: { error: { message: "disk went away" } },
		});
	});

	it("closeServices finishes the close before it flushes, and the flush before it returns", async () => {
		const path = join(root, "order", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		let closed!: () => void;
		vi.spyOn(Database.prototype, "close").mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					closed = resolve;
				}),
		);
		// From here, each entry's write waits until `release` runs, like a slow reader.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		let finished = false;
		const closing = closeServices().then(() => {
			finished = true;
		});
		await settle(20);
		expect(finished).toBe(false);
		createLogger("test").info("written while closing");
		closed();
		await settle(20);
		expect(finished).toBe(false);
		for (const release of held.splice(0)) release();
		await closing;
		expect(finished).toBe(true);
	});

	it("prints one bootstrap token after migrating a fresh database, as step 4", async () => {
		const path = join(root, "token", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		const tokens = lines.filter((line) => line.startsWith("Setup token: "));
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toContain("Open /setup to claim this Zimuarr.");
		expect(firstRun.isClaimed()).toBe(false);
	});

	it("stops the token's timer on the shutdown signal", async () => {
		const stop = vi.spyOn(firstRun, "stopFirstRun");
		const watched = ["SIGHUP", "SIGTERM", "SIGINT", "sveltekit:shutdown"] as const;
		const before = watched.map((event) => process.listeners(event));
		await startUp(
			{ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: join(root, "stop", "app.db") },
			{ dev: false },
		);
		await new Promise((resolve) => setImmediate(resolve));
		try {
			const added = process
				.listeners("SIGTERM")
				.filter((listener) => !before[1]?.includes(listener));
			expect(added).toHaveLength(1);
			stop.mockClear();
			added[0]?.("SIGTERM");
			expect(stop).toHaveBeenCalledTimes(1);
		} finally {
			watched.forEach((event, index) => {
				for (const listener of process.listeners(event)) {
					if (!before[index]?.includes(listener)) process.removeListener(event, listener);
				}
			});
		}
	});

	it("currentDatabase gives the database startup opened, and throws before and after it", async () => {
		expect(() => currentDatabase()).toThrow("before startup opened it");
		const path = join(root, "current", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		expect(await currentDatabase().$client.prepare("SELECT 1")).toBeDefined();
		await closeServices();
		expect(() => currentDatabase()).toThrow("before startup opened it");
	});

	it("closeServices closes the database startup opened, once", async () => {
		const close = vi.spyOn(Database.prototype, "close");
		const path = join(root, "closed", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path }, { dev: true });
		await closeServices();
		await closeServices();
		expect(close).toHaveBeenCalledTimes(1);
	});
});
