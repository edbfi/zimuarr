import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
import { connect } from "@tursodatabase/database";
import { type Server, spawnServer, startServer } from "./server.ts";

// `setup` on the built server (docs/SPEC.md, "Testing strategy"). Each test starts its own server
// (`server.ts`), with a generated key and a database in its own temporary folder.
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Runs the built server with `env` until it exits by itself, killing it after 10 s. */
async function runToExit(cwd: string, env: Record<string, string>) {
	const server = spawnServer(cwd, env);
	const timer = setTimeout(() => server.kill("SIGKILL"), 10_000);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(server.stdout).text(),
			new Response(server.stderr).text(),
		]);
		await server.exited;
		return { exitCode: server.exitCode, output: `${stdout}\n${stderr}` };
	} finally {
		clearTimeout(timer);
	}
}

let root: string;

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "zimuarr-e2e-setup-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test.describe("the database", () => {
	test("is migrated on a new file, and a second start on it applies nothing", async () => {
		const path = join(root, "data", "zimuarr.db");
		const env = { ZIMUARR_DATABASE_PATH: path };

		for (const start of ["first", "second"]) {
			const server = await startServer(root, env);
			const response = await fetch(`${server.url}/healthz`);
			expect(await response.text(), `${start} start`).toBe("ok");
			await server.stop();
		}

		const db = await connect(path);
		try {
			const rows = await (await db.prepare("SELECT name FROM __drizzle_migrations")).all();
			const tables = await (
				await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			).all();
			const folders = (await readdir(MIGRATIONS, { withFileTypes: true })).filter((entry) =>
				entry.isDirectory(),
			);
			expect(rows).toHaveLength(folders.length);
			expect(tables.map((row: { name: string }) => row.name)).toEqual(
				expect.arrayContaining(["owner", "settings"]),
			);
		} finally {
			db.close();
		}
	});

	test("defaults to data/zimuarr.db in the working directory", async () => {
		const server = await startServer(root, {});
		await server.stop();
		const db = await connect(join(root, "data", "zimuarr.db"));
		try {
			expect(await (await db.prepare("SELECT 1 FROM owner")).all()).toEqual([]);
		} finally {
			db.close();
		}
	});

	test("the built server refuses a database folder it can't create, without echoing it", async () => {
		const file = join(root, "a-file");
		await writeFile(file, "");
		const { exitCode, output } = await runToExit(root, {
			ZIMUARR_DATABASE_PATH: join(file, "data", "zimuarr.db"),
		});

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: ZIMUARR_DATABASE_PATH names a folder that can't be created (ENOTDIR)",
		]);
	});

	test("names the default path, not the variable, when the default can't be opened", async () => {
		await mkdir(join(root, "data", "zimuarr.db"), { recursive: true });
		const { exitCode, output } = await runToExit(root, {});

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: ZIMUARR_DATABASE_PATH is unset, and the default data/zimuarr.db names a file that can't be opened as a database (I/O error (open): is a directory)",
		]);
	});

	test("the built server refuses a path it can't open as a database, without echoing it", async () => {
		const path = join(root, "a-directory");
		await mkdir(path);
		const { exitCode, output } = await runToExit(root, { ZIMUARR_DATABASE_PATH: path });

		expect(output.includes(root), "output holds the path").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
		expect(lines).toEqual([
			"ConfigError: ZIMUARR_DATABASE_PATH names a file that can't be opened as a database (I/O error (open): is a directory)",
		]);
	});
});

test.describe("logging", () => {
	test("a failed startup is one JSON log entry, and the bad value is never echoed", async () => {
		const value = "verbose-please";
		const { exitCode, output } = await runToExit(root, { ZIMUARR_LOG_DEBUG: value });

		expect(output.includes(value), "output holds the value").toBe(false);
		expect(exitCode).toBe(1);
		expect(output).not.toContain("Listening on");
		const entries = output
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line));
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			level: "error",
			source: "startup",
			message: "startup failed",
			metadata: {
				error: { name: "ConfigError", message: "ZIMUARR_LOG_DEBUG must be true or false" },
			},
		});
	});

	test("handleError logs a request's error through the logger, with the path but not the query", async () => {
		const server = await startServer(root, { ZIMUARR_LOG_DEBUG: "true" });
		// A 404 page, which only a claimed instance serves.
		await claim(server);
		const response = await fetch(`${server.url}/no-such-page?token=abcd-efgh-ijkl`);
		expect(response.status).toBe(404);
		await server.stop();

		const output = server.output();
		expect(output.includes("abcd-efgh-ijkl"), "output holds the query").toBe(false);
		const entries = output
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line))
			.filter((entry) => entry.message === "unexpected error");
		expect(entries).toEqual([
			expect.objectContaining({
				level: "debug",
				source: "request",
				metadata: expect.objectContaining({ status: 404, path: "/no-such-page" }),
			}),
		]);
	});
});

test.describe("shutdown", () => {
	for (const signal of ["SIGTERM", "SIGHUP"] as const) {
		test(`${signal} shuts the built server down with exit code 0`, async () => {
			const server = await startServer(root, {
				ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
			});
			expect(await (await fetch(`${server.url}/healthz`)).text()).toBe("ok");

			expect(await server.stop(signal)).toBe(0);
			const stopping = server
				.output()
				.split("\n")
				.filter((line) => line.startsWith("{"))
				.map((line) => JSON.parse(line))
				.filter((entry) => entry.message === "stopping");
			// SIGHUP arrives as itself, then the app passes it on as SIGTERM.
			expect(stopping.map((entry) => entry.metadata.signal)).toEqual(["SIGTERM"]);
		});
	}
});

/**
 * Claims a fresh server through its form action, with the token it printed, as a browser's native
 * form post: asking for HTML, since SvelteKit answers an action in JSON to `Accept: *\/*`.
 */
async function claim(server: Server) {
	const token = /Setup token: ([a-z0-9-]{14}) /.exec(server.output())?.[1] ?? "";
	const response = await fetch(`${server.url}/setup`, {
		method: "POST",
		headers: {
			origin: server.url,
			accept: "text/html",
			"content-type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ token, username: "owner", password: "violet harbour lanterns" }),
		redirect: "manual",
	});
	expect(response.status, "the claim").toBe(303);
	expect(response.headers.get("location")).toBe("/");
}

/** A GET, or a request with `init`, that doesn't follow a redirect. */
const request = (url: string, init: RequestInit = {}) =>
	fetch(url, { ...init, redirect: "manual" });

test.describe("security headers and the CSP", () => {
	const ALWAYS = {
		"x-frame-options": "DENY",
		"x-content-type-options": "nosniff",
		"referrer-policy": "same-origin",
		"permissions-policy": "camera=(), microphone=(), geolocation=()",
	};

	test("every response that passes through handle carries them, the gate's redirect too, and no HSTS over plain HTTP", async () => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		try {
			const statuses: Record<string, number> = {};
			// Unclaimed, `/` is the gate's redirect.
			const responses: [string, Response][] = [
				["/setup", await request(`${server.url}/setup`)],
				["/", await request(`${server.url}/`)],
				["/healthz", await request(`${server.url}/healthz`)],
				// Bazarr's callback, off while the contract spike's keys are unset.
				[
					"the callback",
					await request(`${server.url}/bazarr/api/translate/content`, {
						method: "POST",
						headers: { "content-type": "application/json", "x-api-key": "k" },
						body: "{}",
					}),
				],
			];
			await claim(server);
			responses.push(["a 404", await request(`${server.url}/no-such-page`)]);
			for (const [what, response] of responses) {
				for (const [name, value] of Object.entries(ALWAYS)) {
					expect(response.headers.get(name), `${name} on ${what}`).toBe(value);
				}
				expect(response.headers.get("strict-transport-security"), what).toBeNull();
				statuses[what] = response.status;
			}
			expect(statuses).toEqual({
				"/setup": 200,
				"/": 303,
				"/healthz": 200,
				"the callback": 404,
				"a 404": 404,
			});
		} finally {
			await server.stop();
		}
	});

	test("a page's scripts carry its policy's nonce, and the browser reports no violation", async ({
		page,
	}) => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		try {
			const response = await fetch(`${server.url}/`);
			const policy = response.headers.get("content-security-policy") ?? "";
			const html = await response.text();
			const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
			expect(nonce).toBeDefined();
			// The spec's policy, directive for directive, with the nonce only on scripts.
			const directives = Object.fromEntries(
				policy.split(";").map((directive) => {
					const [name = "", ...sources] = directive.trim().split(/\s+/);
					return [name, sources.sort()];
				}),
			);
			expect(directives).toEqual({
				"default-src": ["'self'"],
				"script-src": [`'nonce-${nonce}'`, "'self'"].sort(),
				"style-src": ["'self'", "'unsafe-inline'"],
				"img-src": ["'self'", "data:"],
				"font-src": ["'self'"],
				"connect-src": ["'self'"],
				"frame-ancestors": ["'none'"],
				"frame-src": ["'none'"],
				"object-src": ["'none'"],
				"base-uri": ["'self'"],
				"form-action": ["'self'"],
			});
			const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
			expect(scripts.length).toBeGreaterThan(0);
			for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);

			const violations: string[] = [];
			page.on("console", (message) => {
				if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
			});
			await page.addInitScript(() => {
				document.addEventListener("securitypolicyviolation", (event) => {
					console.error(`Content Security Policy violation: ${event.violatedDirective}`);
				});
			});
			const visit = await page.goto(`${server.url}/`);
			await expect(page.locator("html[data-hydrated]")).toBeAttached();
			expect(violations).toEqual([]);
			// Chromium sends Sec-Fetch-Site to this loopback address over plain HTTP, so this checks
			// the loopback exemption: no HSTS.
			expect(visit?.headers()["strict-transport-security"]).toBeUndefined();
		} finally {
			await server.stop();
		}
	});

	for (const [value, message] of [
		["https://u:p@zimuarr.example", "ORIGIN must not hold credentials"],
		["https://zimuarr.example/app", "ORIGIN must not have a path"],
	] as const) {
		test(`the built server refuses ORIGIN=${value}, without echoing it`, async () => {
			const { exitCode, output } = await runToExit(root, { ORIGIN: value });
			expect(output.includes(value), "output holds the value").toBe(false);
			expect(output.includes("u:p@"), "output holds the credentials").toBe(false);
			expect(exitCode).toBe(1);
			expect(output).not.toContain("Listening on");
			const lines = output.split("\n").filter((line) => line.startsWith("ConfigError: "));
			expect(lines).toEqual([`ConfigError: ${message}`]);
		});
	}
});

test.describe("the cross-origin check", () => {
	const REFUSAL_POLICY =
		"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

	/** Serves a page as `http://evil.test/` that posts a form to `target` as soon as it loads. */
	async function postFromAnotherSite(page: Page, target: string) {
		await page.route("http://evil.test/", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: `<form method="post" action="${target}"><input name="a" value="1"></form>
					<script>document.forms[0].submit()</script>`,
			}),
		);
		const answer = page.waitForResponse((response) => response.url() === target);
		await page.goto("http://evil.test/");
		return answer;
	}

	test("a cross-site form POST gets the Access denied page, with the headers, its own policy and the viewer's language", async ({
		browser,
	}) => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		const context = await browser.newContext({ locale: "da-DK" });
		try {
			const page = await context.newPage();
			const response = await postFromAnotherSite(page, `${server.url}/`);
			expect(response.status()).toBe(403);
			const headers = response.headers();
			expect(headers["content-security-policy"]).toBe(REFUSAL_POLICY);
			expect(headers["x-frame-options"]).toBe("DENY");
			expect(headers["referrer-policy"]).toBe("same-origin");
			await expect(page.locator("html")).toHaveAttribute("lang", "da");
			await expect(page.locator("h1")).toHaveText("Adgang nægtet");
			await expect(page).toHaveTitle("Adgang nægtet");
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("on localhost, a same-origin POST without Sec-Fetch headers passes, and a JSON caller from another site gets JSON", async () => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		try {
			const url = server.url.replace("127.0.0.1", "localhost");
			const post = () =>
				request(`${url}/`, {
					method: "POST",
					headers: { origin: url, "content-type": "application/x-www-form-urlencoded" },
					body: "a=1",
				});
			// Past the check, an unclaimed instance's gate sends it to `/setup`.
			const unclaimed = await post();
			expect(unclaimed.status).toBe(303);
			expect(unclaimed.headers.get("location")).toBe("/setup");
			await claim(server);
			// Once claimed, SvelteKit answers that `/` has no form actions.
			expect((await post()).status).toBe(405);

			const other = await fetch(`${url}/`, {
				method: "POST",
				headers: { origin: "http://evil.test", accept: "application/json" },
				body: "{}",
			});
			expect(other.status).toBe(403);
			expect(await other.json()).toEqual({
				message: "The request was refused because it didn't come from this site.",
			});
			expect(other.headers.get("x-frame-options")).toBe("DENY");
		} finally {
			await server.stop();
		}
	});

	test("on a plain-HTTP host name that isn't loopback, the app's own form passes and another site's is refused", async () => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		await claim(server);
		// Chromium sends no Sec-Fetch headers to app.test over plain HTTP, so the check compares
		// Origin with Host there.
		const browser = await chromium.launch({
			args: ["--host-resolver-rules=MAP app.test 127.0.0.1"],
		});
		try {
			const page = await browser.newPage();
			const appUrl = server.url.replace("127.0.0.1", "app.test");
			await page.goto(`${appUrl}/`);
			const own = page.waitForResponse(
				(response) => response.url() === `${appUrl}/` && response.request().method() === "POST",
			);
			await page.evaluate(() => {
				const form = document.createElement("form");
				form.method = "post";
				form.action = "/";
				document.body.append(form);
				form.submit();
			});
			const ownResponse = await own;
			// `headerValue` reads what Chromium sent; `headers()` leaves out the Sec-Fetch headers.
			expect(await ownResponse.request().headerValue("sec-fetch-site")).toBeNull();
			expect(ownResponse.status()).toBe(405);

			const other = await postFromAnotherSite(page, `${appUrl}/`);
			expect(await other.request().headerValue("sec-fetch-site")).toBeNull();
			expect(other.status()).toBe(403);
		} finally {
			await browser.close();
			await server.stop();
		}
	});

	test("with ORIGIN set, Bazarr's callback, with neither browser header, still reaches its route", async () => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
			ORIGIN: "https://zimuarr.example",
		});
		try {
			// As Bazarr sends it (D20, C1): JSON, its key, and no Origin or Sec-Fetch-Site.
			const callback = await request(`${server.url}/bazarr/api/translate/content`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-api-key": "k" },
				body: "{}",
			});
			// The route's own answer, off while the contract spike's keys are unset: its plain-text
			// 404, not SvelteKit's page for a missing route.
			expect(callback.status).toBe(404);
			expect(await callback.text()).toBe("Not Found");
			// Any other path with neither header is refused.
			const other = await request(`${server.url}/`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			});
			expect(other.status).toBe(403);
		} finally {
			await server.stop();
		}
	});
});

test.describe("the setup gate", () => {
	test("every page sends a fresh instance to /setup, while /healthz and the callback answer for themselves", async ({
		page,
	}) => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
		});
		try {
			for (const path of ["/", "/no-such-page", "/healthz/more", "/setup/more"]) {
				const response = await request(`${server.url}${path}`);
				expect(response.status, path).toBe(303);
				expect(response.headers.get("location"), path).toBe("/setup");
			}
			const post = await request(`${server.url}/`, {
				method: "POST",
				headers: { origin: server.url, "content-type": "application/x-www-form-urlencoded" },
				body: "a=1",
			});
			expect(post.status).toBe(303);
			expect((await request(`${server.url}/setup`)).status).toBe(200);
			expect(await (await request(`${server.url}/healthz`)).text()).toBe("ok");
			// Bazarr's callback answers with its own status, here the spike's plain-text 404.
			const callback = await request(`${server.url}/bazarr/api/translate/content`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-api-key": "k" },
				body: "{}",
			});
			expect(callback.status).toBe(404);
			expect(await callback.text()).toBe("Not Found");
			// Its path is open whatever the method: a GET gets the route's own 405, not the gate's 303.
			expect((await request(`${server.url}/bazarr/api/translate/content`)).status).toBe(405);

			await page.goto(`${server.url}/`);
			await expect(page).toHaveURL(`${server.url}/setup`);
		} finally {
			await server.stop();
		}
	});
});

test.describe("the bootstrap token", () => {
	test("a fresh built server prints it before it listens, in no log entry or response", async () => {
		const server = await startServer(root, {
			ZIMUARR_DATABASE_PATH: join(root, "data", "zimuarr.db"),
			// Debug entries too, so no entry anywhere can hold the token unseen.
			ZIMUARR_LOG_DEBUG: "true",
		});
		try {
			const read = async (path: string) => (await fetch(`${server.url}${path}`)).text();
			const pages = await Promise.all(["/", "/healthz", "/no-such-page"].map(read));
			// Stopped first, so every entry it wrote, the shutdown's included, is in the output.
			await server.stop();
			const output = server.output();
			const line = output.split("\n").find((text) => text.startsWith("Setup token: ")) ?? "";
			const token = /Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(line)?.[1];
			expect(token).toBeDefined();
			expect(line).toContain(" /setup ");
			expect(line).toContain("claim this Zimuarr.");
			expect(output.indexOf("Setup token: ")).toBeLessThan(output.indexOf("Listening on"));

			// Neither form of the token, with or without its dashes, appears anywhere else.
			const forms = [token ?? "", (token ?? "").replaceAll("-", "")];
			const entries = output.split("\n").filter((text) => text.startsWith("{"));
			expect(entries.length, "the server logged entries, its shutdown's at least").toBeGreaterThan(
				0,
			);
			for (const form of forms) {
				expect(
					entries.some((entry) => entry.includes(form)),
					"a log entry holds it",
				).toBe(false);
				expect(
					pages.some((page) => page.includes(form)),
					"a response holds it",
				).toBe(false);
				expect(output.split(form).length - 1, "printed more than once").toBe(
					form === forms[0] ? 1 : 0,
				);
			}
		} finally {
			await server.stop();
		}
	});
});

test.describe("the claim", () => {
	const PASSWORD = "violet harbour lanterns";

	test("a wrong token is refused, the right one claims, and /setup is then gone, also after a restart", async ({
		page,
	}) => {
		const database = join(root, "data", "zimuarr.db");
		const first = await startServer(root, { ZIMUARR_DATABASE_PATH: database });
		// Every response's body, read in full before the check below.
		const reads: Promise<string>[] = [];
		page.on("response", (response) => {
			reads.push(response.text().catch(() => ""));
		});
		let token = "";
		try {
			token = /Setup token: ([a-z0-9-]{14}) /.exec(first.output())?.[1] ?? "";
			await page.goto(`${first.url}/setup`);
			await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
			// The fields sit in a `background` well inside the `surface` panel (DESIGN.md, "Inputs / Fields").
			await expect(page.locator("main")).toHaveCSS("background-color", "rgb(31, 64, 83)");
			for (const well of [
				page.locator("#token"),
				page.locator("#username"),
				page.locator("#password").locator(".."),
			]) {
				await expect(well).toHaveCSS("background-color", "rgb(16, 43, 59)");
			}

			await page.locator("#token").fill("aaaa-bbbb-cccc");
			await page.locator("#username").fill("Owner");
			await page.locator("#password").fill(PASSWORD);
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await expect(page.locator("#token-error")).toHaveText(
				"That setup token isn't valid. Use the newest one printed in the server console.",
			);
			await expect(page.locator("#token")).toHaveAttribute("aria-invalid", "true");
			// The refusal is in the error summary too, which takes focus and links to the token (D28).
			const summary = page.getByRole("region", { name: "There is a problem" });
			await expect(summary).toBeFocused();
			await expect(summary.getByRole("link")).toHaveAttribute("href", "#token");
			await expect(page.locator("#username")).toHaveValue("Owner");
			await expect(page.locator("#token")).toHaveValue("");
			await expect(page.locator("#password")).toHaveValue("");

			await page.locator("#token").fill(token.toUpperCase().replaceAll("-", ""));
			await page.locator("#password").fill(PASSWORD);
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await page.waitForURL(`${first.url}/`);
			expect((await fetch(`${first.url}/setup`)).status).toBe(404);
			const own = await fetch(`${first.url}/setup`, {
				method: "POST",
				headers: { origin: first.url, "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ token, username: "second", password: PASSWORD }),
			});
			expect(own.status).toBe(404);
		} finally {
			await first.stop();
		}

		const bodies = await Promise.all(reads);
		expect(
			bodies.some((body) => body.includes("That setup token isn")),
			"the refusal was read",
		).toBe(true);
		const output = first.output();
		const entries = output.split("\n").filter((line) => line.startsWith("{"));
		for (const secret of [token, token.replaceAll("-", ""), PASSWORD]) {
			expect(
				entries.some((entry) => entry.includes(secret)),
				"a log entry holds it",
			).toBe(false);
			expect(
				bodies.some((body) => body.includes(secret)),
				"a response holds it",
			).toBe(false);
		}

		const second = await startServer(root, { ZIMUARR_DATABASE_PATH: database });
		try {
			expect(second.output()).not.toContain("Setup token:");
			expect((await fetch(`${second.url}/setup`)).status).toBe(404);
			// The gate stays open: `/` is served, not sent to `/setup`.
			expect((await request(`${second.url}/`)).status).toBe(200);
		} finally {
			await second.stop();
		}
	});

	test("a backup copied from a stopped, claimed server starts claimed with the same key", async () => {
		const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();
		const folder = join(root, "data");
		const server = await startServer(root, {
			ZIMUARR_SECRET_KEY: key,
			ZIMUARR_DATABASE_PATH: join(folder, "zimuarr.db"),
		});
		await claim(server);
		await server.stop();

		// The backup procedure (SPEC-setup.md, "Backup and restore"): stop, copy the whole folder,
		// restore it elsewhere and start with the same master key.
		const restored = join(root, "restored");
		await cp(folder, restored, { recursive: true });
		const copy = await startServer(root, {
			ZIMUARR_SECRET_KEY: key,
			ZIMUARR_DATABASE_PATH: join(restored, "zimuarr.db"),
		});
		try {
			expect(copy.output()).not.toContain("Setup token:");
			expect((await fetch(`${copy.url}/setup`)).status).toBe(404);
		} finally {
			await copy.stop();
		}
	});
});
