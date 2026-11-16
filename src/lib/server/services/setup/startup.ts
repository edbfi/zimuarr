import { ConfigError } from "#lib/server/config/config-error.ts";
import {
	type DatabasePathEnv,
	databasePathSubject,
	readDatabasePath,
} from "#lib/server/config/database-path.ts";
import { type LogDebugEnv, readLogDebug } from "#lib/server/config/log-debug.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { configureLogging, createLogger, flushLogs } from "#lib/server/logging/logger.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabasePathEnv & LogDebugEnv;

const log = createLogger("startup");

/** How long a failed startup waits for its entry to leave, in case standard output is stuck. */
const FAILURE_FLUSH_MS = 1000;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"): the master key, the configuration, then the database, opened and migrated. A step
 * that fails is logged, then thrown, so the built server exits before it listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	try {
		await runSteps(env);
	} catch (error) {
		log.error("startup failed", { error });
		// The built server exits once this throws, so the entry that explains why leaves first, even
		// behind a slow reader; a stuck one can't hold startup up for long.
		await Promise.race([flushLogs(), new Promise((done) => setTimeout(done, FAILURE_FLUSH_MS))]);
		throw error;
	}
}

async function runSteps(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration, all of it before the database is touched.
	configureLogging({ debug: readLogDebug(env) });
	const path = await readDatabasePath(env);
	// 3. The database, opened and migrated: the app is its one migration owner (D5).
	const db = await openDatabase(path).catch((error: unknown) => {
		throw openError(error, path, databasePathSubject(env));
	});
	await migrateDatabase(db);
}

/**
 * Turso's errors put the path in their message, "failed to open database <path>: <reason>", so
 * only the reason is kept, and only when it no longer holds the path.
 */
function openError(error: unknown, path: string, subject: string): ConfigError {
	const message = error instanceof Error ? error.message : "";
	const prefix = `failed to open database ${path}: `;
	const reason = message.startsWith(prefix) ? message.slice(prefix.length) : "";
	return new ConfigError(
		"ZIMUARR_DATABASE_PATH",
		`${subject} names a file that can't be opened as a database (${
			reason === "" || reason.includes(path) ? "unknown error" : reason
		})`,
	);
}
