// The harness's client for one throwaway Bazarr: dispatch, jobs, history, log and the Lingarr token.
// Bazarr 1.6.2 answers a dispatch with 204 and no job id, and keeps only its last 10 completed and
// 10 failed jobs, so a poller records every job from the moment it appears, dispatches in flight are
// capped per instance, and a dispatch claims the new job whose name carries its language pair.
import type { Row } from "./setup.ts";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobRecord {
	id: number;
	name: string;
	firstSeenAt: number;
	status: JobStatus;
	statusAt: number;
}

export interface LogEntry {
	type: string;
	timestamp: string;
	message: string;
	exception?: string;
}

const IN_FLIGHT = 6;
const TERMINAL: readonly JobStatus[] = ["completed", "failed"];

export class Bazarr {
	readonly jobs = new Map<number, JobRecord>();
	private readonly claimed = new Set<number>();
	private poller: ReturnType<typeof setInterval> | undefined;
	private inFlight = 0;
	private readonly waiting: Array<() => void> = [];

	constructor(
		readonly name: string,
		private readonly port: number,
		private readonly apiKey: string,
	) {}

	private url(path: string): string {
		return `http://127.0.0.1:${this.port}/api${path}`;
	}

	async get<T>(path: string): Promise<T> {
		const response = await fetch(this.url(path), { headers: { "x-api-key": this.apiKey } });
		if (!response.ok) throw new Error(`Bazarr ${this.name} GET ${path}: ${response.status}`);
		return (await response.json()) as T;
	}

	private async poll(): Promise<void> {
		const { data } = await this.get<{
			data: Array<{ job_id: number; job_name: string; status: JobStatus }>;
		}>("/system/jobs");
		const now = Date.now();
		for (const job of data) {
			const known = this.jobs.get(job.job_id);
			if (!known) {
				this.jobs.set(job.job_id, {
					id: job.job_id,
					name: job.job_name,
					firstSeenAt: now,
					status: job.status,
					statusAt: now,
				});
			} else if (known.status !== job.status || known.name !== job.job_name) {
				known.name = job.job_name;
				if (known.status !== job.status) known.statusAt = now;
				known.status = job.status;
			}
		}
	}

	startPolling(): void {
		this.poller ??= setInterval(() => void this.poll().catch(() => {}), 500);
	}

	stopPolling(): void {
		clearInterval(this.poller);
		this.poller = undefined;
	}

	private async slot(): Promise<() => void> {
		if (this.inFlight >= IN_FLIGHT)
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		this.inFlight++;
		return () => {
			this.inFlight--;
			this.waiting.shift()?.();
		};
	}

	/**
	 * Dispatches a translation as zimuarr will (`PATCH /api/subtitles`), claims its job and waits
	 * for its end. The id is the Sonarr episode id or the Radarr id.
	 */
	async translate(
		row: Row,
		target: { type: "episode" | "movie"; id: number; path: string },
		deadlineMs: number,
	): Promise<JobRecord> {
		const release = await this.slot();
		try {
			await this.poll();
			const before = new Set(this.jobs.keys());
			const query = new URLSearchParams({
				action: "translate",
				language: row.target,
				path: target.path,
				type: target.type,
				id: String(target.id),
				forced: row.forced ? "True" : "False",
				hi: row.hi ? "True" : "False",
			});
			const response = await fetch(this.url(`/subtitles?${query}`), {
				method: "PATCH",
				headers: { "x-api-key": this.apiKey },
			});
			if (response.status !== 204) {
				throw new Error(
					`Bazarr ${this.name} dispatch ${row.case}: ${response.status} ${await response.text()}`,
				);
			}
			const pair = new RegExp(
				`from ${row.source.toUpperCase()} to ${row.target.toUpperCase()} using`,
			);
			const job = await this.waitFor(`${row.case}'s job`, deadlineMs, () =>
				[...this.jobs.values()].find(
					(j) => !before.has(j.id) && !this.claimed.has(j.id) && pair.test(j.name),
				),
			);
			this.claimed.add(job.id);
			return await this.waitFor(`${row.case}'s job to end`, deadlineMs, () =>
				TERMINAL.includes(job.status) ? job : undefined,
			);
		} finally {
			release();
		}
	}

	private async waitFor<T>(
		what: string,
		deadlineMs: number,
		check: () => T | undefined,
	): Promise<T> {
		const end = Date.now() + deadlineMs;
		for (;;) {
			const found = check();
			if (found !== undefined) return found;
			if (Date.now() > end) throw new Error(`Bazarr ${this.name}: timed out waiting for ${what}`);
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}

	async logs(): Promise<LogEntry[]> {
		return (await this.get<{ data: LogEntry[] }>("/system/logs")).data;
	}

	/** Changes the Lingarr token Bazarr sends (C8's wrong key). */
	async setLingarrToken(token: string): Promise<void> {
		const response = await fetch(this.url("/system/settings"), {
			method: "POST",
			headers: { "x-api-key": this.apiKey },
			body: new URLSearchParams({ "settings-translator-lingarr_token": token }),
		});
		if (!response.ok) throw new Error(`Bazarr ${this.name} settings: ${response.status}`);
	}

	async history(type: "episode" | "movie"): Promise<Array<Record<string, unknown>>> {
		const path =
			type === "episode"
				? "/episodes/history?start=0&length=200"
				: "/movies/history?start=0&length=200";
		return (await this.get<{ data: Array<Record<string, unknown>> }>(path)).data;
	}
}
