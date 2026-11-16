# Tasks: `setup`

The spec is [docs/SPEC-setup.md](../docs/SPEC-setup.md), and the plan is [plan.md](plan.md). Each
task is one PR and writes its tests first, starting from obzorarr's tests for the same part at
`b59b909`. Each one updates AGENTS.md's status and structure, ticks off its items in `tasks/`, names
the sibling apps in its PR body where they apply, and runs `bun run --bun check`, `test`, `lint`,
`build`, `smoke` and `prek run --all-files --hook-stage manual` before every commit. Paths under
`src/lib/server/` are shortened to `server/`.

## Task 1: the database (D14) and the backup procedure

**Description:** Add the Drizzle and Turso pair, open and migrate the database at startup, and run
D14's validation. Startup moves into `server/services/setup/startup.ts`: the key, the configuration
(`ZIMUARR_DATABASE_PATH` for now), then the database, opened and migrated. Both tables go into the
first migration; no operations yet. The README gives the backup procedure.

**Acceptance criteria:**
- [x] `server/config/database-path.test.ts` first fails, then passes: the default against the
  working directory, an empty variable counting as unset, a folder that is created, and a folder
  that can't be created or written refused with one line naming the variable and never echoing the
  path, with a regular file as the parent, so it holds as root. `config/error-code.ts` holds the
  system-error helper `config/secret-key.ts` already has, and `config/config-error.ts` the error.
- [x] `server/db/migrate.test.ts` first fails, then passes, against a temporary file: the bundled
  migrations apply to a new database, both tables exist, a second run applies nothing, and the rows
  match Drizzle Kit's file migrator's but for the empty `hash`.
- [x] `server/db/client.test.ts` holds D5's rollback-isolation check, which fails on
  `drizzle-orm@1.0.0-rc.4`.
- [x] `server/services/setup/startup.test.ts` first fails, then passes: the key, the configuration
  and the database run in that order, and a failing step leaves no database opened or created.
- [x] `@tursodatabase/database`, `drizzle-orm` and `drizzle-kit` (`rc`) are exact-pinned dev
  dependencies at their newest releases (D27); `db:generate` runs Drizzle Kit, then
  `bun --bun biome format --write drizzle`; the first migration is generated, reviewed and
  committed; `drizzle.config.ts` lists `db/settings.ts` and `db/owner.ts`.
- [x] `settings` (key, value, update time) and `owner` (a fixed id, username, password hash,
  creation time; one row at most) match the spec.
- [x] `tests/e2e/setup.test.ts` first fails, then passes: the built server, on a new temporary
  file, starts, serves `/healthz`, and starts again on the same file applying nothing; it refuses
  an unwritable database folder without echoing the path. `playwright.config.ts` gives each run a
  temporary database, created and removed only in the runner process, and starts the server with
  `bun --no-install --no-env-file ./build`; `tests/e2e/secret-key.test.ts` starts its servers with
  `--no-install` too, its other flags unchanged.
- [x] `tests/contract/contract.test.ts` gives its server a database under `tests/contract/.state/`
  and `--no-install`; the contract job passes.
- [x] D14's validation passes with its evidence in the PR body: migrations, `check`, the built
  server through the native binding on Linux arm64 (this machine) and x64 (CI's `smoke`), with only
  `build/` and the platform package in a folder, rollback isolation, and all of it with failing
  `node`, `npm` and `npx` on `PATH`.

**Verification:** the gates above.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `drizzle.config.ts`, `drizzle/`, `src/env.ts`,
`src/hooks.server.ts`, `server/config/database-path.ts` (+ test), `server/config/config-error.ts`,
`server/config/error-code.ts`, `server/config/secret-key.ts`, `server/db/client.ts` (+ test),
`server/db/migrate.ts` (+ test), `server/db/settings.ts`, `server/db/owner.ts`,
`server/services/setup/startup.ts` (+ test), `tests/e2e/setup.test.ts`, `playwright.config.ts`,
`tests/e2e/secret-key.test.ts`, `tests/contract/contract.test.ts`, `README.md`
(`ZIMUARR_DATABASE_PATH`, backups and restore, running the build with `--no-install`),
`docs/SPEC.md` (the status line, the tech-stack table, the `db:generate` and `smoke` Commands rows,
the testing section, and "`bun ./build` needs no `node_modules`"), `docs/decisions.md` (D14 to
Decided with the validated pair; D15 drops the backup procedure), `AGENTS.md`.

**Size:** L. One coherent unit: D14's validation needs the client, the migrator and startup together
in the built server.

## Task 2: logging with redaction, and `handleError`

**Description:** The app's own logger: four levels, one JSON line per entry on standard output,
redacted before it is written, with debug behind `ZIMUARR_LOG_DEBUG`. A failed startup step is
logged, then thrown, and `handleError` logs unexpected errors through it.

**Acceptance criteria:**
- [x] `server/logging/redact.test.ts` first fails, then passes: obzorarr's cases at `b59b909`
  (every rule on its own and nested, encoded nested values, errors and their causes, the growth
  check for linear time) without the Plex allowlist cases, plus Bazarr's `apikey` query parameter
  and `X-Api-Key` header. The allowlist is empty.
- [x] `server/logging/logger.test.ts`: the entry's shape, one line per entry, debug dropped unless
  enabled, and the flush through a slow pipe.
- [x] `server/config/log-debug.test.ts`: `true`, `false`, empty as unset, and anything else refused
  with one line that doesn't echo the value; `startup.test.ts`: it is checked before the database
  is opened.
- [x] `setup.test.ts`: the built server with a bad `ZIMUARR_LOG_DEBUG` exits non-zero before
  "Listening on", printing one JSON entry that names the variable and never holds the value.
- [x] `server/logging/unexpected-error.ts`, which `handleError` in `src/hooks.server.ts` only calls,
  logs through the logger: its test, with a token in the error's message and in the URL's query,
  finds one redacted JSON entry with the path but no query, at `error` for an unknown error and
  `debug` for a 404, and nothing returned, so SvelteKit's generic message stands; `setup.test.ts`
  finds the built server's 404 logged that way.
- [x] A startup failure is one log entry and the thrown error (`startup.test.ts`); the built server
  still exits non-zero before it listens (`setup.test.ts`, `secret-key.test.ts`).
- [x] The contract harness tells log entries from the stand-in's event lines; the contract job
  passes.
- [x] No logging library.

**Verification:** the gates.

**Dependencies:** task 1.

**Files:** `server/logging/logger.ts` (+ test), `server/logging/redact.ts` (+ test),
`server/config/log-debug.ts` (+ test), `server/logging/unexpected-error.ts` (+ test), `src/env.ts`,
`src/hooks.server.ts`, `server/services/setup/startup.ts` (+ test), `tests/e2e/setup.test.ts`,
`tests/e2e/secret-key.test.ts` if the error's format changes, `tests/contract/contract.test.ts`,
`README.md` (logs, `ZIMUARR_LOG_DEBUG`), `docs/decisions.md` (D13's logging half to D11, the job
half stays open), `docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Task 3: shutdown

**Description:** On `SIGTERM`, `SIGINT` and `SIGHUP` (passed on to adapter-bun as `SIGTERM`), stop
the jobs and timers (none yet) while the adapter drains, leaving held callbacks to drain; on
`sveltekit:shutdown`, close the database, flush the logs and exit 0, or exit non-zero after a
5-second deadline. The handlers go in only in the built server, one turn after `init` resolves.

**Acceptance criteria:**
- [x] `server/services/setup/startup.test.ts` first fails, then passes: `SIGHUP` passed on as
  `SIGTERM`, the cleanup's order, a failed close still exiting 0, the deadline with a cleanup that
  never finishes exiting 1 after a bounded flush, no handler in `dev`, and the handlers one turn
  after startup.
- [x] `setup.test.ts`: `SIGHUP` and `SIGTERM` each shut the built server down with exit code 0.
- [x] The contract job passes, C11 included (the drain still holds a callback for the window).
- [x] The README lists adapter-bun's `SHUTDOWN_TIMEOUT`, `CONNECTION_IDLE_TIMEOUT` (not below the
  callback's heartbeat) and `BODY_SIZE_LIMIT`, and says the container's stop timeout must exceed
  `SHUTDOWN_TIMEOUT` plus 5 seconds.

**Verification:** the gates; Ctrl+C still stops `bun run --bun dev`.

**Dependencies:** task 2.

**Files:** `server/services/setup/startup.ts` (+ test), `server/logging/logger.ts` (the flush),
`src/hooks.server.ts`, `tests/e2e/setup.test.ts`, `README.md`, `docs/SPEC.md` (the testing
section), `AGENTS.md`.

**Size:** M.

## Task 4: the health endpoint

**Description:** `/healthz` reads and writes the database: one committed write and read of
`health.checked_at` in `settings`, at most once every 5 seconds and one at a time, `503` with
`unavailable` after 3 seconds or on a failure, and a log entry on each change of state.

**Acceptance criteria:**
- [x] `server/services/health.test.ts` first fails, then passes, against a temporary file: `200 ok`
  on a working database, `503` on a read-only and a closed one, `503` within the bound from a probe
  that never answers, requests within the window sharing one probe, a new probe after it, no
  success reused past it, no second probe while a timed-out one is still pending (later requests,
  past the window, get `503` with a fake clock), and one entry per change of state.
- [x] `routes/healthz/server.test.ts` keeps `text/plain` and `Cache-Control: no-store`.
- [x] `settings.ts` gains the named operations to write and read a key.
- [x] `smoke.test.ts` and `setup.test.ts` still get `ok` from `/healthz`.

**Verification:** the gates.

**Dependencies:** tasks 1 and 2 (it follows task 3 only because one PR runs at a time).

**Files:** `server/services/health.ts` (+ test), `src/routes/healthz/+server.ts` (+ test),
`server/db/settings.ts` (+ test), `docs/SPEC.md` (ground-floor choice 5, the testing section),
`AGENTS.md`.

**Size:** S.

## Checkpoint: after task 4

- [x] As in [plan.md](plan.md#checkpoint-after-task-4).

## Task 5: `ORIGIN`, the security headers and the CSP

**Description:** `config/origin.ts` reads and checks `ORIGIN` at startup. `handle` gains the headers
stage after the language; SvelteKit's `csp` option sets the nonce policy on every page. Ground-floor
choice 3 closes.

**Acceptance criteria:**
- [x] `server/config/origin.test.ts` first fails, then passes: unset, and a bare origin with and
  without a trailing `/`, accepted; an empty value, a path (raw, before parsing), query, fragment
  or credentials refused without echoing the value; `startup.test.ts`: a bad `ORIGIN` stops
  startup before the database file is created.
- [x] `server/security/headers.test.ts`: the spec's headers for HTTPS through `ORIGIN`, HTTPS
  through `Sec-Fetch-Site`, plain HTTP, `localhost`, `*.localhost` and loopback hosts, never
  `includeSubDomains`; and an immutable streaming response copied with its chunks still arriving
  one by one and its own `Cache-Control` and `X-Accel-Buffering` kept.
- [x] `setup.test.ts`: the headers on a page, `/healthz` and a 404, no HSTS over plain HTTP; the
  policy directive for directive; the page's scripts carry the nonce and the browser reports no
  CSP violation; the server refuses `ORIGIN=https://u:p@host` and `https://host/app` without
  echoing either.
- [x] The contract job passes, its hold cases included.

**Verification:** the gates; `preview`'s headers checked by hand at `/` in both languages.

**Dependencies:** task 4.

**Files:** `server/config/origin.ts` (+ test), `server/security/headers.ts` (+ test), `src/env.ts`,
`src/hooks.server.ts`, `server/services/setup/startup.ts` (+ test), `vite.config.ts`,
`tests/e2e/setup.test.ts`, `README.md` (`ORIGIN`), `docs/SPEC.md` (ground-floor choice 3, the
testing section), `AGENTS.md`.

**Size:** M.

## Task 6: the cross-origin check

**Description:** `security/cross-origin.ts`, the first check after the language and the headers, on
every method but GET, HEAD and OPTIONS, with Bazarr's callback as its one machine route, checked
before the `ORIGIN` branches. SvelteKit's own form check goes off in the same PR. A refusal is the
"Access denied" page with its own policy and `<html lang>`, or `{ message }` for JSON callers, from
`security/access-denied.ts`.

**Acceptance criteria:**
- [x] `server/security/cross-origin.test.ts` first fails, then passes: obzorarr's matrix, plus the
  callback's method and path with neither header passing with `ORIGIN` set and unset, the same
  request on another path or method refused, and the callback's path with a cross-site `Origin`
  refused.
- [x] `vite.config.test.ts` (in the `unit` project) asserts that the options `vite.config.ts`
  exports and passes to `sveltekit()` trust every origin and leave remote functions off.
- [x] `server/security/access-denied.test.ts`: the page in each language with its policy, and the
  JSON error.
- [x] `setup.test.ts`: a cross-site form POST gets the 403 page with the headers, its own policy and
  the viewer's language; a same-origin POST with no `Sec-Fetch-*` headers passes (SvelteKit's 405),
  on `localhost` and on `app.test`; with `ORIGIN` set, a POST to the callback's path with neither
  header reaches the route (`404` with the spike's keys unset).
- [x] C1's comment in `contract.test.ts` points to SPEC-setup.md; the contract job passes.
- [x] The page's text is `error_access_denied_…` messages in both languages.

**Verification:** the gates.

**Dependencies:** task 5.

**Files:** `server/security/cross-origin.ts` (+ test), `server/security/access-denied.ts` (+ test),
`src/hooks.server.ts`, `vite.config.ts`, `vite.config.test.ts`, `messages/en.json`,
`messages/da.json`, `tests/e2e/setup.test.ts`, `tests/contract/contract.test.ts`, `README.md` (when
`ORIGIN` or the proxy fix is needed), `docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Checkpoint: after task 6

- [x] As in [plan.md](plan.md#checkpoint-after-task-6).

## Task 7: the bootstrap token

**Description:** While no owner exists, startup prints a bootstrap token to standard output with
`/setup` (the full address when `ORIGIN` is set), outside the logs, and a new one every 15 minutes.
Shutdown stops the timer. First run's state is loaded into memory at startup.

**Acceptance criteria:**
- [x] `server/security/bootstrap-token.test.ts` first fails, then passes: the format and alphabet,
  the unbiased draw (a mocked byte stream), display, entry with or without dashes in any case,
  constant-time comparison and the 15-minute boundary.
- [x] `server/services/setup/first-run.test.ts`, against a temporary file and with a fake clock: a
  token printed and a new one at expiry; held back while a claim is in progress; stopped by
  shutdown; the full address with `ORIGIN`; none once an owner exists.
- [x] `owner.ts` gains `ownerExists`; startup's signal handler stops the timer.
- [x] `setup.test.ts`: the built server prints the token line before "Listening on", and neither
  form of the token appears in a log entry or a response.

**Verification:** the gates.

**Dependencies:** task 6.

**Files:** `server/security/bootstrap-token.ts` (+ test), `server/services/setup/first-run.ts`
(+ test), `server/services/setup/startup.ts` (+ test), `server/db/owner.ts` (+ test),
`tests/e2e/setup.test.ts`, `docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Task 8: the claim at `/setup`

**Description:** The claim form and its action, in the spec's order: the fields, then the token
(checked and used up with no `await` between), then the hash, then one transaction that creates the
owner and moves the step pointer. It completes first run and sends the browser to `/`; then
`/setup` and its action answer "not found". The page is zimuarr's first real surface, so the fonts
and Lucide join here. No gate yet.

**Acceptance criteria:**
- [x] `server/security/password.test.ts` first fails, then passes: the rules at their limits, NFC
  and case, the patterns (obzorarr #337 and #342's cases), `zimuarr` and the username inside the
  password, the bundled list, and an argon2id round trip.
- [x] `security/common-passwords.txt` is obzorarr's file, unchanged; `password.ts` names its source
  and how to rebuild it.
- [x] `server/services/setup/claim.test.ts`, against a temporary file: success; a field error
  leaving the token unused; a wrong and an expired token never reaching the hash; a second claim;
  two at once leaving one owner; a failed transaction printing a new token, but none once stopping.
- [x] `first-run.test.ts`: a restart on a claimed database starts complete and prints nothing.
- [x] `setup.test.ts`: a wrong token refused with the spec's message, the username kept and the
  token and password cleared; the right one, in upper case without dashes, claims and lands on
  `/`; `/setup` and its action then answer 404, also after a restart; a copy of the stopped,
  claimed server's folder, started elsewhere with the same key, prints no token and answers 404 at
  `/setup` (the backup test);
  neither the token nor the password in a response or a log entry.
- [x] `@fontsource-variable/public-sans`, `@fontsource-variable/roboto-mono` and `@lucide/svelte`
  are exact-pinned dev dependencies; the root layout imports the fonts and `panda.config.ts` names
  the families; the token field uses the `code` style.
- [x] The page follows `route-setup.md` through `/impeccable`, with the language switcher and the
  text wordmark; every string is a `setup_…` message in both languages. Checked at 360, 390, 768
  and 1440 px, 200% zoom, the keyboard and reduced motion, in every state the brief names, in
  English and Danish, with captures in the PR body.
- [x] `routes/setup/token-format.test.ts`: the dashes, the caret and Backspace across a dash.

**Verification:** the gates; a claim by hand in `preview` over plain HTTP on a LAN address.

**Dependencies:** task 7.

**Files:** `server/security/password.ts` (+ test), `server/security/common-passwords.txt`,
`server/services/setup/claim.ts` (+ test), `server/services/setup/first-run.ts` (+ test),
`server/db/owner.ts`, `server/db/settings.ts`, `src/routes/setup/+page.svelte`,
`src/routes/setup/+page.server.ts`, `src/routes/setup/token-format.ts` (+ test),
`src/routes/+layout.svelte`, `panda.config.ts`, `package.json`, `bun.lock`, `messages/en.json`,
`messages/da.json`, `tests/e2e/setup.test.ts`, `.impeccable/surfaces/route-setup.md` (its status,
through Impeccable), `DESIGN.md` if Impeccable's `document` refreshes it, `docs/SPEC.md` (the
tech-stack table, ground-floor choice 1, the testing section), `AGENTS.md`.

**Size:** L. One coherent unit: the credential rules and the fonts have no user before the claim
page.

## Task 9: the setup gate

**Description:** The gate is the last stage in `handle`: until first run is complete, every request
except `/setup`, `/healthz` and the machine routes' paths gets a 303 to `/setup`. Playwright's
global setup claims the instance, so the smoke and language tests run on a claimed instance.

**Acceptance criteria:**
- [ ] `first-run.test.ts` gains the gate's decision for each path, the callback's path with any
  method and SvelteKit's `__data.json` paths (`/__data.json`, `/x/__data.json`) included, before
  and after the claim and after a restart.
- [ ] `setup.test.ts`: every page sends a fresh instance to `/setup`, while `/healthz` answers `ok`
  and the callback's path answers with its own status; the gate's redirect carries the headers;
  after a restart on a claimed file, `/` is served without a redirect. The earlier tests that
  expect a 404 or a same-origin POST's 405 claim their own servers first.
- [ ] `playwright.config.ts`: the `wait.stdout` pattern runs from the token line through
  "Listening on" and replaces the `url` check; `tests/e2e/global-setup.ts` claims through the form;
  `smoke.test.ts` and `i18n.test.ts` pass unchanged.
- [ ] The contract job passes against an unclaimed server.
- [ ] The README's first run: the token in the console, `/setup`, the password rules, and who can
  claim.

**Verification:** the gates; success criterion 2 by hand: a fresh built server prints a token, sends
every page to `/setup`, is claimed once over plain HTTP from another machine on the LAN, and then
serves `/` with the headers and CSP.

**Dependencies:** task 8.

**Files:** `server/services/setup/first-run.ts` (+ test), `src/hooks.server.ts`,
`tests/e2e/global-setup.ts`, `tests/e2e/setup.test.ts`, `playwright.config.ts`, `README.md`,
`docs/SPEC.md` (the testing section), `AGENTS.md`.

**Size:** M.

## Checkpoint: complete

- [ ] As in [plan.md](plan.md#checkpoint-complete).

## Task 10: close the work stream

**Description:** Cleanup procedure 2: mark `setup` built in SPEC.md (the status line, row 4, "Open
decisions"), reduce SPEC-setup.md to what code and tests can't say, update AGENTS.md's status, and
delete `tasks/`. The PR body maps every removed requirement to a test or a remaining doc (the
preservation gate) and lists what the sibling apps port.

**Acceptance criteria:**
- [ ] Every item in "Docs this module changes when built" is done.
- [ ] Nothing in SPEC-setup.md is cut without a test or doc named for it in the PR body.

**Verification:** prek (the `docs-set` hook) and CI.

**Dependencies:** task 9.

**Files:** `docs/SPEC.md`, `docs/SPEC-setup.md`, `AGENTS.md`, `tasks/` (deleted).

**Size:** S.
