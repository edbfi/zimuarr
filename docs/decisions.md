# Decisions

Each entry is a decision and why it was made. Open entries keep their number when they're settled.
The stack entries come from the shared rewrite recipe used by all five edbfi apps, cut down to what
applies to zimuarr. Versions live in `package.json` and `bun.lock`.

## Decided

### D1. SvelteKit on one origin

Svelte 5 and SvelteKit 3, with TypeScript for browser and server code. SvelteKit serves pages, form
actions, API endpoints and assets on one origin, with server rendering on and interactive components
in the browser. Backend work happens in server routes, server `load` functions and form actions,
which call application services.

Why: the operator workspace, the versioned API and the Bazarr callback share one origin, which keeps
sessions, origin checks and deployment simple, and it's the recipe all five apps share.

### D2. TypeScript 6, strict

The latest stable TypeScript 6.x at bootstrap, locked; no prereleases, and major upgrades wait until
the Svelte tooling supports them. Strict type checking, run explicitly (the `check` script): running
TypeScript under Bun doesn't type-check it. External input is validated at runtime.

Why: [SvelteKit 3 requires TypeScript 6](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Updated-dependencies).

### D3. Bun everywhere, no Node

Bun is the runtime and package manager in development, CI and production. Tools run with `--bun`
(`bun run --bun`, `bunx --bun`) so their Node shebangs don't apply; no `node`, `npm` or `npx`.
Packages still come from the npm registry. `bun.lock` is committed and CI installs with
`bun install --frozen-lockfile`.

Why: one runtime for every step, and the official Bun adapter needs it.

### D4. One container, one process, one port

[`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun) builds a Bun server. zimuarr runs
as one application process with one HTTP port in one container: the legacy spec's separate API and
worker roles become in-process jobs (D7). Secrets are configured separately from the database and
used only in server-only code.

Why: a single self-hosted instance doesn't need more, and one process lets job claims and session
leases live in one embedded database (see D16).

### D5. Embedded Turso through Drizzle

The database is embedded Turso (`@tursodatabase/database`) through Drizzle
(`drizzle-orm/tursodatabase/database`), with the database file on a persistent data volume. Drizzle
Kit generates SQL migrations, which are reviewed and committed. Migrations run before the app
accepts requests or starts jobs, with one migration owner per database.

Drizzle must be `1.0.0-rc.5-5935859` (the verified reference, D14) or a later release that keeps its
Turso transaction fix (Drizzle
[`25abe07`](https://github.com/drizzle-team/drizzle-orm/commit/25abe0785e09cb562d999c9b6b8d92d85e3e7053),
using the API from [Turso #7898](https://github.com/tursodatabase/turso/pull/7898)). Never
`1.0.0-rc.4`: it can roll back unrelated writes that share the connection, and upgrading Turso alone
doesn't fix it.

Why: one file on one volume matches the one-process deployment and keeps backup simple; the
rollback-isolation check passed with the fixed adapter and no application-level write queue. The
legacy spec's server-grade relational store was chosen for multi-process claims and leases, which
one process (D16) doesn't need.

### D6. Transactions and data access

Database access sits behind named operations (claim a due job, reserve budget, settle an attempt).
Application services own the business rules and the transaction boundaries. Every statement in a
transaction goes through the callback's transaction object; transactions stay short, and network
calls happen outside them. No generic layer that promises interchangeable SQL dialects.

Why: Turso transactions use async callbacks, and a statement outside the transaction handle escapes
it. zimuarr targets one engine, so a dialect abstraction would be cost without benefit.

### D7. In-process background jobs

Jobs (observation, dispatch, session deadlines, housekeeping) belong to application startup and
shutdown, never to page requests. Job state is persisted so work recovers after a restart, runs
never overlap, and retries are safe.

Why: SvelteKit and Drizzle provide none of this lifecycle, and the legacy spec requires no duplicate
dispatch and no lost intent across restarts.

### D8. SSRF-safe outbound HTTP

Every outbound call goes through server-side `fetch` with explicit address validation and a redirect
policy.

Why: the Bazarr and translation-provider addresses are operator-supplied, so the server must not
become a proxy to arbitrary hosts.

### D9. Generated HTTP API clients

Typed HTTP API clients come from `@hey-api/openapi-ts`, generated from the app's own OpenAPI
document during the build. Generated files are never edited by hand. Page loads and form actions use
SvelteKit's generated types instead; services call database operations directly.

Why: one typed contract for the JSON endpoints, without hand-written client code drifting from it.

### D10. Panda CSS and Ark UI only

Styling is Panda CSS 2 through its Vite plugin, with build-time transforms on. Accessible primitives
come from Ark UI for Svelte, unstyled and styled with Panda tokens. Design tokens are defined once,
in Panda's configuration, which loads only `@pandacss/preset-base` (utilities and conditions, no
preset palette) and sets `strictTokens`, so a raw value in a component fails type checking. No
second styling tool or primitive library.

Why: one token source and one primitive library keep the design system (DESIGN.md) enforceable.

### D11. Structured logs to standard output

Logs are structured, one entry per line, written to standard output, and never contain secrets. The
library is open (D13).

Why: the container runtime collects stdout; structured lines can be filtered without parsing prose.

### D17. Shared opening modules and owner sign-in, in the same shape in every app

Every edbfi rewrite app builds five modules before any feature module, in this order: `secrets`,
`i18n`, `setup`, `sign-in`, then `two-factor`. Each app also gets `oidc-sign-in` later. These
modules have the same shape in all five apps, so signing in works the same way everywhere. Each
app keeps its own copy; there is no shared package.

- **One owner.** Each instance has exactly one owner account, with no other roles: no co-admins,
  viewers or operators, and none planned for later.
- **`secrets`.** Secret values are encrypted in the app before they reach the database, with
  AES-256-GCM through WebCrypto, so this works on any database engine:
  - The key is 32 random bytes from an environment variable or a secret file. It is never derived
    from a password, and a missing or malformed key stops the app at startup.
  - Every encryption uses a fresh random 12-byte nonce.
  - Associated data ties each value to its record and field, so a value copied to another row or
    field fails to decrypt.
  - Every stored value carries its key ID, so the key can be rotated.
- **`i18n`.** The translation groundwork (D18), in place before the first screen.
- **`setup`.** If nobody has claimed the instance yet, the app prints a one-time bootstrap token to
  the console at startup, outside the structured logs (D11). Whoever types that token claims the
  instance and creates the owner account. After that, the claim no longer exists: its page answers
  "not found". `sign-in` adds signing the new owner in at the claim, as `two-factor` adds its offer,
  so the rest of first run, the steps later modules add, happens signed in.
- **`sign-in`.** The owner signs in with the username and password created in `setup`. Sessions
  are server-side, and only a hash of each session token is stored.
- **`two-factor`.** Optional, but strongly recommended: first-run setup offers it right after the
  owner account is created, before any connection step, and the admin shell keeps reminding the
  owner until it is on. It uses authenticator-app codes (TOTP), with
  the secret encrypted by `secrets`, single-use backup codes stored only as hashes, each code
  accepted once and a limit on failed attempts. When it is on, every way of signing in passes
  through it, with one optional exception for OIDC (below).
- **Recovery.** An owner who loses their password, or their authenticator and backup codes, turns on
  a recovery setting in the environment and restarts the app. It then prints a one-time recovery
  token to the console, outside the structured logs, as `setup` does. Typing the token lets the
  owner set a new password; it also turns two-factor off, so they can set it up again, and signs out
  every session. The token expires after 15 minutes (a restart prints a new one), failed attempts
  are limited per address, and once it is used the app prints no new one while the setting stays on,
  and warns at startup that the setting should be cleared. `sign-in` builds it, and `two-factor`
  adds turning itself off.
- **Plex for the owner is an option.** In the apps that use Plex (all of them except comradarr and
  zimuarr), the owner can link their account to their own Plex account in the admin settings once
  setup is done. After that, "Sign in with Plex" also signs them in as the owner. The password
  keeps working, and Plex sign-in for the owner stays off until they link. Where an app has users
  besides the owner, those users sign in with Plex.
- **`oidc-sign-in`.** The owner can also link their account to one OpenID Connect provider, such as
  Authentik, Authelia, Pocket ID or Tinyauth, which then signs them in as the owner. It uses
  discovery and the authorization code flow with PKCE, and keys the link on the provider's issuer
  and subject. As with Plex, linking never creates an owner, and the password keeps working.
  Signing in through a reverse proxy's headers isn't supported.
  - **The provider's own second factor can replace the app's, if the owner chooses.** When the ID
    token's `amr` claim (RFC 8176) reports that the owner used a second factor at the provider,
    such as Authentik's or Authelia's TOTP or a passkey, the app offers to skip its own two-factor
    for OIDC sign-ins. It stays on until the owner accepts. Every OIDC sign-in checks the claim
    again, and one that reports no second factor goes through the app's two-factor. Password and
    Plex sign-ins always do. A provider that doesn't send `amr` never gets the offer.

Each app's connection modules add their own first-run steps after `setup`. In zimuarr, first run
continues with the two-factor offer, then connecting the first Bazarr instance
(`bazarr-instances`): the version check, the issued callback key, the Bazarr settings to change,
the check that Bazarr points at zimuarr and the self-test round trip, with the instance starting
observation-only (legacy spec "First-run and onboarding"). The claim replaces the legacy first step,
creating the first administrator. The Bazarr contract spike (D20) runs before the shared opening: it
needs no database, sign-in or UI, and proves the contract everything else rests on (owner decision;
legacy spec "Delivery sequence"). It isn't a feature module, and its code becomes product code only
through later specs.

zimuarr has no Plex and no users besides the owner, which settles the legacy question about roles
(legacy spec "Users, roles and permissions", open question 9). API keys (`api-keys`) aren't a way
of signing in: the owner creates them while signed in, and they reach only the versioned JSON API,
never pages. Connected Bazarr instances aren't users either: each callback key reaches only the
translation callback (D20).

Why: the owner wants the five apps to look and work alike, and everything else depends on these
modules: every app stores upstream secrets, shows text that must be translatable, needs a safe first
claim and has to know who its owner is. Encrypting in the app (D4: secrets are configured apart from
the database) keeps stolen database files unreadable without the key. Two-factor and OIDC sign-in
were the owner's call for every app, and so was letting a provider's own second factor stand in for
the app's, optionally; one standard OIDC flow covers the self-hosted identity providers without a
client for each, and `amr` is the standard way to see the provider's factor. A copy per app is
enough for five apps and avoids building a shared package before it's needed (YAGNI). zimuarr's
legacy spec asked for authentication on the interface and API, a first-run setup that closes after
use, and secrets "encrypted at rest where practical" (legacy spec "Security"); the shared opening
meets all three and always encrypts. Recovery was the owner's call for every app, after comradarr's
legacy recovery mode showed that the opening had no way back in.

### D18. Every interface is translatable, in English and Danish

Every edbfi app is built for translation from its first screen. No user-facing text is written into
components or services: it comes from message files, one per language. English is the source
language and the default, and Danish is the second language. Each request uses the viewer's own
choice, then the browser's preferred languages, then English. Dates, times and numbers are formatted
for the viewer's locale through `Intl`, never in a fixed format. The message files use a format
Weblate reads, plurals included, so a Weblate project can be connected later without changing code.
Connecting Weblate is later work and belongs to no module yet. Text the owner writes, such as
zimuarr's prompts and glossaries, is content, not translated through the message files. Subtitle
languages are domain data: their names are shown through `Intl.DisplayNames` in the viewer's
locale.

Why: the owner wants full translation support in every app, with Weblate as the translation tool,
and English and Danish now. Adding translation afterwards touches every screen; building it in from
the first one costs little. This settles the legacy question about interface translation (legacy
spec "Theming, responsiveness, accessibility, localisation", open question 13).

### D19. Paraglide JS with i18next JSON v4 messages

Translation (D18) uses Paraglide JS 2 (`@inlang/paraglide-js`) through its Vite plugin, SvelteKit's
official i18n integration. Messages live in `messages/en.json` and `messages/da.json` in i18next
JSON v4, through `@inlang/plugin-i18next` 6.2.0 or later (which fixed its plural handling), with
plurals under CLDR suffixes. Weblate reads that format as "i18next JSON v4" (`i18nextv4`),
monolingual, with `messages/en.json` as the base file.

- Components and services call the typed message functions Paraglide compiles, so a missing
  message is a type error. The compiled output is generated and gitignored.
- On the server, `paraglideMiddleware` in `hooks.server.ts` picks each request's language (the
  viewer's cookie, then the browser's preferred languages, then English) and keeps it in
  AsyncLocalStorage, so concurrent requests can't mix languages. Under SvelteKit 3 it passes the
  translated request on a copy of the event, because `event.request` is read-only.
- Dates, times and numbers stay with `Intl` (D18).

Still to validate in the `i18n` module: the pinned versions with SvelteKit 3, TypeScript 6 and Bun;
building and serving through adapter-bun (Paraglide issue
[#725](https://github.com/opral/paraglide-js/issues/725) reports the middleware returning nothing in
builds that use instrumentation); and a Weblate round trip of a plural message.

Why: it is the integration SvelteKit itself points to. Compiled, tree-shaken message functions add
almost nothing to the bundle and are checked by strict TypeScript. A language per request through
AsyncLocalStorage is safe for server rendering. i18next JSON v4 is a native Weblate format with
correct plurals for English and Danish. gettext PO (through wuchale or Lingui) would also carry
notes for translators, which i18next JSON v4 can't, but those integrations are younger and keep the
language in stores, which need care when the server renders concurrent requests; svelte-i18n
resolves messages at runtime, without typed messages. The owner left the choice to the agents.

### D20. A Lingarr-compatible callback, and nothing else of Lingarr

zimuarr connects to Bazarr through Bazarr's own Lingarr translator. In Bazarr's translation
settings the operator picks Lingarr, enters zimuarr's address as the Lingarr endpoint and the key
zimuarr issued for that instance as its API key. zimuarr answers exactly the request that
translator sends, so Bazarr needs no change (PRODUCT.md, principle 4). Beyond that wire format
zimuarr is its own app: no Lingarr concept, name or behaviour enters its domain, data or screens,
except the onboarding instruction that names Bazarr's setting (owner decision). This narrows the
legacy rule that the predecessor names never appear (legacy spec "What it deliberately does NOT
do") to the callback boundary and that one instruction.

What Bazarr sends, read from the source of 1.6.2, the latest stable release (D22), and unchanged
since 1.6.1 and on the 1.6.3 betas (`lingarr_translator.py`); the contract spike tests it against a
real Bazarr:
- `POST <endpoint>/api/translate/content`, with the key in `X-Api-Key`. Bazarr makes the key
  optional; zimuarr requires it and rejects every other caller.
- A JSON body with `arrMediaId` (the Sonarr series id for episodes, the Radarr id for movies),
  `title` (with the source file's name), `sourceLanguage` and `targetLanguage` (two-letter codes,
  with `zh-CN`, `zh-TW` and `pt-BR` for Bazarr's three special cases), `mediaType` (`Episode` or
  `Movie`), `lines` as position and text pairs with blank lines left out, and
  `sourceSubtitlePath` and `translatedSubtitlePath`.
- A 32-minute client timeout. Bazarr tries three times, with backoff, after a timeout, a
  connection error, 401, 429 or a server error; any other answer that isn't 200 fails the job at
  once.
- A 200 answer must be a JSON list of position and text pairs. Bazarr replaces only the positions
  present and non-empty, so completeness is checked against every position it sent.

The subtitle paths are new since the legacy spec, which found no path in the payload and relied on
the content fingerprint alone (legacy spec "Direction 2: Bazarr calls Zimuarr back"). zimuarr
matches a callback to its session by instance key, language pair, source path and destination
path, and confirms the match with the fingerprint of the lines; the spike proves it. Bazarr sends
the source path exactly as zimuarr dispatched it, and only the destination path tells apart a
forced, a hearing-impaired and a normal subtitle made from the same source. Fingerprints follow how
Bazarr builds its lines: HTML tags and `{…}` blocks removed, `\N` read as a line break, blank lines
left out and positions counted over every cue. The timeout and retry counts are Bazarr's current
behaviour, not product decisions, so they are settings with these defaults (legacy spec, open
question 14).

- **Retries join the running work.** A retry can arrive while zimuarr is still working on the
  attempt before it: after a timeout, a server error, a reverse proxy's 502 or a 200 that isn't
  valid JSON, Bazarr sends the same request again within seconds. The retry waits for that work, and
  every waiting request gets the same full result (owner decision; legacy spec, open question 3).
- **A dispatch is a request, not a promise.** Bazarr answers it with 204 and no job id, runs
  translations in the same queue as its own searches (four jobs at a time by default) and loses
  that queue when it restarts. A session waits up to 6 hours for its first callback, and finished
  output is kept for 7 days, so a later dispatch of the same work (the same source lines and
  revisions) is answered without a provider call. Money stays reserved until the provider work
  ends, not until the callback does. The two periods are settings (owner decision; legacy spec,
  open question 2, whose session states `translation` still decides).
- **SRT only, for now.** Sources are SRT files, and Bazarr writes the translation as SRT. Bazarr's
  lines can't be rebuilt from its API for an ASS file with comments, and its ASS writer keeps only
  the first line of a multi-line translation. ASS, SSA and VTT can follow, each with its own
  contract tests (owner decision).

Callbacks zimuarr didn't plan, such as a Translate click in Bazarr's own interface, are rejected
and recorded by default. Per instance, the owner can opt in to accept them under one chosen policy,
with the same admission, budgets, validation and provenance as planned work (owner decision;
legacy spec, open question 4).

Why: the Lingarr endpoint is the translator contract Bazarr already ships, so answering it is how
zimuarr works with an unmodified Bazarr, and the owner wants zimuarr compatible on the wire but
strictly its own thing. Bazarr changed this translator three times between August and September
2026, so contract tests against the latest stable release (D22), the version check at registration
and the runtime drift detector keep drift visible.

### D21. Several Bazarr instances, each on its own

zimuarr connects one or more Bazarr instances, and each runs on its own: its own API key, issued
callback key, version check, observation and rate limits, concurrency limit, circuit breaker and
observation-only switch. Desired subtitles, sessions, attempts, managed artifacts, verification and
provenance each belong to one instance (legacy spec "Identity and uniqueness rules"). The same media
on two instances, such as a 1080p and a 4K library, is two unrelated items: each is translated and
paid for separately, and zimuarr never matches media across instances (owner decision).

- **Money.** The per-attempt, daily and monthly ceilings cover all instances together. Each
  instance can also have its own daily and monthly ceilings, and a translation is admitted only
  when every ceiling that applies has room (owner decision). Spend reports break down by instance
  as well as by provider and policy.
- **Policies.** A policy applies to every instance by default, or to the instances it names. A
  translation runs only when both its instance and its policy are active.

Why: Sonarr and Radarr ids are local to one install, so matching media across instances would be
guessing, and independent instances keep every decision explainable (PRODUCT.md, principle 3). One
wallet with optional ceilings per instance matches how the owner pays providers, while a second
library can be held to less. This settles the question of several instances (PRODUCT.md "Where it
runs"; legacy spec, open question 12).

### D22. Other software: the latest stable release only

Each edbfi app works with the latest stable release of every service it talks to, and with nothing
older. Its contract tests run against that release; when a new stable release ships, the tests and
the app move to it in the app's next release, and support for the one before goes. The app adds no
code for older versions and no workarounds for upstream bugs that a later release may fix: a bug
that harms users is reported upstream and named in the app's docs. A service on any other version
(older, newer than the one tested, a prerelease, or a version the app can't read) keeps working,
and the app says plainly in setup and on its health page which version it is tested with.
Responses are still validated, so a real difference in the API shows up as an error, not as wrong
data.

In zimuarr the service is Bazarr: 1.6.2 today. `bazarr-instances` compares the version Bazarr
reports (`GET /api/system/status`) with it, and `system` keeps the warning visible. This replaces
the supported Bazarr version range of the legacy spec ("Bazarr — the highest-risk dependency",
"Failure handling") and its refusal of a version outside it.

Why: the owner doesn't want a backlog of backwards compatibility in any app (owner decision). Code
for old versions and for upstream bugs is seldom removed once it's in, and each workaround outlives
the upstream fix as code to maintain. Warning instead of refusing keeps users who update a week
late working.

### D23. A companion to Bazarr: Bazarr handles the files

zimuarr orchestrates translations and leaves files to Bazarr (PRODUCT.md, principle 4; owner
decision). It never writes, moves or deletes a subtitle file itself, and where Bazarr has a setting
for how files are handled, zimuarr follows it instead of adding its own:

- **Sources.** Bazarr's index decides which subtitles exist. An embedded track is a source when
  Bazarr indexes it under its embedded-subtitle settings, and Bazarr extracts it itself; with SRT
  only (D20), that means text (SubRip) tracks.
- **Variants.** Whether a normal, forced or hearing-impaired subtitle is wanted comes from the
  item's Bazarr language profile.
- **Writing back.** Approved quarantine output and a rollback reach Bazarr the one way zimuarr
  writes anything: zimuarr dispatches a new translation and answers its callback from the content
  it kept, and only while the source is unchanged. zimuarr keeps each artifact's content and the
  source it came from for this, and never uses Bazarr's upload (legacy spec, open questions 5 and 6,
  whose approval rules `quarantine` and `upgrades` still decide).
- **Bazarr's upgrades.** With its defaults, Bazarr's upgrade task deletes a translated subtitle in
  its first 7 days when a provider offers a better-scoring download. Connecting an instance
  therefore requires one of two setups in Bazarr: translated subtitles scored at 100 with "upgrade
  manually downloaded" left on, or upgrades turned off. Bazarr's settings API returns these, and
  its translator type, address and Lingarr key, so connecting checks them all without a test
  translation. `verification` still notices when Bazarr replaces a managed subtitle.
- **Verified.** Bazarr rewrites what zimuarr answers: it adds a "translated with Lingarr" cue (a
  Bazarr setting), re-sorts the cues, drops empty and zero-length ones and merges repeated line
  breaks. A managed subtitle is Verified when the file Bazarr indexed holds exactly the text and
  timing of zimuarr's answer after those rules, not when the bytes match.
- **Observation.** Bazarr's index is the truth, read by polling. Bazarr's live events (Socket.IO,
  which needs no key, names each episode or movie it has just indexed) are hints to poll that item
  sooner, never a substitute (legacy spec, open question 10, whose cadence `observation` still
  decides).
- **Shared files.** Instances that point at the same files, and other tools writing beside Bazarr,
  are for Bazarr and the operator to handle; zimuarr doesn't detect or prevent them.

Why: the owner sees zimuarr as Bazarr's companion, whose purpose is orchestrating translations.
Bazarr already owns the files, their naming, the media server refreshes and the settings for all
of them, so a second file handler would disagree with it. The upgrade and rewrite behaviour above
was read from Bazarr 1.6.2's source (`subtitles/upgrade.py`, `translator_utils.py`).

## Open

### D12. Producing the OpenAPI document

How the OpenAPI document is generated from SvelteKit endpoints isn't chosen. The generator must be
validated with the pinned TypeScript 6 and Bun versions. Closes when the first JSON endpoint needs a
generated client.

### D13. Logging library and job lifecycle

The logging library (D11) and the concrete job lifecycle implementation (D7) aren't chosen. Close
before the first background job lands.

### D14. Turso and Drizzle versions

The exact Drizzle ORM and Drizzle Kit pair for Turso is still to be validated in the app: migrations,
type checking, production builds and rollback isolation (D5). Only a focused rollback-isolation check
has passed (Drizzle `1.0.0-rc.5-5935859` with Turso `0.8.3` and `0.9.0-pre.1`). Closes with the first
database module.

### D15. Runtime validation gaps

Not yet validated for this stack: browser interaction with a real component, production containers,
realistic load, and job recovery after a restart. Hydration is validated: the e2e smoke test waits
for the hydrated app in Chromium against the built server, with no console errors.
A crash test doesn't prove recovery from power loss or storage faults. The Turso backup and restore
procedure is still to be defined and tested; the database file and the secrets must be restored
together. Each closes with the work that first depends on it.

### D16. One process

The deployment assumes one application process per database. Horizontal scaling and job
coordination across processes would need a new design; the legacy spec's multi-process deployment
is out until then. Stays open as an accepted limit.
