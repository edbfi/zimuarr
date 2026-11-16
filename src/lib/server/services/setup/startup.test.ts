import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { KeyringError } from "#lib/server/security/secrets/keyring.ts";
import { startUp } from "./startup.ts";

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "zimuarr-startup-"));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

const key = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

async function failure(path: string): Promise<ConfigError> {
	try {
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path });
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("startup finished");
}

describe("startUp", () => {
	it("opens and migrates the database at the path", async () => {
		const path = join(root, "data", "app.db");
		await startUp({ ZIMUARR_SECRET_KEY: key(), ZIMUARR_DATABASE_PATH: path });
		expect(await Bun.file(path).exists()).toBe(true);
	});

	it("checks the master key first, so a missing key opens and creates no database", async () => {
		const path = join(root, "no-key", "app.db");
		const error = await startUp({ ZIMUARR_DATABASE_PATH: path }).catch((caught: unknown) => caught);
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

	it("refuses a file that isn't a database, without echoing the path", async () => {
		const path = join(root, "text.db");
		await writeFile(path, "not a database, only text that is long enough to have a header\n");
		const error = await failure(path);
		expect(error.message).toMatch(/^ZIMUARR_DATABASE_PATH names a file that can't be opened/);
		expect(error.message).not.toContain(root);
	});
});
