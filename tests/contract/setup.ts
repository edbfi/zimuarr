// The contract harness's setup (docs/SPEC-contract-spike.md, "The throwaway Bazarr"): `bun
// tests/contract/setup.ts up` starts the throwaway services and provisions them, `… down` removes
// them with their volumes and `.state/`. The run's state lives in `.state/run.json`; the tests read
// it with `loadRun()`. Nothing here touches the owner's live services or any global Docker state.
import { randomBytes } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = path.join(CONTRACT_DIR, ".state");
const RUN_FILE = path.join(STATE_DIR, "run.json");
const COMPOSE_FILE = path.join(CONTRACT_DIR, "compose.yaml");
const ENV_FILE = path.join(STATE_DIR, "compose.env");

export const INSTANCES = ["direct", "caddy", "nginx"] as const;
export type Instance = (typeof INSTANCES)[number];
export type Video = "E1" | "E2" | "M";
export type Fixture = "plain" | "markup" | "all-markup" | "longest" | "bom-crlf" | "whitespace";

/** Fixed media, looked up online by Sonarr and Radarr. */
const SERIES_TVDB_ID = 79216; // The IT Crowd
const MOVIE_TMDB_ID = 10331; // Night of the Living Dead (1968)

/**
 * The allocation table: one row per source a case dispatches. Every destination is unique, and no
 * (video, source code) is shared except by C3's three variants of one source; C8's kept failure
 * and C10's later dispatch repeat their own row on purpose. Source and target codes are disjoint,
 * so no translation overwrites a source. Each long case has its own path, source and target.
 */
export interface Row {
	case: string;
	instance: Instance;
	video: Video;
	source: string;
	/** Bazarr's code2 for the dispatch (`pb` is Brazilian Portuguese, sent as `pt-BR`). */
	target: string;
	forced?: boolean;
	hi?: boolean;
	fixture: Fixture;
	directive?: string;
	/** A destination placed before the run, which must stay byte for byte unchanged (C7). */
	existingDestination?: boolean;
}

export const ROWS: readonly Row[] = [
	{ case: "C1", instance: "direct", video: "M", source: "en", target: "pb", fixture: "markup" },
	{
		case: "C2-bom",
		instance: "direct",
		video: "E1",
		source: "de",
		target: "ca",
		fixture: "bom-crlf",
	},
	{
		case: "C2-ws",
		instance: "direct",
		video: "E2",
		source: "fr",
		target: "gl",
		fixture: "whitespace",
	},
	{ case: "C3-e1", instance: "direct", video: "E1", source: "es", target: "is", fixture: "plain" },
	{ case: "C3-e2", instance: "direct", video: "E2", source: "es", target: "is", fixture: "plain" },
	{
		case: "C3-normal",
		instance: "caddy",
		video: "M",
		source: "it",
		target: "cy",
		fixture: "plain",
	},
	{
		case: "C3-forced",
		instance: "caddy",
		video: "M",
		source: "it",
		target: "cy",
		forced: true,
		fixture: "plain",
	},
	{
		case: "C3-hi",
		instance: "caddy",
		video: "M",
		source: "it",
		target: "cy",
		hi: true,
		fixture: "plain",
	},
	{ case: "C4", instance: "nginx", video: "E1", source: "nl", target: "af", fixture: "plain" },
	{
		case: "C5-direct",
		instance: "direct",
		video: "E1",
		source: "pl",
		target: "da",
		fixture: "plain",
		directive: "delay=2100",
	},
	{
		case: "C5-caddy",
		instance: "caddy",
		video: "E2",
		source: "pl",
		target: "sv",
		fixture: "plain",
		directive: "delay=2100",
	},
	{
		case: "C5-nginx",
		instance: "nginx",
		video: "M",
		source: "pl",
		target: "no",
		fixture: "plain",
		directive: "delay=2100",
	},
	{
		case: "C6-direct",
		instance: "direct",
		video: "E2",
		source: "ru",
		target: "da",
		fixture: "plain",
		directive: "delay=300",
	},
	{
		case: "C6-caddy",
		instance: "caddy",
		video: "M",
		source: "ru",
		target: "sv",
		fixture: "plain",
		directive: "delay=300",
	},
	{
		case: "C6-nginx",
		instance: "nginx",
		video: "E1",
		source: "ru",
		target: "no",
		fixture: "plain",
		directive: "delay=300",
	},
	{
		case: "C6-bare",
		instance: "nginx",
		video: "E2",
		source: "uk",
		target: "mk",
		fixture: "plain",
		directive: "bare-headers",
	},
	{
		case: "C6-off",
		instance: "direct",
		video: "E2",
		source: "bg",
		target: "ms",
		fixture: "plain",
		directive: "delay=60",
	},
	{
		case: "C7-fail",
		instance: "caddy",
		video: "E1",
		source: "hu",
		target: "eu",
		fixture: "plain",
		directive: "fail-after=30",
	},
	{
		case: "C7-incomplete",
		instance: "nginx",
		video: "E2",
		source: "fi",
		target: "sq",
		fixture: "plain",
		directive: "incomplete",
	},
	{
		case: "C7-empty",
		instance: "direct",
		video: "M",
		source: "el",
		target: "bs",
		fixture: "plain",
		directive: "empty-line",
		existingDestination: true,
	},
	{
		case: "C8-markup",
		instance: "direct",
		video: "M",
		source: "ro",
		target: "et",
		fixture: "all-markup",
	},
	{
		case: "C8-kept",
		instance: "direct",
		video: "E1",
		source: "sk",
		target: "lv",
		fixture: "plain",
		directive: "fail-after=1",
	},
	{ case: "C8-key", instance: "nginx", video: "M", source: "tr", target: "mt", fixture: "plain" },
	{
		case: "C9",
		instance: "direct",
		video: "E2",
		source: "hr",
		target: "lb",
		fixture: "plain",
		directive: "delay=20",
	},
	{
		case: "C10",
		instance: "direct",
		video: "M",
		source: "sl",
		target: "ka",
		fixture: "plain",
		directive: "delay=5",
	},
	{
		case: "C11",
		instance: "direct",
		video: "E1",
		source: "lt",
		target: "hy",
		fixture: "plain",
		directive: "delay=120",
	},
	{ case: "C12", instance: "caddy", video: "E1", source: "ja", target: "sw", fixture: "longest" },
];

export function row(name: string): Row {
	const found = ROWS.find((r) => r.case === name);
	if (!found) throw new Error(`no allocation row ${name}`);
	return found;
}

/** Checks the table's rules, so a new row can't silently collide with another. */
export function checkAllocation(rows: readonly Row[] = ROWS): void {
	const destinations = new Set<string>();
	const sources = new Map<string, string>();
	const pairs = new Map<string, string>();
	const targets = new Set(rows.map((r) => r.target));
	for (const r of rows) {
		const destination = `${r.video}.${r.target}${r.forced ? ".forced" : ""}${r.hi ? ".hi" : ""}`;
		if (destinations.has(destination))
			throw new Error(`${r.case}: destination ${destination} reused`);
		destinations.add(destination);
		const source = `${r.video}.${r.source}`;
		const group = r.case.startsWith("C3-") && r.video === "M" ? "C3-variants" : r.case;
		if (sources.has(source) && sources.get(source) !== group) {
			throw new Error(`${r.case}: source ${source} reused`);
		}
		sources.set(source, group);
		if (targets.has(r.source)) throw new Error(`${r.case}: ${r.source} is also a target`);
		const pair = `${r.instance}:${r.source}>${r.target}`;
		const pairGroup = r.case.startsWith("C3-") ? "C3" : r.case;
		if (pairs.has(pair) && pairs.get(pair) !== pairGroup) {
			throw new Error(`${r.case}: language pair ${pair} reused on one instance`);
		}
		pairs.set(pair, pairGroup);
	}
}
checkAllocation();

export interface Run {
	project: string;
	gateway: string;
	zimuarrPort: number;
	/** The recording proxy's port per path; each Bazarr's Lingarr address points at its own. */
	proxyPorts: Record<Instance, number>;
	/** The Lingarr token each Bazarr sends; zimuarr gets them in this order (key index 0, 1, 2). */
	lingarrKeys: Record<Instance, string>;
	bazarrApiKeys: Record<Instance, string>;
	sonarrApiKey: string;
	radarrApiKey: string;
	mediaDir: string;
	/** Filled once the services run. */
	ports?: {
		bazarr: Record<Instance, number>;
		sonarr: number;
		radarr: number;
		caddy: number;
		nginx: number;
	};
	media?: {
		seriesId: number;
		radarrId: number;
		episodeIds: { E1: number; E2: number };
		videos: Record<Video, string>;
	};
	versions?: Record<string, { pinned: string; running: string; image: string }>;
	provisioning?: { metadataRetries: number; seconds: number };
}

export async function loadRun(): Promise<Run> {
	const file = Bun.file(RUN_FILE);
	if (!(await file.exists()))
		throw new Error("no contract run: start one with `bun run --bun contract:up`");
	return (await file.json()) as Run;
}

async function saveRun(run: Run): Promise<void> {
	await writeFile(RUN_FILE, JSON.stringify(run, null, "\t"), { mode: 0o600 });
}

/** `docker compose` for this run's project, with its variables. */
export async function compose(run: Pick<Run, "project">, ...args: string[]): Promise<string> {
	const proc = Bun.spawn(
		["docker", "compose", "-f", COMPOSE_FILE, "--env-file", ENV_FILE, "-p", run.project, ...args],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0)
		throw new Error(`docker compose ${args.join(" ")} failed (${code}): ${err.trim()}`);
	return out;
}

function key(prefix: string): string {
	// A letter first: Bazarr's settings API casts values that parse as integers.
	return `${prefix}${randomBytes(16).toString("hex")}`;
}

async function freePort(host: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, host, () => {
			const address = server.address();
			server.close(() =>
				typeof address === "object" && address ? resolve(address.port) : reject(),
			);
		});
	});
}

async function dockerGateway(): Promise<string> {
	const proc = Bun.spawn(
		["docker", "network", "inspect", "bridge", "-f", "{{(index .IPAM.Config 0).Gateway}}"],
		{ stdout: "pipe" },
	);
	const gateway = (await new Response(proc.stdout).text()).trim();
	if ((await proc.exited) !== 0 || !gateway) throw new Error("can't read Docker's bridge gateway");
	return gateway;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `check` returns a value, or fails with `what` after the deadline. */
export async function until<T>(
	what: string,
	check: () => Promise<T | undefined>,
	deadlineMs: number,
	everyMs = 2000,
): Promise<T> {
	const end = Date.now() + deadlineMs;
	let last: unknown;
	while (Date.now() < end) {
		try {
			const value = await check();
			if (value !== undefined) return value;
		} catch (error) {
			last = error;
		}
		await sleep(everyMs);
	}
	throw new Error(`timed out waiting for ${what}${last ? `: ${String(last)}` : ""}`);
}

async function api<T>(url: string, apiKey: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: { "x-api-key": apiKey, "content-type": "application/json", ...init.headers },
	});
	if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${response.status}`);
	const text = await response.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

class ProvisioningError extends Error {}

/** Online metadata lookups, retried a bounded number of times, then reported apart. */
async function metadata<T>(what: string, lookup: () => Promise<T>, run: Run): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await lookup();
		} catch (error) {
			if (attempt === 5) throw new ProvisioningError(`${what} failed 5 times: ${String(error)}`);
			run.provisioning = {
				metadataRetries: (run.provisioning?.metadataRetries ?? 0) + 1,
				seconds: 0,
			};
			await sleep(attempt * 5000);
		}
	}
}

/** The pinned version in an image tag, as each service reports it. */
function pinnedVersion(image: string): string {
	const tag = image.split("@")[0]?.split(":").at(-1) ?? "";
	return tag
		.replace(/^release-/, "")
		.replace(/-alpine$/, "")
		.replace(/-cli-ls\d+$/, "");
}

/** Each service's pinned image, from `compose.yaml`. */
async function images(): Promise<Record<string, string>> {
	const text = await Bun.file(COMPOSE_FILE).text();
	const found: Record<string, string> = {};
	for (const [, image] of text.matchAll(/^\s+image: (\S+)$/gm)) {
		const name = image?.split("@")[0]?.split(":")[0]?.split("/").at(-1);
		if (name && image) found[name] = image;
	}
	return found;
}

async function checkVersions(run: Run): Promise<void> {
	const pins = await images();
	const ports = run.ports;
	if (!ports) throw new Error("services not started");
	const running: Record<string, string> = {};
	const bazarr = await api<{ data: { bazarr_version: string } }>(
		`http://127.0.0.1:${ports.bazarr.direct}/api/system/status`,
		run.bazarrApiKeys.direct,
	);
	running.bazarr = bazarr.data.bazarr_version;
	running.sonarr = (
		await api<{ version: string }>(
			`http://127.0.0.1:${ports.sonarr}/api/v3/system/status`,
			run.sonarrApiKey,
		)
	).version;
	running.radarr = (
		await api<{ version: string }>(
			`http://127.0.0.1:${ports.radarr}/api/v3/system/status`,
			run.radarrApiKey,
		)
	).version;
	running.caddy =
		(await compose(run, "exec", "-T", "caddy", "caddy", "version"))
			.split(" ")[0]
			?.replace(/^v/, "") ?? "";
	const nginx = Bun.spawn(
		[
			"docker",
			"compose",
			"-f",
			COMPOSE_FILE,
			"--env-file",
			ENV_FILE,
			"-p",
			run.project,
			"exec",
			"-T",
			"nginx",
			"nginx",
			"-v",
		],
		{ stderr: "pipe" },
	);
	running.nginx = /nginx\/(\S+)/.exec(await new Response(nginx.stderr).text())?.[1] ?? "";
	running.ffmpeg =
		/ffmpeg version (\S+)/.exec(
			await compose(run, "run", "--rm", "-T", "ffmpeg", "-version"),
		)?.[1] ?? "";

	run.versions = {};
	for (const [name, version] of Object.entries(running)) {
		const image = pins[name] ?? "";
		const pinned = pinnedVersion(image);
		run.versions[name] = { pinned, running: version, image };
		if (!version.startsWith(pinned)) {
			throw new Error(`${name} runs ${version}, but compose.yaml pins ${pinned}`);
		}
	}
}

/** The fixture as placed on disk: committed fixtures as they are, the byte-exact variants derived. */
export async function fixtureText(fixture: Fixture, directive?: string): Promise<string> {
	const base = fixture === "bom-crlf" || fixture === "whitespace" ? "plain" : fixture;
	let text = await Bun.file(path.join(CONTRACT_DIR, "fixtures", `${base}.srt`)).text();
	if (directive) {
		if (fixture === "all-markup") throw new Error("all-markup never carries a directive");
		text = text.replace(/^(1\n[^\n]+\n)[^\n]*/, `$1zimuarr-spike: ${directive}`);
	}
	if (fixture === "bom-crlf") return `\uFEFF${text.replaceAll("\n", "\r\n")}`;
	if (fixture === "whitespace") {
		// What prek's hooks would strip from a committed file: trailing spaces, whitespace-only and
		// Python-only whitespace cues, a cue of U+FEFF (whitespace to JavaScript only) and no final
		// line break.
		return `${text.replace("Good evening.", "Good evening.   ").trimEnd()}

6
00:00:00,600 --> 00:00:00,700
\t  \t

7
00:00:00,700 --> 00:00:00,800
\u001C\u0085

8
00:00:00,800 --> 00:00:00,900


9
00:00:00,900 --> 00:00:01,000
Trailing \u001F`;
	}
	return text;
}

/** Where a row's source lives, next to its video. */
export function sourcePath(run: Run, r: Row): string {
	const video = run.media?.videos[r.video];
	if (!video) throw new Error("media not provisioned");
	return `${video.replace(/\.mkv$/, "")}.${r.source}.srt`;
}

async function writeSeeds(run: Run): Promise<void> {
	for (const name of ["sonarr", "radarr"] as const) {
		await mkdir(path.join(STATE_DIR, name), { recursive: true });
		const apiKey = name === "sonarr" ? run.sonarrApiKey : run.radarrApiKey;
		await writeFile(
			path.join(STATE_DIR, name, "config.xml"),
			`<Config>\n  <ApiKey>${apiKey}</ApiKey>\n</Config>\n`,
		);
	}
	for (const instance of INSTANCES) {
		const dir = path.join(STATE_DIR, `bazarr-${instance}`, "config");
		await mkdir(dir, { recursive: true });
		const settings = {
			auth: { apikey: run.bazarrApiKeys[instance] },
			general: {
				// The owner's settings that matter to the contract (SPEC-contract-spike.md).
				hi_extension: "sdh",
				concurrent_jobs: 8,
				use_postprocessing: true,
				postprocessing_cmd: `touch '${run.mediaDir}/.postprocessing-ran-${instance}'`,
				use_embedded_subs: false,
				subfolder: "current",
				use_sonarr: true,
				use_radarr: true,
			},
			sonarr: { ip: "sonarr", port: 8989, base_url: "/", apikey: run.sonarrApiKey },
			radarr: { ip: "radarr", port: 7878, base_url: "/", apikey: run.radarrApiKey },
			translator: {
				translator_type: "lingarr",
				lingarr_url: `http://host.docker.internal:${run.proxyPorts[instance]}/bazarr`,
				lingarr_token: run.lingarrKeys[instance],
				translator_info: false,
				default_score: 50,
			},
		};
		await writeFile(path.join(dir, "config.yaml"), Bun.YAML.stringify(settings, null, 2));
	}
}

async function makeVideos(run: Run): Promise<string> {
	const cache = path.join(run.mediaDir, ".cache");
	await mkdir(cache, { recursive: true });
	const video = path.join(cache, "one-second.mkv");
	// One second, but over Bazarr's MINIMUM_VIDEO_SIZE (20 KB), below which it ignores a video.
	await compose(
		run,
		"run",
		"--rm",
		"-T",
		"ffmpeg",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=duration=1:size=1280x720:rate=24",
		"-f",
		"lavfi",
		"-i",
		"anullsrc=r=48000:cl=stereo",
		"-t",
		"1",
		"-c:v",
		"libx264",
		"-crf",
		"10",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-shortest",
		"-y",
		video,
	);
	return video;
}

async function provisionSonarr(
	run: Run,
	video: string,
): Promise<{ seriesId: number; files: { E1: string; E2: string } }> {
	const base = `http://127.0.0.1:${run.ports?.sonarr}/api/v3`;
	const root = path.join(run.mediaDir, "tv");
	await mkdir(root, { recursive: true });
	await until(
		"Sonarr",
		() => api(`${base}/system/status`, run.sonarrApiKey).then(() => true),
		120_000,
	);
	await api(`${base}/rootfolder`, run.sonarrApiKey, {
		method: "POST",
		body: JSON.stringify({ path: root }),
	});
	const [series] = await metadata(
		"Sonarr's series lookup",
		() =>
			api<Array<Record<string, unknown>>>(
				`${base}/series/lookup?term=tvdb:${SERIES_TVDB_ID}`,
				run.sonarrApiKey,
			).then((found) => {
				if (!found[0]) throw new Error("no series found");
				return found;
			}),
		run,
	);
	const added = await metadata(
		"adding the series to Sonarr",
		() =>
			api<{ id: number; path: string }>(`${base}/series`, run.sonarrApiKey, {
				method: "POST",
				body: JSON.stringify({
					...series,
					qualityProfileId: 1,
					rootFolderPath: root,
					monitored: false,
					seasonFolder: true,
					addOptions: { monitor: "none", searchForMissingEpisodes: false },
				}),
			}),
		run,
	);
	const season = path.join(added.path, "Season 01");
	await mkdir(season, { recursive: true });
	const title = String(series?.title);
	const files = {
		E1: path.join(season, `${title} - S01E01.mkv`),
		E2: path.join(season, `${title} - S01E02.mkv`),
	};
	await cp(video, files.E1);
	await cp(video, files.E2);
	await until(
		"Sonarr to see both episode files",
		async () => {
			await api(`${base}/command`, run.sonarrApiKey, {
				method: "POST",
				body: JSON.stringify({ name: "RescanSeries", seriesId: added.id }),
			});
			await sleep(3000);
			const found = await api<unknown[]>(
				`${base}/episodefile?seriesId=${added.id}`,
				run.sonarrApiKey,
			);
			return found.length >= 2 ? true : undefined;
		},
		180_000,
		5000,
	);
	return { seriesId: added.id, files };
}

async function provisionRadarr(
	run: Run,
	video: string,
): Promise<{ radarrId: number; file: string }> {
	const base = `http://127.0.0.1:${run.ports?.radarr}/api/v3`;
	const root = path.join(run.mediaDir, "movies");
	await mkdir(root, { recursive: true });
	await until(
		"Radarr",
		() => api(`${base}/system/status`, run.radarrApiKey).then(() => true),
		120_000,
	);
	await api(`${base}/rootfolder`, run.radarrApiKey, {
		method: "POST",
		body: JSON.stringify({ path: root }),
	});
	const movie = await metadata(
		"Radarr's movie lookup",
		() =>
			api<Record<string, unknown>>(
				`${base}/movie/lookup/tmdb?tmdbId=${MOVIE_TMDB_ID}`,
				run.radarrApiKey,
			),
		run,
	);
	const added = await metadata(
		"adding the movie to Radarr",
		() =>
			api<{ id: number; path: string }>(`${base}/movie`, run.radarrApiKey, {
				method: "POST",
				body: JSON.stringify({
					...movie,
					qualityProfileId: 1,
					rootFolderPath: root,
					monitored: false,
					minimumAvailability: "released",
					addOptions: { searchForMovie: false },
				}),
			}),
		run,
	);
	await mkdir(added.path, { recursive: true });
	const file = path.join(added.path, `${movie.title} (${movie.year}).mkv`);
	await cp(video, file);
	await until(
		"Radarr to see the movie file",
		async () => {
			await api(`${base}/command`, run.radarrApiKey, {
				method: "POST",
				body: JSON.stringify({ name: "RescanMovie", movieIds: [added.id] }),
			});
			await sleep(3000);
			const found = await api<unknown[]>(`${base}/moviefile?movieId=${added.id}`, run.radarrApiKey);
			return found.length >= 1 ? true : undefined;
		},
		180_000,
		5000,
	);
	return { radarrId: added.id, file };
}

/** Places every row's source, and C7's pre-existing destination. */
async function placeSources(run: Run): Promise<void> {
	for (const r of ROWS) {
		const target = sourcePath(run, r);
		if (r.case === "C3-forced" || r.case === "C3-hi") continue; // C3-normal places the shared source
		await writeFile(target, await fixtureText(r.fixture, r.directive));
		if (r.existingDestination) {
			const destination = target.replace(new RegExp(`\\.${r.source}\\.srt$`), `.${r.target}.srt`);
			await writeFile(destination, "1\n00:00:00,100 --> 00:00:00,200\nAn existing translation.\n");
		}
	}
}

interface BazarrSubtitle {
	path: string | null;
	code2: string;
}

async function waitForBazarrIndex(run: Run, seriesId: number): Promise<void> {
	const expected = ROWS.map((r) => sourcePath(run, r));
	await Promise.all(
		INSTANCES.map(async (instance) => {
			const base = `http://127.0.0.1:${run.ports?.bazarr[instance]}/api`;
			const apiKey = run.bazarrApiKeys[instance];
			const get = <T>(url: string) =>
				fetch(`${base}${url}`, { headers: { "x-api-key": apiKey } }).then(async (r) => {
					if (!r.ok) throw new Error(`${url}: ${r.status}`);
					return (await r.json()) as T;
				});
			await until(`Bazarr ${instance}`, () => get("/system/status").then(() => true), 180_000);
			let lastSync = 0;
			await until(
				`Bazarr ${instance} to index every source`,
				async () => {
					if (Date.now() - lastSync > 30_000) {
						lastSync = Date.now();
						for (const task of ["update_series", "update_movies"]) {
							await fetch(`${base}/system/tasks?taskid=${task}`, {
								method: "POST",
								headers: { "x-api-key": apiKey },
							});
						}
					}
					const episodes = await get<{
						data: Array<{ sonarrEpisodeId: number; subtitles: BazarrSubtitle[] }>;
					}>(`/episodes?seriesid[]=${seriesId}`);
					const movies = await get<{ data: Array<{ subtitles: BazarrSubtitle[] }> }>("/movies");
					const indexed = new Set(
						[...episodes.data, ...movies.data].flatMap((item) => item.subtitles.map((s) => s.path)),
					);
					return expected.every((file) => indexed.has(file)) ? true : undefined;
				},
				300_000,
				5000,
			);
		}),
	);
}

async function episodeIds(run: Run, seriesId: number): Promise<{ E1: number; E2: number }> {
	const base = `http://127.0.0.1:${run.ports?.sonarr}/api/v3`;
	const episodes = await api<Array<{ id: number; seasonNumber: number; episodeNumber: number }>>(
		`${base}/episode?seriesId=${seriesId}`,
		run.sonarrApiKey,
	);
	const id = (n: number) => {
		const found = episodes.find((e) => e.seasonNumber === 1 && e.episodeNumber === n);
		if (!found) throw new Error(`no S01E0${n}`);
		return found.id;
	};
	return { E1: id(1), E2: id(2) };
}

async function publishedPort(run: Run, service: string, port: number): Promise<number> {
	const out = await compose(run, "port", service, String(port));
	const published = Number(out.trim().split(":").at(-1));
	if (!published) throw new Error(`no published port for ${service}`);
	return published;
}

/** Checks the post-processing command can write its marker, so its absence later means something. */
async function checkPostprocessingMarker(run: Run): Promise<void> {
	for (const instance of INSTANCES) {
		const marker = path.join(run.mediaDir, `.postprocessing-ran-${instance}`);
		await compose(run, "exec", "-T", `bazarr-${instance}`, "sh", "-c", `touch '${marker}'`);
		if (!(await Bun.file(marker).exists()))
			throw new Error(`bazarr-${instance} can't write ${marker}`);
		await rm(marker);
	}
}

async function up(): Promise<void> {
	const started = Date.now();
	if (await Bun.file(RUN_FILE).exists()) {
		throw new Error("a contract run already exists: remove it with `bun run --bun contract:down`");
	}
	await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
	const gateway = await dockerGateway();
	const run: Run = {
		project: `zimuarr-contract-${randomBytes(4).toString("hex")}`,
		gateway,
		zimuarrPort: await freePort(gateway),
		proxyPorts: {
			direct: await freePort(gateway),
			caddy: await freePort(gateway),
			nginx: await freePort(gateway),
		},
		lingarrKeys: { direct: key("zk-"), caddy: key("zk-"), nginx: key("zk-") },
		bazarrApiKeys: { direct: key("b"), caddy: key("b"), nginx: key("b") },
		sonarrApiKey: randomBytes(16).toString("hex"),
		radarrApiKey: randomBytes(16).toString("hex"),
		mediaDir: path.join(STATE_DIR, "media"),
	};
	await mkdir(run.mediaDir, { recursive: true });
	await writeFile(
		ENV_FILE,
		[
			`CONTRACT_UID=${process.getuid?.() ?? 1000}`,
			`CONTRACT_GID=${process.getgid?.() ?? 1000}`,
			`CONTRACT_STATE=${STATE_DIR}`,
			`CONTRACT_MEDIA=${run.mediaDir}`,
			`CONTRACT_ZIMUARR_PORT=${run.zimuarrPort}`,
			"",
		].join("\n"),
		{ mode: 0o600 },
	);
	await saveRun(run);
	await writeSeeds(run);

	console.log(`contract: starting ${run.project}`);
	await compose(run, "up", "-d", "--quiet-pull");
	run.ports = {
		bazarr: {
			direct: await publishedPort(run, "bazarr-direct", 6767),
			caddy: await publishedPort(run, "bazarr-caddy", 6767),
			nginx: await publishedPort(run, "bazarr-nginx", 6767),
		},
		sonarr: await publishedPort(run, "sonarr", 8989),
		radarr: await publishedPort(run, "radarr", 7878),
		caddy: await publishedPort(run, "caddy", 8080),
		nginx: await publishedPort(run, "nginx", 8080),
	};
	await saveRun(run);

	console.log("contract: provisioning Sonarr and Radarr");
	const video = await makeVideos(run);
	const [sonarr, radarr] = await Promise.all([
		provisionSonarr(run, video),
		provisionRadarr(run, video),
	]);
	const ids = await episodeIds(run, sonarr.seriesId);
	run.media = {
		seriesId: sonarr.seriesId,
		radarrId: radarr.radarrId,
		episodeIds: ids,
		videos: { ...sonarr.files, M: radarr.file },
	};
	await saveRun(run);

	console.log("contract: placing sources and waiting for every Bazarr to index them");
	await placeSources(run);
	await waitForBazarrIndex(run, sonarr.seriesId);
	await checkPostprocessingMarker(run);
	await checkVersions(run);
	run.provisioning = {
		metadataRetries: run.provisioning?.metadataRetries ?? 0,
		seconds: Math.round((Date.now() - started) / 1000),
	};
	await saveRun(run);
	console.log(`contract: ready in ${run.provisioning.seconds} s (${JSON.stringify(run.versions)})`);
}

async function down(): Promise<void> {
	const file = Bun.file(RUN_FILE);
	if (await file.exists()) {
		const run = (await file.json()) as Run;
		await compose(run, "--profile", "tools", "down", "--volumes", "--remove-orphans").catch(
			(error: unknown) => {
				console.error(String(error));
			},
		);
	}
	// Containers write as the caller (PUID/PGID), so the state is ours to delete.
	await rm(STATE_DIR, { recursive: true, force: true });
	console.log("contract: removed");
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === "up") {
		await up().catch((error: unknown) => {
			const kind = error instanceof ProvisioningError ? "provisioning failure" : "setup failure";
			console.error(`contract: ${kind}: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(error instanceof ProvisioningError ? 3 : 1);
		});
	} else if (command === "down") {
		await down();
	} else {
		console.error("usage: bun tests/contract/setup.ts up|down");
		process.exit(2);
	}
}
