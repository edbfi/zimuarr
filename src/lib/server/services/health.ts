import type { Executor } from "#lib/server/db/client.ts";
import { readSetting, writeSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { currentDatabase } from "./setup/startup.ts";

const log = createLogger("health");

/** The settings key the probe writes; nothing else reads it. */
const HEALTH_KEY = "health.checked_at";

/**
 * Writes the health row, commits it and reads it back. A read alone, or a write that is rolled
 * back, never reaches the disk, so it would miss a read-only or full volume (SPEC-setup.md,
 * "The health endpoint").
 */
export async function probeDatabase(db: Executor, now: Date): Promise<void> {
	const value = now.toISOString();
	await writeSetting(db, HEALTH_KEY, value, now);
	if ((await readSetting(db, HEALTH_KEY)) !== value) {
		throw new Error("the health row read back differently");
	}
}

/** The `/healthz` answer: `ok`, or `unavailable` with a 503, as plain text that no cache keeps. */
export function healthResponse(healthy: boolean): Response {
	return new Response(healthy ? "ok" : "unavailable", {
		status: healthy ? 200 : 503,
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
	});
}

export type HealthCheckOptions = {
	/** Proves the database can be read and written; it rejects when it can't. */
	readonly probe: () => Promise<void>;
	/** How long a probe's result answers every request (5 s). */
	readonly windowMs?: number;
	/** How long a probe may take before the answer is unhealthy (3 s). */
	readonly timeoutMs?: number;
};

/**
 * A health check for a public endpoint: at most one probe every `windowMs`, one at a time.
 * Requests within the window share the last result, so no success is reused past it; a probe that
 * hasn't answered within `timeoutMs` is unhealthy, and while it still hangs no second probe
 * starts, so a stuck database never piles up probes. Each change of state is logged once.
 */
export function createHealthCheck({
	probe,
	windowMs = 5000,
	timeoutMs = 3000,
}: HealthCheckOptions): () => Promise<boolean> {
	let last: { healthy: boolean; at: number } | undefined;
	let answering: Promise<boolean> | undefined;
	let hung = false;
	let healthy = true;

	const run = async (): Promise<boolean> => {
		const at = Date.now();
		hung = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const outcome = probe().then(
			() => ({ healthy: true, error: undefined as unknown }),
			(error: unknown) => ({ healthy: false, error }),
		);
		void outcome.finally(() => {
			hung = false;
		});
		const timedOut = new Promise<{ healthy: boolean; error: unknown }>((resolve) => {
			timer = setTimeout(
				() => resolve({ healthy: false, error: `no answer within ${timeoutMs} ms` }),
				timeoutMs,
			);
		});
		const result = await Promise.race([outcome, timedOut]);
		clearTimeout(timer);
		last = { healthy: result.healthy, at };
		if (result.healthy !== healthy) {
			healthy = result.healthy;
			if (healthy) log.info("health check passing again");
			else log.error("health check failing", { error: result.error });
		}
		return result.healthy;
	};

	return async () => {
		if (last !== undefined && Date.now() - last.at < windowMs) return last.healthy;
		if (answering !== undefined) return answering;
		if (hung) return false;
		answering = run().finally(() => {
			answering = undefined;
		});
		return answering;
	};
}

/** The app's health check: the database startup opened, read and written (SPEC-setup.md). */
export const checkHealth = createHealthCheck({
	probe: () => probeDatabase(currentDatabase(), new Date()),
});
