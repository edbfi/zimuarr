# Spec: `setup`

**Status:** proposed for the owner's approval. Module 4 of the capability map
([docs/SPEC.md](SPEC.md)); it closes D14, the logging half of D13, D15's backup and restore
procedure, and ground-floor choices 1, 3 and 5 (the health endpoint's job-runner half comes with
the first job, D13).

**Ported from obzorarr,** the reference app for `setup`
([Shared groundwork](../AGENTS.md#shared-groundwork)): its spec as approved
(`0fb3565:docs/SPEC-setup.md`), the follow-ups #337 (the password-pattern rule), #339 (the
redaction allowlist), #340 (encoded nested URLs in logs), #341 and #342, and its code and tests at
`b59b909`. What differs here:
- **Bazarr's callback,** zimuarr's one machine route today: the cross-origin check passes it on to
  its own key check, the setup gate lets it through, shutdown drains it like any request, and the
  headers stage keeps its held answer streaming ([Bazarr's callback](#bazarrs-callback));
- **the health endpoint:** `/healthz` reads and writes the database instead of always answering
  `ok` (ground-floor choice 5; [The health endpoint](#the-health-endpoint));
- **backups:** the procedure is defined and tested here, where obzorarr only documents it
  ([Backup and restore](#backup-and-restore));
- **the fonts:** the claim page is zimuarr's first real surface, so it bundles DESIGN.md's Public
  Sans and Roboto Mono (ground-floor choice 1), and its brief is new
  ([`route-setup.md`](../.impeccable/surfaces/route-setup.md));
- **the redaction allowlist** holds only names zimuarr logs ([Logging](#logging));
- **the contract tests' server** gets a database of its own for each run;
- **what obzorarr's spec leaves to `plex-connection`** (environment locks, settings versions,
  settings URLs, Plex fingerprints in logs) has no counterpart here;
- **names:** `ZIMUARR_` variables, "Zimuarr" in the token line and the password rule, and the
  decision numbers: obzorarr's D20, D15, D14, D16, D17 and D11 are zimuarr's D17, D14, D13, D15,
  D16 and D11.

**Reading the marks.** As in the capability map's Module notes: a bullet or clause marked
"(zimuarr)" is this app's own, and the rest is obzorarr's shared wording. A "(zimuarr)" mark inside
a bullet covers the rest of that bullet, and "(zimuarr: …)" only its own parentheses.

## Objective

A fresh install starts safely and is claimed by its one owner (D17):
1. **Startup:** the configuration is checked, the database opened and migrated, and each module's
   startup work run, before any request is served; shutdown stops work, drains and closes cleanly.
2. **The database** (D5, D6): embedded Turso through Drizzle, with reviewed migrations, a settings
   store and the owner account, and a tested backup and restore.
3. **Logging** (D11): structured entries on standard output, redacted before they are written.
4. **The request checks:** the cross-origin check on every state-changing request, and security
   headers and a nonce-based CSP on every response the app renders (ground-floor choice 3).
5. **First run:** the setup gate, the bootstrap token printed to the console, and the claim, which
   creates the owner account.
6. **Health** (zimuarr): `/healthz` says whether zimuarr can serve, from its database.

**Left out on purpose:** signing the owner in at the claim, sessions, the browser's address, the
address hint, rate limits, cookies and the error pages (`sign-in`); the two-factor offer
(`two-factor`); every later first-run step; the job runner's half of the health endpoint (the first
module with a job). Until `sign-in` is built, a claimed instance has no way to sign in, and first
run ends at the claim ([Before `sign-in`](#before-sign-in)).

**Capability-map changes** with this spec, as obzorarr made with its own: the cross-origin check,
`ORIGIN` and the owner's password rules move from row 5 (`sign-in`) to row 4, since the claim is
the first form and sets the first password; their Module notes move here, and the `setup` block of
the Module notes moves here too.

## Configuration and startup checks

Each of the app's own variables is read once, at startup, by its own file in `config/`, and
`src/env.ts` declares it (SvelteKit 3 exposes only declared variables). For these, an empty
variable counts as unset (D26's rule; `ORIGIN` differs, below), and a check that fails stops
startup with one line naming the variable and what is wrong, never echoing the value.

| Variable | Default | Checked |
|---|---|---|
| `ZIMUARR_SECRET_KEY`, `…_FILE` | — | as `secrets` checks them (D26) |
| `ZIMUARR_DATABASE_PATH` | `data/zimuarr.db`, against the working directory | its folder exists or can be created, and is writable |
| `ORIGIN` | unset | below |
| `ZIMUARR_LOG_DEBUG` | off | `true` or `false` |

The contract spike's variables keep their own checks in `config/contract-spike.ts`.

**adapter-bun's own variables** are read and checked by the adapter (1.0.1), with its own defaults
and messages, which may echo a malformed value; the app adds no code for them, and the README lists
them:
- `SHUTDOWN_TIMEOUT` (default 30 s): the drain time. The container's stop timeout must exceed it
  plus the app's 5-second cleanup; the README says so, and the image's Compose templates set
  `stop_grace_period` (Docker's default is 10 seconds). (zimuarr: this is stricter than the
  grace period of at least the drain window that D25 asks `translation` to document, so the README
  gives this one, and `translation` cites it when it documents its grace period.)
- `CONNECTION_IDLE_TIMEOUT` (default 10 s, at most 255 s): the idle timeout. The adapter already
  exempts event streams. (zimuarr) Bazarr's held callback isn't an event stream: its keep-alive
  space must come more often than this timeout (D25), so the README says not to set it below the
  heartbeat.
- `BODY_SIZE_LIMIT` (default 512 KB). (zimuarr) Bazarr's callback carries a whole subtitle's lines,
  and the longest realistic request is under half of it (`contract-spike`, C12), so it stays.

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. When set, it is a bare `http` or `https` origin (a trailing `/` is fine), compared as a
parsed origin. It is checked twice:
- **adapter-bun 1.0.1** reads it when the server module loads, before `init`, and uses it to
  correct SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own
  message, which includes the value, so the container image's entrypoint unsets an empty `ORIGIN`
  and its templates leave it out (the image's work, not this repo's).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials. Startup stops with an error that doesn't echo the value.

The cross-origin check, the strict-transport decision and `sign-in`'s browser's address all use the
one value `config/origin.ts` gives. (zimuarr) `ORIGIN` is never the address Bazarr calls zimuarr at,
which `bazarr-instances` suggests and stores per instance.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served, and is skipped
while building:
1. the master key (`secrets`, as now);
2. the configuration above;
3. the database: opened, then migrated (D5: the app is its one migration owner);
4. each module's startup work, in a fixed order. `setup`'s own: load first run's state and, if the
   instance is unclaimed, print the bootstrap token;
5. starting the jobs (none yet). A job that fails to start is logged, not fatal.

A failure in steps 1–4 is logged and thrown from `init`: the built server exits non-zero before it
listens, and the dev server stays up with every request failing, as the key error already does.

**Shutdown.** adapter-bun 1.0.1 already drains open requests for `SHUTDOWN_TIMEOUT`, then closes
the rest, exits at once on a second signal, and emits `sveltekit:shutdown` without waiting for its
listeners. The app adds, in the built server only (`dev` keeps Ctrl+C):
- **On the signal** (`SIGTERM`, `SIGINT`, and `SIGHUP`, which counts as a stop and is passed on to
  the adapter as `SIGTERM`): stop the jobs and timers (the token's) and close open event streams
  cleanly, so browsers reconnect, while the adapter drains. (zimuarr) Held Bazarr callbacks are not
  closed: the adapter drains them like any request, and cuts what is still open when its window
  ends (D25, contract test C11). What survives a restart is `translation`'s.
- **On `sveltekit:shutdown`:** wait for the jobs stopped on the signal, close the database, then
  flush the logs (so a closing error is written) and exit 0. A failed close is logged, not thrown.
- **A deadline:** if that cleanup hasn't finished 5 seconds after `sveltekit:shutdown`, the app
  exits non-zero anyway, even with an upstream call still outstanding.
- The app's signal handlers go in on the turn after `init` resolves, after adapter-bun's own, so a
  signal never reaches only the app's handlers.

## The database

**Versions:** `@tursodatabase/database` 0.8.3, `drizzle-orm` and `drizzle-kit` 1.0.0-rc.5 (the `rc`
dist-tag, D5, D27), exact-pinned dev dependencies at their newest releases when built (D27). The
build validates the pair (below), which closes D14.

**Access** follows D6: the client in `db/client.ts` opens the one file; each aggregate's file in
`db/` holds its tables and its named operations; services own the transactions, and every statement
in one goes through its transaction object.

**Migrations** are generated by Drizzle Kit from the schema (`bun run --bun db:generate`, which then
formats its JSON with Biome, so the shared `biome.json` stays unchanged), reviewed and committed in
`drizzle/`. The built server applies them at startup from its own bundle: Vite imports each
migration's SQL as text, and Drizzle's record migrator for Turso
(`drizzle-orm/tursodatabase/wasm-migrator`) applies them, recording each one as Drizzle Kit's file
migrator would except for an empty `hash`, which Drizzle reads only to upgrade a migrations table
from before 1.0. A test compares the two migrators' rows.

**Turso's native binding** can't be bundled (its loader finds it with a runtime `require`), so its
platform package (`@tursodatabase/database-linux-x64-gnu` or `-linux-arm64-gnu`) ships beside
`build/`, and the built server is started with `bun --no-install`, so a missing package stops it
instead of being downloaded. SPEC.md's "`bun ./build` needs no `node_modules`" changes to say so.

**Tables** (each with `drizzle/`'s first migration):
- **`settings`:** key, value (text) and update time, through named operations to read and write a
  key. `setup` stores first run's step pointer here; later modules add their own keys.
- **`owner`:** one row at most, enforced by the schema (a fixed id): username, password hash and
  creation time. `two-factor` and `oidc-sign-in` add their fields.

### Backup and restore

(zimuarr) This closes D15's procedure. The database is one file plus the files Turso keeps beside it
(`zimuarr.db-wal`), so:
- **Backup:** stop zimuarr, then copy the whole folder that holds the database. A copy of the file
  alone can miss recent writes, and a copy taken while zimuarr runs can be incomplete. The master
  key is backed up apart from it, never inside that folder.
- **Restore:** stop zimuarr, put the folder back, and start it with the same master key. Every
  stored secret is encrypted under that key (D26), so a restore with another key starts, but each
  secret then fails with its own "another master key" error.
- **After a bad upgrade:** restore the copy taken before it, with the release it was taken from,
  since migrations only go forward.
- **Tested:** an e2e test claims a server, stops it, copies its folder to another path, starts a
  new server on the copy with the same key and finds it claimed: no token printed, and `/setup`
  answers 404. The test with another key joins with the first stored secret (`two-factor`'s, which
  comes before `bazarr-instances`), and `verification` adds its own restore check
  ([SPEC.md](SPEC.md#open-decisions-each-module-closes)).

The README's Backups paragraph gives the procedure. An online backup, which needs no stop, is left
out, because embedded Turso's online backup isn't validated. Its cost: a callback still held when
the drain window ends fails its Bazarr job, since Bazarr's three attempts are over within seconds
while zimuarr is stopped (D20); what a restart recovers is `translation`'s.

## Logging

Four levels, debug dropped unless `ZIMUARR_LOG_DEBUG` is on. Each entry is one JSON line on standard
output (D11) with `time` (ISO, to the millisecond), `level`, `source`, `message` and `metadata`.
`logging/` is the app's own small logger, with no library, which closes D13's logging half: the
redaction rules below need key matching at any depth that path-based library redaction doesn't
give, and the entry shape is fixed here. Flushing waits for every entry's own write, so shutdown
loses none to a slow reader.

**Redaction** runs before an entry is written, on the message and every metadata value:
- credentials in URLs, and token-like query parameters, also inside a parameter's value once
  percent-decoded (up to three times), in which case the value is redacted whole; a value that
  decodes to a bare query (`token=abc`) counts too;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key,
  split into words so `apiKey` and `sessionId` match and `monkey` doesn't, except the names
  `redact.ts` lists as holding no credential, matched exactly, whose values are still cleaned like
  any other;
- a `Secret` (`secrets`) is already `[redacted]`;
- errors keep their name, message, stack and cause, each cleaned; a circular reference becomes a
  marker;
- in time linear in the entry's size, which a growth test checks, so a crafted URL can't stall the
  logger.

(zimuarr) The allowlist holds only names zimuarr logs: it starts empty, without obzorarr's Plex ids
or the generic names nothing here logs yet, and each module that logs a name the rules redact
without cause adds it, with a test, when no value it can hold is a credential. A provider's
authentication error, which can echo part of its key in prose, is `providers`' to judge against
real error bodies.
The tests add Bazarr's own credentials: its `apikey` query parameter and `X-Api-Key` header.

Console output meant for whoever runs the server, such as the bootstrap token, is never a log
entry. It still reaches the container's output, which is why the console is trusted (below).
(zimuarr) The contract spike's callback events, which its stand-in prints as JSON lines, stay as
they are until `translation` decides what it keeps; the contract harness tells them apart from log
entries.

## The request checks

`handle` runs its stages in this order: the language (`i18n`), the security headers, the
cross-origin check, then the setup gate. `sign-in` later adds its stages between the cross-origin
check and the gate. Every refusal is returned, never thrown
([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it keeps the language and the headers.

### The cross-origin check

Brought forward from `sign-in`, because the claim is the first form: SvelteKit's own check compares
the browser's `Origin` with `event.url`, which adapter-bun builds as `https` unless `ORIGIN` or a
protocol header says otherwise, so it would refuse the claim over plain HTTP.
- **SvelteKit's own form check is off:** `csrf: { trustedOrigins: ['*'] }` in the options
  `vite.config.ts` passes to `sveltekit()` (SvelteKit 3 takes them in that call, with no `kit:`
  wrapper), exported so a config test asserts it and that remote functions stay off. SvelteKit's
  only remaining check before `handle` is the remote-function one, which nothing uses.
- **The cross-origin check** asks the browser, so the app doesn't need to know its own address and
  stores none. It is the first check in `handle`, after only the language and the headers, for every
  method except GET, HEAD and OPTIONS, and for every content type (form, JSON, multipart,
  `text/plain`, empty). Internal `event.fetch` subrequests (`event.isSubRequest`) skip it.
  - An `Origin` header, whenever it is present, must be one bare `http` or `https` origin;
    `null`, a malformed value, several values, credentials or anything after the host are
    refused, before the URL parser could repair them. This applies on every branch below.
  - A request with neither `Origin` nor `Sec-Fetch-Site` doesn't come from a browser. Whether or not
    `ORIGIN` is set, it passes only on an explicit list of machine routes, each with the credentials
    the app's approved docs require for it, and is refused everywhere else. (zimuarr) The list is
    Bazarr's callback, `POST /bazarr/api/translate/content` (D20), and `api-keys` adds the
    versioned JSON API. The check doesn't check their keys: such a request goes on to the route's
    own key check, so the callback still answers a missing or wrong `X-Api-Key` with `401` (D25).
    This rule comes before the two below: in obzorarr, which has no machine routes, the `ORIGIN`
    branch refuses such a request on its own, and a copy that kept that order would refuse every
    callback once `ORIGIN` is set. `sign-in` adds that a request there carrying only a session
    cookie gets a 403, once a session cookie exists.
  - With `ORIGIN` set, a present `Origin` must equal `ORIGIN`, compared as parsed origins. Without
    `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
  - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`
    (`same-site` and `cross-site` are refused). Otherwise `Origin`'s host and port must equal the
    `Host` header, with default ports normalised. Browsers send `Sec-Fetch-Site` only to HTTPS,
    `localhost` and loopback addresses, so over plain HTTP outside loopback every browser gets
    this comparison.
  - A refusal is a 403 with the app's own "Access denied" page, or a JSON error (`{ message }`) for
    a caller that asks for JSON and not for a page, with the security headers and in the viewer's
    language. Until `sign-in` builds the error pages, the page is the title and its one-line
    description, unstyled but for its colour scheme. `sign-in`'s error pages reuse its messages.
- **When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
  HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
  16.4, Firefox before 90, Chrome before 76). The proxy fix is `proxy_set_header Host $http_host`
  (not `$host`, which drops a non-default port). Remote functions would need it too; they stay
  off.
- **Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
  from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
  browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
  closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow
  a rebind, and those are gated by a console token or rate-limited (zimuarr: the machine routes also
  need their keys).

`security/cross-origin.ts` is one pure module, copied from obzorarr with zimuarr's machine routes
joining the "neither header" branch, as D17 shares the opening modules.

### Security headers and CSP

On every response that passes through `handle`, early returns and error pages included:
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: same-origin` (never `no-referrer`, which makes browsers send `Origin: null` on
  the app's own form posts);
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
- `Strict-Transport-Security: max-age=31536000` over HTTPS only, known when `ORIGIN` is `https`, or
  when `ORIGIN` is unset and the browser sent `Sec-Fetch-Site` to a host that isn't `localhost`,
  `*.localhost` or a loopback address (`127.0.0.0/8`, `[::1]`), since browsers send it only to
  HTTPS and those hosts. Never `includeSubDomains`: other apps may share the domain. An accepted
  risk: HSTS covers every port of the host name, so another app on the same host over plain HTTP
  becomes unreachable from that browser until it moves to HTTPS.

A response whose headers can't change is copied first, keeping its body as a stream.

**The content security policy** goes on every page through SvelteKit's `csp` option, in nonce mode:
- `default-src 'self'`, so a directive not listed falls back to the app;
- `script-src 'self'` with the nonce, so only the app's scripts run;
- `style-src 'self' 'unsafe-inline'`: `src/app.html` and server-rendered pages carry style
  attributes, which a nonce can't cover, and styles can't run code;
- `img-src 'self' data:`, `font-src 'self'` (the fonts are bundled), `connect-src 'self'`;
- `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`.

(zimuarr) No module adds a host: the browser never loads anything from Bazarr or a provider; the
server calls them.

No page is prerendered (`i18n` already forbids it), so every page gets its own nonce.

**A page a `handle` stage builds itself,** such as the cross-origin refusal, never passes through
SvelteKit's renderer, which adds the policy above and fills `<html lang>`. The stage sets both
itself, with a fixed, stricter policy, since the page has no scripts: `default-src 'none';
style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.

**A limit:** responses produced before `handle` carry none of these headers: the built files
(scripts, styles, fonts), which adapter-bun serves itself, and the adapter's own 400 and 413
answers. None is a document, so framing and the CSP don't apply to them, and Bun sends each file
with its real content type.

### Bazarr's callback

(zimuarr) `POST /bazarr/api/translate/content` answers `200` at once and holds the body open with
keep-alive spaces while the work runs (D25). Every `handle` stage runs before that `200`, as D25's
"Checks come first" asks:
- the language (`i18n`), as now;
- the headers stage adds the security headers to the `Response` object without reading its body,
  and keeps the callback's own `Cache-Control` and `X-Accel-Buffering`; the CSP isn't added, since
  the answer isn't a page;
- the cross-origin check passes Bazarr's request on as a machine route (above);
- the setup gate lets it through ([First run](#first-run)), so it answers with its own status, such
  as `401` for a missing or unknown key, before the claim too.

The contract tests are the evidence that its answers didn't change (`contract-spike`).

### The health endpoint

(zimuarr) `/healthz` takes the place of the ground floor's fixed `ok` at the same path (ground-floor
choice 5). It is public, so it says only whether zimuarr itself can serve:
- `200` with `ok` when its database can be read and written; `503` with `unavailable` when it
  can't, or doesn't answer within 3 seconds; both `text/plain` and `Cache-Control: no-store`;
- **the probe** writes one row of its own in `settings` (`health.checked_at`), commits it and reads
  it back, since a read alone or a rolled-back write never reaches the disk and misses a read-only
  or full volume. The endpoint is public, so a probe runs at most once every 5 seconds and one at a
  time: requests in between share the last result, a success is never reused past that window, and
  a probe that timed out isn't joined by more. A full disk can still go unnoticed while Turso's
  write-ahead log has room to reuse;
- a change of state is logged (healthy to unhealthy and back), not every probe;
- the setup gate lets it through, so it answers before the claim too;
- an unreachable Bazarr instance or provider never fails it, so a container health check never
  marks zimuarr unhealthy for someone else's outage; it shows no version (D22) and no names.
  Instances, providers, jobs, the last observation of each instance and the breakers are shown
  behind sign-in on `/system` (`system`).

The first module with a background job adds "or its job runner has stopped" (D7).

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
gets a 303 to the current first-run step, except that step, `/healthz`, (zimuarr: the paths of the
cross-origin check's machine routes, whatever the method,) and the responses produced before
`handle`. Sign-in and first run's own
helpers join the exceptions when their modules add them. It reads first run's state from memory,
which startup loads and the claim updates (one process, D16). SvelteKit removes the `__data.json`
suffix before `handle` and follows a redirect from it in client-side navigation, so that is gated
too.

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't
skip ahead: each step's action checks that it is the current step, a step that offers Previous only
moves the pointer back, and only the last step's action completes first run. Every step after the
claim needs the owner's session, which `sign-in` brings. (zimuarr) The steps are the claim, the
two-factor offer (`two-factor`) and Connect Bazarr at `/setup/bazarr` (`bazarr-instances`), in that
order (D17).

**The bootstrap token** (D17):
- 12 random lowercase letters and digits, drawn without bias from WebCrypto, shown as
  `xxxx-xxxx-xxxx`;
- held only in memory: never in a log entry, the database or a response;
- printed to standard output at startup with the path `/setup`, and the full address when `ORIGIN`
  is set (the server doesn't otherwise know its address):
  `Setup token: xxxx-xxxx-xxxx (valid for 15 minutes). Open /setup to claim this Zimuarr.`;
- valid for 15 minutes, after which a new one is printed; a timer that shutdown stops, and that
  waits while a claim is in progress;
- entered with or without the dashes, in any case, with spaces around it trimmed, and compared in
  constant time;
- once the instance is claimed, none is printed again.

**The claim** is `/setup`, the first step, and a POST form action. In this order:
1. **The fields:** after the form is read, the username and password are checked against the rules
   below, with nothing awaited. A field error leaves the token unused.
2. **The token:** checked and used up, with no `await` between the two. A wrong or expired token
   gets one error, "That setup token isn't valid. Use the newest one printed in the server
   console.", and never reaches the hash, so a guess costs the server nothing.
3. **The hash** of the password.
4. **One transaction** creates the owner and moves the step pointer; its insert fails if an owner
   exists.

If anything after the token is used up fails while the instance is still unclaimed, and the server
isn't stopping, a new token is printed. A failed claim keeps the typed username and clears the token
and password. The claim stores no address, and nothing but the owner row and the pointer.

**After it,** the claim no longer exists: `/setup` answers "not found" once first run is complete
(D17), and the claim action answers it whenever the instance is claimed. A restart reads the
pointer back, so a claimed instance stays claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **Username:** trimmed and normalised to Unicode NFC, then 1–64 characters (Unicode code points),
  no control characters (`\p{Cc}`). Stored in that form, case kept, and compared after
  `toLowerCase()`, so case doesn't matter.
- **Password:** normalised to NFC, then 15–128 characters (Unicode code points), any characters,
  no composition rules. Ignoring case, it may not be, as a whole, one unit of up to 4 characters
  repeated or one straight run up or down (digits run on from 9 to 0; each code point lower-cased
  on its own), and it may not contain the app's name, `zimuarr`, or, when the username has 4 or more
  characters, the username; nor may it be on the bundled list of common passwords (below). 15 is
  NIST SP 800-63B-4's minimum for a password that is the only factor, which it is until two-factor
  is turned on.
- **The common-password list,** `security/common-passwords.txt`: obzorarr's file, unchanged: the
  entries of 15–128 characters, after NFC and lower-casing, of SecLists'
  `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt` (MIT licence) at commit
  `180c2d5`, which `password.ts` names with how to rebuild it. Vite bundles it with `?raw`, like
  the migrations. NIST requires checking a blocklist, and length alone accepts the long passwords
  such lists hold (obzorarr's owner chose the list, 2026-11-12).
- **Hashing:** `Bun.password` with argon2id and Bun's defaults, of the NFC form, so `sign-in`
  verifies what was hashed. The password is never logged or returned.
- **The form** has one password field with a control that shows what was typed (DESIGN.md: a
  password field may reveal only newly typed input), and no confirmation field.

**The page** follows its brief, [`route-setup.md`](../.impeccable/surfaces/route-setup.md), built
through `/impeccable`, and shows the language switcher. Its text is `setup_…` messages, and the
refusal's `error_access_denied_…`, in English and Danish.

**Trust:** anyone who can read the server console can claim a fresh install.

## Before `sign-in`

`setup` is built before `sign-in`, which brings the rest of the protections. Until then:
- **Rate limits:** none. The token has 62 bits and lasts 15 minutes, and a wrong token costs no
  hash, so guessing it isn't practical; `sign-in` adds the claim's limit.
- **The browser's address and cookies:** the claim sets no cookie yet, so it needs neither. Once
  `sign-in` starts the owner's session at the claim, the claim needs the browser's address, and the
  session follows `sign-in`'s cookies.
- **First run ends at the claim,** its only step: the claim completes first run and sends the
  browser to `/`, the placeholder. `sign-in` signs the new owner in at the claim, and `two-factor`
  adds the first step after it, from which on the claim no longer completes first run.

No release is cut between `setup` and `sign-in`.

## Fonts and icons

(zimuarr) Ground-floor choice 1 left the font files to the first surface, which the claim page is:
- `@fontsource-variable/public-sans` and `@fontsource-variable/roboto-mono`, imported in the root
  layout, so every page renders in DESIGN.md's typefaces with no remote font request; the tokens
  name the families with their system fallbacks after them. The token field uses the `code` style
  (Roboto Mono), the one input that echoes the console line it came from.
- `@lucide/svelte` for the eye icon on the password field's Show and Hide control (the entry
  mockup, `docs/design/screens/01-entry-and-onboarding.webp`): DESIGN.md asks for one 20px line
  family with a 1.5–2px stroke, which Lucide is, imported one icon per path.

The visible name stays the text "Zimuarr" (ground-floor choice 4).

## Validation

The build runs D14's validation with the pinned versions, and records the evidence in its PR body:
- **Migrations:** Drizzle Kit generates the first migration from the schema; the built server
  applies the bundled migrations to a new database, records them as Drizzle Kit's own migrator
  would (but the hash), and on a second start finds nothing to apply.
- **Type checking:** `check` passes with the schema, client and operations.
- **The production build:** `bun --no-install ./build` opens the database through Turso's native
  binding on Linux x64 and arm64, with only its platform package beside `build/`.
- **Rollback isolation** (D5): a transaction that rolls back leaves a concurrent, unrelated write on
  the same connection in place; the test fails on `1.0.0-rc.4`.
- **No Node:** all of it with no `node`, `npm` or `npx` on `PATH`.

## Project structure

```text
src/env.ts                                  + ZIMUARR_DATABASE_PATH, ORIGIN, ZIMUARR_LOG_DEBUG
src/hooks.server.ts                         init: startup; handle: language, headers,
                                            cross-origin check, setup gate
src/lib/server/config/config-error.ts       the error every variable check throws
src/lib/server/config/error-code.ts         a system error's code, for messages without paths
src/lib/server/config/database-path.ts      the database file's path
src/lib/server/config/origin.ts             ORIGIN, parsed and checked
src/lib/server/config/log-debug.ts          ZIMUARR_LOG_DEBUG
src/lib/server/db/client.ts                 opens the database
src/lib/server/db/migrate.ts                applies the bundled migrations
src/lib/server/db/settings.ts               the settings table and its operations
src/lib/server/db/owner.ts                  the owner table and its operations
src/lib/server/logging/logger.ts            levels, entries, standard output, flushing
src/lib/server/logging/redact.ts            the redaction rules
src/lib/server/security/access-denied.ts    the cross-origin refusal: the page or JSON
src/lib/server/security/bootstrap-token.ts  the token: drawing, formatting, comparing, expiry
src/lib/server/security/cross-origin.ts     the cross-origin check and the machine routes
src/lib/server/security/headers.ts          the security headers for a request
src/lib/server/security/password.ts         the credential rules, hashing and verifying
src/lib/server/security/common-passwords.txt
src/lib/server/services/health.ts           the health answer, from the database
src/lib/server/services/setup/startup.ts    the startup steps and shutdown
src/lib/server/services/setup/first-run.ts  the steps, the pointer and the gate's decision
src/lib/server/services/setup/claim.ts      the claim
src/routes/+layout.svelte                   + the bundled fonts
src/routes/setup/+page.svelte               the claim form
src/routes/setup/+page.server.ts            its load and the claim action
src/routes/setup/token-format.ts            the token field's dashes as it is typed
drizzle/                                    the reviewed migrations
drizzle.config.ts
vite.config.test.ts                         SvelteKit's form check and remote functions stay off
tests/e2e/setup.test.ts                     first run and the request checks on the built server
tests/e2e/global-setup.ts                   claims the instance for the other tests
```

`config/secret-key.ts` moves its system-error helper into `config/error-code.ts`. `security/` holds
`cross-origin.ts` through `password.ts` as files; the folder already exists for `secrets`.

The build also changes `package.json` (the packages above and `db:generate`), `vite.config.ts` (the
exported options, the form check off and the CSP, and `vite.config.test.ts` in the `unit` project),
`playwright.config.ts` (a temporary database per run, the token captured from the server's output,
the global setup, `--no-install`), `tests/contract/contract.test.ts` (a database per run under
`tests/contract/.state/`, C1's comment pointing here for the cross-origin check, `--no-install`, and
log entries told apart from the stand-in's events), `panda.config.ts` (the font families),
`messages/` (the claim page's text and the refusal's) and the README (the variables, the database
and backups, the address browsers use, first run, logs, and stopping and the server's limits).
`.gitignore` already ignores `/data/` and `*.db*`.

## Testing strategy

- **Unit (Vitest's `unit` project, `node`):**
  - each `config/` reader;
  - the redaction rules, one case each and nested, Bazarr's `apikey` and `X-Api-Key` included, and
    the growth check;
  - the logger's entry shape, the debug filter and the flush through a slow pipe;
  - the headers for HTTPS, plain HTTP, loopback and `ORIGIN`, and a copied response whose body
    still streams;
  - the cross-origin check against a matrix of methods, content types and `Origin`,
    `Sec-Fetch-Site`, `Host` and `ORIGIN` values, the callback's path with neither header with
    `ORIGIN` set and unset, and the config test for SvelteKit's options;
  - the refusal's page and JSON in both languages;
  - the health answer with a working, a read-only and a closed database, a probe that never
    answers (503 within the bound), and probes shared within the window and not past it;
  - the token's format, alphabet, unbiased draw, expiry and comparison;
  - the credential rules at their limits, NFC and case, the patterns and the list included;
  - startup's order, a failed step logged then thrown, no handlers in `dev`, and the shutdown
    deadline with a cleanup that never finishes;
  - against a temporary database file: migrations on a new database, the two migrators compared,
    rollback isolation, and the claim: success; a field error leaving the token unused; a wrong and
    an expired token never reaching the hash; a second claim; two at once leaving one owner; a
    failed transaction printing a new token, but none once stopping; a restart reading the claim
    back; and the gate's decision for each path, the callback's included.
- **e2e (Playwright, against the built server):** the web server starts with a generated key and a
  temporary database. Its `wait.stdout` pattern runs from the token line through adapter-bun's
  "Listening on" and replaces the `url` check, because Playwright races the two and the URL could
  win before the token is captured. The global setup claims the instance through the form in a
  browser, so the smoke and language tests run on a claimed instance as before. The temporary
  database is removed once the server process has exited, which is after the global teardown.
  `setup.test.ts`
  starts its own fresh servers and checks that:
  - a new database is migrated, and a second start applies nothing;
  - every page sends a fresh instance to `/setup`, while `/healthz` answers `ok` and the callback's
    path answers with its own status, not the gate's 303 (`404` while the contract spike's keys
    are unset), also with `ORIGIN` set and neither `Origin` nor `Sec-Fetch-Site` sent;
  - a wrong token is refused, the right one claims, and `/setup` then answers 404, also after a
    restart;
  - a backup copied from a stopped, claimed server starts claimed with the same key;
  - a cross-site form POST is refused, and a same-origin POST with no `Sec-Fetch-*` headers passes,
    both on `localhost` and on a plain-HTTP host name that isn't loopback (Chromium's
    `--host-resolver-rules="MAP app.test 127.0.0.1"`);
  - the headers are on a page, `/healthz`, a 404, a refusal and the gate's redirect, and HSTS isn't,
    over plain HTTP;
  - the page's scripts carry the CSP nonce, the refusal page carries its own policy, and the
    browser reports no CSP violation;
  - the server refuses to start with an `ORIGIN` holding credentials or a path, with a bad
    `ZIMUARR_LOG_DEBUG`, or with an unwritable database folder, without echoing the value;
  - `SIGHUP` and `SIGTERM` each shut it down with exit code 0;
  - neither the token nor the password appears in a response or a log entry.
- **The claim page** is checked by hand at 360, 390, 768 and 1440 px, at 200% zoom, with the
  keyboard and reduced motion, in every state the brief names, in English and Danish, with the
  captures in the build PR.
- **Contract:** C1–C12 pass unchanged against the new server, unclaimed, with its own temporary
  database; C11 shows held callbacks still drain for the adapter's window.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)), plus `bun run --bun db:generate` (Drizzle
Kit generates a migration from the schema, then Biome formats it). `smoke` also runs
`setup.test.ts`.

## Boundaries

- **Always:** startup finishes before the first request; reviewed migrations; named database
  operations and short transactions (D6); redaction before writing; the token only in memory and on
  the console; the cheap checks before the hash; refusals in `handle` returned, never thrown; every
  `handle` stage before the callback's `200`.
- **Ask first:** any dependency beyond the six packages this spec names; another database engine; a
  logging library; a second owner or any role (D17); a name in the redaction allowlist that can hold
  a credential.
- **Never:** a token or password in a log entry, response or the database (only the hash); a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`; closing a
  held Bazarr callback at shutdown's signal; a provider or Bazarr host in the CSP.

## Docs this module changes when built

- **`docs/SPEC.md`:** the status line and row 4 (built); the tech-stack table (Turso, Drizzle, the
  fonts and Lucide); "`bun ./build` needs no `node_modules`"; the `db:generate`, `preview` and
  `smoke` command rows; the testing section; "Open decisions": the `setup` line goes; ground-floor
  choices 1, 3 and 5 close.
- **`docs/decisions.md`:** D14 moves to Decided with the validated pair; D13's logging half moves to
  D11 as the app's own logger and why, and D13 keeps only the job half; D15 drops the backup
  procedure, which this spec defines and tests.
- **README:** the variables above, the database and backups, `ORIGIN` and the proxy fix, first run
  (the token in the console), logs, and stopping and the server's limits.
- **AGENTS.md:** the status and the structure tree.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke`, `contract` and `ci-ok` pass.
2. A fresh built server prints a token, sends every page to `/setup`, and is claimed once over
   plain HTTP from another machine on the LAN; then the placeholder `/` serves as before, with the
   headers and CSP.
3. D14's validation has passed, with its evidence in the build PR's body.
4. The docs listed above say what was built.
