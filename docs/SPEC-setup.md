# Spec: `setup`

**Status:** built (2026-11-16), module 4 of the capability map ([docs/SPEC.md](SPEC.md)), approved
by the owner (2026-11-16) with its six dependencies, the `/setup` brief and the text wordmark. D11,
D13, D14 and D15 hold the decisions, and it closed ground-floor choices 1, 3 and 5 (the health
endpoint's job-runner half comes with the first job, D13). This file keeps what the code and tests
can't say. The full text before this cut is `8d810a2:docs/SPEC-setup.md`.

**Ported from obzorarr,** the reference app for `setup`
([Shared groundwork](../AGENTS.md#shared-groundwork)): its spec as approved
(`0fb3565:docs/SPEC-setup.md`), the follow-ups #337, #339, #340, #341 and #342, and its code and
tests at `b59b909`. What differs here:
- **Bazarr's callback,** zimuarr's one machine route today: the cross-origin check passes it on to
  its own key check before the `ORIGIN` branches, the setup gate lets its path through, shutdown
  drains it like any request, and the headers stage keeps its held answer streaming
  ([Bazarr's callback](#bazarrs-callback));
- **the health endpoint:** `/healthz` reads and writes the database instead of always answering
  `ok` ([The health endpoint](#the-health-endpoint));
- **backups:** the procedure is defined and tested here, where obzorarr only documents it
  ([Backup and restore](#backup-and-restore));
- **the fonts and icons:** the claim page is zimuarr's first real surface, so it bundles DESIGN.md's
  Public Sans and Roboto Mono, with Lucide for its eye icon, and its brief is zimuarr's own
  ([`route-setup.md`](../.impeccable/surfaces/route-setup.md));
- **logging:** the redaction allowlist holds only names zimuarr logs, unexpected errors reach the
  logger through `handleError`, and a failed startup flushes its entry before it throws, none of
  which obzorarr has ([Logging](#logging));
- **messages:** the app's name is a `{{name}}` placeholder and every limit the claim page names
  comes from the constant the code checks, as SPEC-i18n.md requires;
- **what obzorarr's spec leaves to `plex-connection`** (environment locks, settings versions,
  settings URLs, Plex fingerprints in logs) has no counterpart here;
- **names:** `ZIMUARR_` variables, "Zimuarr" in the token line and the password rule, and the
  decision numbers: obzorarr's D20, D15, D14, D16, D17 and D11 are zimuarr's D17, D14, D13, D15,
  D16 and D11.

**Reading the marks.** A bullet or clause marked "(zimuarr)" is this app's own; the rest is
obzorarr's shared wording. A "(zimuarr)" mark inside a bullet covers the rest of that bullet, and
"(zimuarr: …)" only its own parentheses.

## Objective

A fresh install starts safely and is claimed by its one owner (D17): the configuration is checked
and the database opened and migrated before any request is served; entries are logged as redacted
JSON; every state-changing request passes the cross-origin check, and every rendered response
carries the security headers and a nonce-based CSP; until the claim, every page sends the visitor
to `/setup`, where the bootstrap token printed to the console creates the owner account; and
(zimuarr) `/healthz` says whether zimuarr can serve, from its database.

**Left out on purpose:** signing the owner in at the claim, sessions, the browser's address, the
address hint, rate limits, cookies and the error pages (`sign-in`); the two-factor offer
(`two-factor`); every later first-run step; the job runner's half of the health endpoint (the first
module with a job). Until `sign-in` is built, a claimed instance has no way to sign in, and first
run ends at the claim ([Before `sign-in`](#before-sign-in)).

## Configuration and startup checks

Each of the app's own variables is read once, at startup, by its own file in `config/`, and
`src/env.ts` declares it (SvelteKit 3 exposes only declared variables). An empty variable counts as
unset (D26's rule; `ORIGIN` differs, below), and a failed check stops startup with one line naming
the variable and what is wrong, never echoing the value.

**adapter-bun's own variables** (`SHUTDOWN_TIMEOUT`, `CONNECTION_IDLE_TIMEOUT`, `BODY_SIZE_LIMIT`)
are read and checked by the adapter, with its own defaults and messages, which may echo a malformed
value; the app adds no code for them, and the README lists them. The container's stop timeout must
exceed `SHUTDOWN_TIMEOUT` plus the app's 5-second cleanup, so the image's Compose templates set
`stop_grace_period` (Docker's default is 10 seconds). (zimuarr: this is stricter than the grace
period of at least the drain window that D25 asks `translation` to document, and `translation`
cites it when it documents its own.) The adapter already exempts event streams from
`CONNECTION_IDLE_TIMEOUT`. (zimuarr) Bazarr's held callback isn't an event stream: its keep-alive
space must come more often than that timeout (D25), so the README says to keep it above the
5-second heartbeat. `BODY_SIZE_LIMIT` stays at its default: the longest realistic callback is under
half of it (`contract-spike`, C12).

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. It is checked twice:
- **adapter-bun** reads it when the server module loads, before `init`, and uses it to correct
  SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own message,
  which includes the value, so the container image's entrypoint unsets an empty `ORIGIN` and its
  templates leave it out (the image's work, not this repo's).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials, with a backslash read as a slash, as the parser reads it.

The cross-origin check, the strict-transport decision and `sign-in`'s browser's address all use the
one value `config/origin.ts` gives. (zimuarr) `ORIGIN` is never the address Bazarr calls zimuarr at,
which `bazarr-instances` suggests and stores per instance.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served: the master key,
the configuration, the database (D5: the app is its one migration owner), then each module's
startup work in a fixed order, then the jobs. A job that fails to start is logged, not fatal. A
failure before the jobs is logged and thrown from `init`: the built server exits non-zero before it
listens, and the dev server stays up with every request failing. (zimuarr) The failure's entry is
flushed first, for at most a second, so it isn't lost behind a slow reader.

**Shutdown.** adapter-bun drains open requests for `SHUTDOWN_TIMEOUT`, exits at once on a second
signal, and emits `sveltekit:shutdown` without waiting for its listeners. So the app stops the jobs
and timers and closes open event streams on the signal, so browsers reconnect, while the adapter
drains; on `sveltekit:shutdown` it waits for those jobs, closes the database, flushes the logs and
exits 0; and if that cleanup hasn't finished 5 seconds after `sveltekit:shutdown`, it exits non-zero
anyway, even with an upstream call still outstanding. `SIGHUP` counts as a stop. (zimuarr) Held
Bazarr callbacks are not closed: the adapter drains them like any request and cuts what is still
open when its window ends (D25, contract test C11). What survives a restart is `translation`'s.

## The database

D5, D6 and D14 hold the engine, the access rules and the validated versions.

**Tables:**
- **`settings`:** one value per key. `setup` stores first run's step pointer here, and the health
  probe its own row; later modules add their own keys.
- **`owner`:** one row at most, enforced by the schema. `two-factor` and `oidc-sign-in` add their
  fields.

### Backup and restore

(zimuarr) The database is one file plus the files Turso keeps beside it (`zimuarr.db-wal`), so a
backup is the whole folder, copied while zimuarr is stopped, with the master key kept apart; a
restore puts the folder back and starts with the same key (D26), and after a bad upgrade, with the
release the copy was taken with, since migrations only go forward. The README gives the steps, and
an e2e test restores a copy; the restore checks still to come are in
[SPEC.md](SPEC.md#open-decisions-each-module-closes).

An online backup, which needs no stop, is left out, because embedded Turso's online backup isn't
validated. Its cost: a callback still held when the drain window ends fails its Bazarr job, since
Bazarr's three attempts are over within seconds while zimuarr is stopped (D20).

## Logging

D11 holds the decision and why the app has its own logger. Four levels, debug dropped unless
`ZIMUARR_LOG_DEBUG` is on. Each entry is one JSON line on standard output with `time` (ISO, to the
millisecond), `level`, `source`, `message` and `metadata`.

**Redaction** runs before an entry is written:
- credentials in URLs, and token-like query parameters, also inside a parameter's value once
  percent-decoded (up to three times); such a value is redacted whole;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key,
  except the names `redact.ts` lists as holding no credential, whose values are still cleaned like
  any other;
- a `Secret` (`secrets`) is already `[redacted]`.

(zimuarr) The allowlist holds only names zimuarr logs: it starts empty, without obzorarr's Plex ids
or the generic names nothing here logs yet, and each module that logs a name the rules redact
without cause adds it, with a test, when no value it can hold is a credential. A provider's
authentication error, which can echo part of its key in prose, is `providers`' to judge against
real error bodies.

**Unexpected errors** (zimuarr) in a page load, form action or endpoint reach SvelteKit's
`handleError` hook, which logs them through the logger, so they are redacted and one JSON line,
never SvelteKit's default `console.error` of the stack, with the path but never the query. An
unknown error, or one of SvelteKit's own of 500 or more, is an `error` entry; the rest, a scanner's
404s, is `debug`. The app's own `error(…)` reaches the hook without its status, so the module that
throws a 5xx that way logs its own cause. The hook returns nothing, so the browser gets SvelteKit's
own message, and it never throws, since SvelteKit would then print the raw error. obzorarr has no
`handleError`; the comradarr port found the gap, and the owner added it here (2026-11-16).

Console output meant for whoever runs the server, such as the bootstrap token, is never a log
entry. It still reaches the container's output, which is why the console is trusted (below).
(zimuarr) The contract spike's stand-in prints its callback events as JSON lines on the same output
until `translation` decides what it keeps; the contract harness tells them apart from log entries.

## The request checks

`handle` runs the language (`i18n`), the security headers, the cross-origin check, then the setup
gate; `sign-in` adds its stages between the cross-origin check and the gate. Every refusal is
returned, never thrown ([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it keeps the
language and the headers.

### The cross-origin check

SvelteKit's own form check compares the browser's `Origin` with `event.url`, which adapter-bun
builds as `https` unless `ORIGIN` or a protocol header says otherwise, so it would refuse the claim
over plain HTTP. So that check is off, remote functions stay off (they would need `ORIGIN` too), and
the app's own check replaces it. It asks the browser, through `Sec-Fetch-Site` and `Origin` (the
rules and their order are in `cross-origin.ts` and its test matrix), so the app needs no address of
its own and stores none.

What later modules must keep:
- **Requests from no browser,** with neither `Origin` nor `Sec-Fetch-Site`, pass only on an explicit
  list of machine routes, each with the credentials the app's approved docs require for it, such as
  the API-key endpoints. The session cookie is never honoured on one: such a request carrying only a
  session cookie gets a 403 (`sign-in` adds this once the cookie exists). (zimuarr) The list,
  `MACHINE_ROUTES` in `cross-origin.ts`, is Bazarr's callback, and `api-keys` adds the versioned
  JSON API. The check doesn't check their keys: the request goes on to the route's own. This rule
  comes before the `ORIGIN` branches: in obzorarr, which has no machine routes, the `ORIGIN` branch
  refuses such a request on its own, so a copy that kept that order would refuse every callback
  once `ORIGIN` is set.
- **The refusal** is the app's own "Access denied" page, or a JSON `{ message }` for JSON callers;
  `sign-in`'s error pages reuse its messages.

**When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
16.4, Firefox before 90, Chrome before 76). The README gives the fix.

**Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow a
rebind, and those are gated by a console token or rate-limited (zimuarr: the machine routes also
need their keys).

`security/cross-origin.ts` is one pure module, obzorarr's with zimuarr's machine routes joining
it, as D17 shares the opening modules.

### Security headers and CSP

The headers go on every response that passes through `handle`, and the policy on every page,
through SvelteKit's `csp` option in nonce mode. No page is prerendered (`i18n` already forbids it),
so every page gets its own nonce. The choices the code can't explain:
- **`Referrer-Policy: same-origin`,** never `no-referrer`, which makes browsers send `Origin: null`
  on the app's own form posts.
- **Strict transport** only over HTTPS, known when `ORIGIN` is `https`, or, when `ORIGIN` is unset,
  from `Sec-Fetch-Site` sent to a host that isn't `localhost`, `*.localhost` or loopback, since
  browsers send it only to HTTPS and those hosts. Never `includeSubDomains`: other apps may share
  the domain. An accepted risk: HSTS covers every port of the host name, so another app on the same
  host over plain HTTP becomes unreachable from that browser until it moves to HTTPS.
- **`style-src 'unsafe-inline'`:** `src/app.html` and server-rendered pages carry style
  attributes, which a nonce can't cover, and styles can't run code.
- (zimuarr) No module adds a host: the browser never loads anything from Bazarr or a provider; the
  server calls them.
- **A page a `handle` stage builds itself,** such as the refusal, never passes through SvelteKit's
  renderer, so the stage sets its own fixed, stricter policy and `<html lang>`.

**A limit:** responses produced before `handle` carry none of these headers: the built files, which
adapter-bun serves itself, and the adapter's own 400 and 413 answers. None is a document, so
framing and the CSP don't apply to them, and Bun sends each file with its real content type.

### Bazarr's callback

(zimuarr) `POST /bazarr/api/translate/content` answers `200` at once and holds the body open with
keep-alive spaces while the work runs (D25), so every `handle` stage runs before that `200`, as
D25's "Checks come first" asks. The headers stage sets the security headers on the response object
without reading its body (a response whose headers can't change is copied with its body still a
stream), and keeps the callback's own `Cache-Control` and `X-Accel-Buffering`. The cross-origin
check passes Bazarr's request on as a machine route, and the setup gate lets its path through, so
it answers with its own status before the claim too: Bazarr would follow a 303 to an HTML page and
fail on invalid JSON. The contract tests are the evidence that its answers didn't change.

### The health endpoint

(zimuarr) `/healthz` is public, so it says only whether zimuarr itself can serve: `ok` while its
database can be read and written, `503 unavailable` otherwise.
- **The probe** commits a write of its own `settings` row and reads it back, since a read alone or
  a rolled-back write never reaches the disk and misses a read-only or full volume. A full disk can
  still go unnoticed while Turso's write-ahead log has room to reuse.
- **Because it is public,** a probe runs at most once every 5 seconds and one at a time; a probe
  that hasn't answered within 3 seconds is unhealthy, and while it still hangs no second probe
  starts, so a stuck database never piles up probes.
- An unreachable Bazarr instance or provider never fails it, so a container health check never
  marks zimuarr unhealthy for someone else's outage; it shows no version (D22) and no names.
  Instances, providers, jobs, the last observation of each instance and the breakers are shown
  behind sign-in on `/system` (`system`).
- The first module with a background job adds "or its job runner has stopped" (D7).

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
except the current first-run step, `/healthz`, (zimuarr: the paths of the cross-origin check's
machine routes, whatever the method,) and the responses produced before `handle` gets a 303 to that
step. Sign-in and first run's own helpers join the exceptions when their modules add them. It reads
first run's state from memory, which startup loads and the claim updates (one process, D16).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't
skip ahead: each step's action checks that it is the current step, a step that offers Previous only
moves the pointer back, and only the last step's action completes first run. Every step after the
claim needs the owner's session, which `sign-in` brings. (zimuarr) The steps are the claim, the
two-factor offer (`two-factor`) and Connect Bazarr at `/setup/bazarr` (`bazarr-instances`), in that
order (D17).

**The bootstrap token** (D17) is held only in memory, printed to standard output with the path
`/setup`, and the full address when `ORIGIN` is set, since the server doesn't otherwise know its
address. A new one is printed every 15 minutes until the claim, and none after it.

**The claim** checks the fields, then checks the token and uses it up with no `await` in between,
then hashes the password, then creates the owner and moves the step pointer in one transaction. The
cheap checks come first so a wrong guess never costs a hash, and a field error leaves the token
unused. The claim stores no address, and nothing but the owner row and the pointer. A failed claim
answers with the "Error: " title and the error summary first in the form (D28): its field problems
link to their fields, and its page-level one (a server failure) marks no field. It keeps the last
answer until the next, while a field's own message clears as it is edited. With JavaScript it takes
focus after each failure; without, nothing is focused. Once the claim succeeds, it no longer exists:
`/setup` answers "not found" once first run is complete (D17), and the claim action answers it
whenever the instance is claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **The username** is stored with its case kept, and `sign-in` compares it after `toLowerCase()`,
  so case doesn't matter.
- **The password** needs 15 characters because that is NIST SP 800-63B-4's minimum for a password
  that is the only factor, which it is until two-factor is turned on. NIST also requires a
  blocklist, and length alone accepts the long passwords such lists hold, so the bundled list of
  common passwords is checked too: obzorarr's file, unchanged (obzorarr's owner chose the list,
  2026-11-12). `password.ts` names its source and how to rebuild it. The list holds only some
  patterns, so the password also may not be, as a whole, one unit of up to 4 characters repeated or
  one straight run up or down. There are no composition rules.
- **The hash** is of the NFC form, so `sign-in` verifies what was hashed. The password is never
  logged or returned.
- **The form** has one password field with a control that shows what was typed, and no
  confirmation field.

**The page** follows its brief, [`route-setup.md`](../.impeccable/surfaces/route-setup.md), whose
Decisions record what the build settled. (zimuarr) Its messages take the app's name as `{{name}}`,
and every limit they name from `CLAIM_LIMITS`, the constants the claim checks, so the text can't
drift from the rules (SPEC-i18n.md, "Placeholders").

**Trust:** anyone who can read the server console can claim a fresh install.

## Before `sign-in`

`setup` is built before `sign-in`, which brings the rest of the protections. Until then:
- **Rate limits:** none. The token has 62 bits and lasts 15 minutes, and a wrong token costs no
  hash, so guessing it isn't practical; `sign-in` adds the claim's limit.
- **The browser's address and cookies:** the claim sets no cookie yet, so it needs neither. Once
  `sign-in` starts the owner's session at the claim, the claim needs the browser's address, and the
  session follows `sign-in`'s cookies.
- **First run ends at the claim,** its only step: the claim completes first run and sends the
  browser to `/`. `sign-in` signs the new owner in at the claim, and `two-factor` adds the first
  step after it, from which on the claim no longer completes first run.

No release is cut between `setup` and `sign-in`.

## Fonts and icons

(zimuarr) The claim page, the first surface, bundles DESIGN.md's typefaces from fontsource, so no
page requests a remote font, and the Panda tokens name the families they register. Lucide gives
DESIGN.md's single 20px line family, its eye icon first. The visible name stays the text "Zimuarr"
(ground-floor choice 4).

## Boundaries

- **Always:** startup finishes before the first request; reviewed migrations; named database
  operations and short transactions (D6); redaction before writing; the token only in memory and on
  the console; the cheap checks before the hash; refusals in `handle` returned, never thrown; every
  `handle` stage before the callback's `200`.
- **Ask first:** another database engine; a logging library; a second owner or any role (D17); a
  name in the redaction allowlist that can hold a credential.
- **Never:** a token or password in a log entry, response or the database (only the hash); a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`; closing a
  held Bazarr callback at shutdown's signal; a provider or Bazarr host in the CSP.
