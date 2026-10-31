# Decisions

Each entry is a decision and why it was made. Open entries keep their number when they're settled.
The stack entries are the stack every edbfi rewrite app shares
([Shared groundwork](../AGENTS.md#shared-groundwork)), cut down to what applies to zimuarr.
Versions live in `package.json` and `bun.lock`.

## Decided

### D1. SvelteKit on one origin

Svelte 5 and SvelteKit 3, with TypeScript for browser and server code. SvelteKit serves pages, form
actions, API endpoints and assets on one origin, with server rendering on and interactive components
in the browser. Backend work happens in server routes, server `load` functions and form actions,
which call application services.

Why: the operator workspace, the versioned API and the Bazarr callback share one origin, which keeps
sessions, origin checks and deployment simple, and all five apps share it.

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
modules have the same shape in all five apps, so signing in works the same way everywhere; each app
keeps its own copy ([Shared groundwork](../AGENTS.md#shared-groundwork)).

- **One owner.** Each instance has exactly one owner account, with no other roles: no co-admins,
  viewers or operators, and none planned for later.
- **`secrets`.** Secret values are encrypted in the app before they reach the database, with
  AES-256-GCM through WebCrypto, so this works on any database engine:
  - The key is 32 random bytes from an environment variable or a secret file. It is never derived
    from a password, and a missing or malformed key stops the app at startup.
  - Every encryption uses a fresh random 12-byte nonce.
  - Associated data ties each value to its record and field, so a value copied to another row or
    field fails to decrypt.
  - Every stored value carries its key ID, so a value written under another key fails with its
    own error (D26).
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
client for each, and `amr` is the standard way to see the provider's factor. zimuarr's legacy spec
asked for authentication on the interface and API, a first-run setup that closes after use, and
secrets "encrypted at rest where practical" (legacy spec "Security"); the shared opening meets all
three and always encrypts. Recovery was the owner's call for every app, after comradarr's
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
  `Movie`), `lines` as `position` and `line` pairs with blank lines left out, and
  `sourceSubtitlePath` and `translatedSubtitlePath`.
- A 32-minute read timeout: it fires after 32 minutes without a byte, so it doesn't limit the
  whole request (D25). Bazarr tries three times in all, 1 second and then 2 to 3 seconds apart,
  after a timeout, a connection error, 401, 429, a server error or a 200 that isn't valid JSON;
  any other answer that isn't 200 fails the job at once.
- A 200 answer must be a JSON list of `position` and `line` pairs; valid JSON of any other shape
  fails the job at once, without a retry. Bazarr replaces only the positions present and
  non-empty, so completeness is checked against every position it sent.

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

Callbacks zimuarr didn't plan, such as a Translate click in Bazarr's own interface, are accepted by
default: Bazarr isn't a good translation engine, and zimuarr is, so a translation started in Bazarr
should still be made by zimuarr (owner decision; legacy spec, open question 4, whose safe default
was to reject). Per instance, the owner chooses which policy these callbacks run under, and can turn
them off. With no session planned, admission, the budget reservation and the checks of the policy
all happen when the callback arrives, and the provenance records that Bazarr started it. When the
callback can't run (turned off, no policy chosen, the instance observation-only, including while
D23's upgrade settings are missing, or admission refuses), zimuarr records it with the reason and
answers with an error Bazarr doesn't retry. Observation-only means zimuarr pays for nothing on that
instance, whoever starts the work; without the upgrade settings, Bazarr could delete the paid
translation (D23).

**The name stays Bazarr's.** Bazarr calls the translator Lingarr in its settings and history, and
its translator-info setting adds a cue naming Lingarr to every translated subtitle (D23). zimuarr
can't change either without a change to Bazarr, which can come later as an upstream proposal.
Onboarding recommends turning the cue off. zimuarr adds no credit cue of its own: Bazarr only
replaces the text at positions it sent, so a credit would have to overwrite a line of dialogue
(owner decision).

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
(older, newer than the one tested, a prerelease, or a version the app can't read) keeps working, and
the app tells the owner plainly which version it is tested with, in setup and on the owner's own
status screens; the public health endpoint never shows a version. Responses are still validated, so
a real difference in the API shows up as an error, not as wrong data.

In zimuarr the service is Bazarr: 1.6.2 today. The tested release is the Bazarr image pinned in
`tests/contract/compose.yaml`; Dependabot proposes each new stable release there, and the update
merges only once every contract test passes against it (`SPEC-contract-spike.md`, "In CI").
`bazarr-instances` compares the version Bazarr
reports (`GET /api/system/status`) with it, and `system` keeps the warning visible on `/system`.
This replaces the supported Bazarr version range of the legacy spec ("Bazarr — the highest-risk
dependency", "Failure handling") and its refusal of a version outside it.

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
  manually downloaded" left on, or upgrades turned off. Without one, the instance connects but
  stays observation-only, and zimuarr dispatches nothing to it; if the setting changes later,
  dispatch to that instance stops until it is back. Unlike a version (D22), this blocks, because
  the risk is Bazarr deleting paid translations. Bazarr's settings API returns these, and its
  translator type, address and Lingarr key, so connecting checks them all without a test
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

### D24. Translation providers, fallback chains, context and proofreading

zimuarr translates through four kinds of provider, each a thin adapter plus a capability
declaration (legacy spec "Provider capability model"): endpoints compatible with OpenAI Chat
Completions, Anthropic Messages or [Open Responses](https://www.openresponses.org/), so hosted and
local servers that speak one of them work by their address, and machine translation through DeepL,
Google Cloud Translation and LibreTranslate. There is no plugin system, and raw request templates
stay a permanent non-goal (owner decision).

Besides the legacy spec's list, a capability declaration says:
- which language pairs the provider translates;
- how it uses context: whether it takes any, and whether the entries of one request share it
  (DeepL translates each text of a batch on its own, with an optional context passage);
- whether it can proofread, that is, correct a translation given the source beside it;
- whether a lost answer can be recovered, or a call repeated without paying twice, through an
  idempotency key or a stored response (as Open Responses offers).

**Fallback chains.**
- A policy names an ordered chain of provider profiles: provider, model, typed parameters and
  prompt revision. The first is the primary.
- One attempt uses one profile for every chunk, so a file never mixes models. A profile that can't
  translate the language pair, or whose reservation the budget can't cover, is skipped with the
  reason recorded, and the next one is tried.
- Within an attempt, a timeout, 429 or server error is retried with backoff. Output that breaks
  the schema or fails a chunk's checks gets repair requests for the failing lines only, on the same
  profile. When those run out, the attempt ends and the next profile starts a new one. Output whose
  assembled file fails the checks is quarantined, and the next profile gets an attempt. A provider
  whose breaker is open, or that rejects the key, is skipped.
- Per policy and for each profile in its chain, the owner sets the number of retries, the number of
  repair requests, how often a call whose answer was lost may be repeated (once by default), and
  whether failed checks move on to the next profile or fail the session (owner decision). Previews
  show the chain, which profiles would be skipped and why.
- Chunks paid for in a failed attempt are reused only by an attempt with the same profile.
- When the chain runs out, Bazarr must fail the job and write nothing. zimuarr ends the held reply
  with a JSON object naming the failure, which Bazarr fails at once without a retry (D25). It never
  answers with an empty list, which Bazarr would take as a success that keeps the source text
  (legacy spec "Failure mode 2").
- An artifact's provenance points to the attempt that produced it; failed attempts stay listed with
  their reasons.

**Money.**
- Admission reserves the first attempt and its proofreading, and every further call that can cost
  money, a retry or repair included, needs its own reservation first. A ceiling for the whole
  session, across all its attempts, comes on top of the per-attempt ceiling.
- zimuarr records each provider call before sending it, so a restart can't forget it. A call whose
  answer is lost (a timeout, or a restart before the answer was stored) counts as spent at its
  reservation. Where the provider can recover the answer or recognise the repeat, zimuarr uses
  that; otherwise it repeats the call within the owner's limit, so the translation still finishes,
  and spend reports show the repeat (owner decision). This narrows "retries never create duplicate
  cost" (PRODUCT.md, principle 2; legacy spec "Idempotency and caching") to every case where
  zimuarr can know.

**Context.**
- Lines are grouped into chunks, one request each. A chunk's size is computed from everything the
  request and its answer hold (prompt, glossary, media details, context lines, answer schema and
  the room the answer needs), for each profile separately and again for proofreading. A line is
  never cut; one that can't fit skips the profile.
- Each chunk carries a set number of lines before and after it as context, marked not to be
  translated, and its answer may hold only the chunk's own positions.
- With source context, the default, the context lines are source text and chunks run in parallel.
  With translated context, a policy option, the lines before a chunk come from the accepted
  translation of the chunk before it, so chunks run in order; a repaired chunk sends the later
  chunks that used it back for translation.
- Media details are the series or movie title and the episode title from zimuarr's mirror (not
  Bazarr's display title, which ends with the file name), plus the policy's glossary. They are
  frozen for the session, and their hash is part of the provenance and of whether kept output can
  be reused.
- Machine translation gets context as its declaration says: DeepL receives the surrounding source
  passage as its `context`, the neighbouring lines in the same batch included.
- The number of context lines, the mode and the chunk sizing are part of the chunking-strategy
  revision.

**Proofreading.**
- Optional per policy, and off by default until it proves better on real subtitles. A policy makes
  it required (its failure fails the session) or best effort (its failure returns the first pass
  and records why).
- It is a second stage of the same session, after the first pass is assembled and has passed the
  checks, and before Bazarr gets an answer. It runs on its own profile, which must declare that it
  can proofread; saving the policy checks that. It gets source and translation pairs with the same
  context, answers corrected lines for the same positions, and passes the same checks again, plus
  checks that numbers, names and glossary terms survive. How much it changed is shown as a
  warning, not a rule.
- It has its own record (input and output hashes, profile, checks, calls and cost), linked to the
  translation stage. Provenance records which stage produced the answer and whether proofreading
  passed, failed or was skipped. Kept output is reused only when it meets the policy's current
  proofreading setting. Once an answer is chosen it is frozen, so a retry gets the same text.
- Proofreading subtitles already delivered is left out for now; it would need a new dispatch
  answered from kept output (D23).

**Time.** The 6 hours a session waits for its callback (D20) are apart from its working deadline,
which starts at the first callback and isn't reset by Bazarr's retries. The deadline is shared
between translation, fallback, proofreading and the answer, and best-effort proofreading stops early
enough that the first pass can still be delivered. Bazarr runs several translations at once (its
concurrent-jobs setting), so the per-provider concurrency in `admission` decides how many share a
provider. `translation` sets the shares (legacy spec, open question 7).

Why: one profile per attempt keeps a file's terminology consistent and its provenance simple,
where the predecessor fell back line by line and mixed models within a file. Repairs on the same
profile spare a full new translation for one bad chunk, as LLM-Subtrans does. Source context keeps
chunks parallel within the deadline; translated context is the slower choice for consistency.
Proofreading runs before the answer because Bazarr takes a translation only through its callback
(D23). The owner wants the translation done rather than every repeat charge avoided, with control
over how hard zimuarr tries (owner decision).

### D25. The callback is held open with keep-alive whitespace

zimuarr translates while Bazarr's callback request waits. It answers `200` at once, writes a space
every few seconds while it works, then writes the answer and closes. JSON allows leading whitespace,
and Bazarr's client reads the whole body before it parses it, so Bazarr sees one ordinary answer.

- **Checks come first.** The key, the request's shape and admission are checked before the `200`,
  so their failures still get a real status: `401` for the key, which Bazarr retries twice, and a
  `4xx` that Bazarr doesn't retry for the rest. Two failures that happen in normal use answer at
  once with the failure object below instead, because Bazarr logs a `4xx`'s body only at debug
  level: an empty `lines` (Bazarr sends one when every cue is blank once its markup is stripped)
  and a failure already kept for the job, which names itself as kept and says from when a new
  attempt runs.
- **The answer.** Success is the JSON list D20 describes, written only after it is complete,
  checked and frozen (proofreading included, D24), never in pieces. A failure after the `200` is a
  JSON object naming it, `{"error": "<code>: <reason>"}`: Bazarr takes valid JSON that isn't a list
  as a failure, doesn't retry, writes nothing and logs the object, so the reason shows in Bazarr's
  log.
- **No ceiling from Bazarr.** Its 32-minute timeout is a read timeout, and each space resets it, so
  how long a translation may take is zimuarr's own working deadline (D24, "Time"), set by
  `translation`.
- **The heartbeat stays under Bun's idle timeout**, 10 seconds by default, which adapter-bun can
  raise only for the whole server and to at most 255 seconds. A short heartbeat keeps that
  protection for every other connection and needs no server option.
- **Proxies.** The response carries `Cache-Control: no-store, no-transform` and
  `X-Accel-Buffering: no`, so a proxy that honours them passes each space on instead of buffering
  it, and its read timeout, such as nginx's default 60 seconds, never fires. Compression is what
  buffers: nginx with `gzip on` held the spaces back until the headers were added, while Caddy with
  `encode` and Traefik with `compress` passed them either way (tested 2026-10-25). A proxy with a
  limit on the whole response must exempt the callback; `translation` documents what each common
  proxy needs.
- **The work outlives the connection.** A dropped connection doesn't stop the work, and Bazarr's
  retry joins it or gets the kept result (D20). A result or failure is kept before its answer is
  written, and finding an identity and registering new work is one step, so a retry never starts
  the work twice. Shutting zimuarr down cuts held callbacks after adapter-bun's 30-second window;
  `translation` decides what survives a restart and documents a container stop grace period of at
  least that window (Docker's default is 10 seconds).
- **Each held callback occupies one of Bazarr's jobs.** Bazarr runs translations in its shared job
  queue (`concurrent_jobs`, 8 on the owner's instances) next to searches, syncs and upgrades, and a
  job is busy until its callback returns. The per-instance concurrency in `admission` therefore
  stays below `concurrent_jobs`, so Bazarr's own work isn't starved.
- **Known limit.** A failure answer lost without the connection closing reaches Bazarr's read
  timeout only after 32 minutes, when the failure is no longer kept, so Bazarr's retry runs the
  work again. Keeping failures that long would refuse a deliberate new Translate click for half an
  hour, and zimuarr can't tell the two apart. It needs a connection that dies silently, which a
  Docker network rarely does, and costs at most one repeat within D24's limits (owner decision).

`contract-spike` proves this end to end against Bazarr 1.6.2, directly and through Caddy and nginx
with compression on.

Why: holding silently needs a custom server entry around adapter-bun to lift Bun's idle timeout,
is cut by any proxy's read timeout and makes Bazarr's 32 minutes a hard limit. Answering "retry
later" fails, because Bazarr's three attempts are over within seconds. Whitespace keeps the stock
adapter, works through ordinary proxies and leaves the deadline to zimuarr. Ending a failure with a
JSON object instead of invalid JSON makes Bazarr fail the job in one round trip, whichever attempt
it was, and shows the reason in its log (owner decision, after a review by a second model that
confirmed the Bazarr behaviour in `lingarr_translator.py` and `requests` 2.34.2).

### D26. The master key: its format, its checks, and when it's required

`secrets` (D17) takes one master key, exactly 32 bytes in canonical standard base64, from
`ZIMUARR_SECRET_KEY` or `ZIMUARR_SECRET_KEY_FILE`; setting both is an error, and an empty variable
counts as unset. Startup refuses a key whose bytes have at most 4.0 bits of Shannon entropy per
byte, step by one constant amount, or are all printable ASCII; there is no denylist. The key is
imported only as HKDF input, and each use derives its own key under its own label: the AES-256-GCM
key and a 16-byte key ID. A stored value is one text value,
`v1.<key id>.<nonce>.<ciphertext and tag>`, with `NULL` for none, and decrypts only under the table,
field, row and app it was written for. The `Secret` wrapper keeps plaintext out of logs, errors and
JSON, and `reveal()` is the only way to read it. There is no rotation: the key ID D17 asks for makes
a value written under another key fail with its own clear error, and a new key means entering the
stored secrets again, with a new callback key issued to each Bazarr instance. `secrets` checks the
key in SvelteKit's `init` hook from its first version, so every way of running the app, dev and CI
included, needs one. The key is restored with the database file (D15). The legacy spec names no
master key, only secrets "encrypted at rest where practical" (legacy "Security"); this one key
replaces that, and every stored secret is encrypted. Rotating each instance's callback key (legacy
"Security") is `bazarr-instances`' and isn't master-key rotation. A missing, malformed or weak
key's error puts the key the app ran with before a new one, because a lost variable or a typo in a
key in use fails the same checks, and the key loads before any database could say whether anything
is stored (owner decision, 2026-10-31). The details are in [SPEC-secrets.md](SPEC-secrets.md). The
design is the same in all five edbfi apps; only the variable prefix, the app name and the stored
secrets differ.

Why: the shared opening keeps `secrets` the same in every app (D17), and comradarr settled its
design first, with safety first (owner decision, after a council of three models and a review). Each
check catches a real mistake (a padded or doubled short secret, a counter, a passphrase), and
together they refuse a random key about once in 62 billion. A denylist adds upkeep without safety
once no key is ever written in the repo. One encoding and an error when both variables are set leave
nothing ambiguous at startup. An empty variable can't hold a key or a path, and Compose writes one
for every `${VAR}` that isn't defined, so counting it as set would only break the usual secret-file
setup (owner decision). HKDF keeps the master key out of every primitive but one, so later
uses can derive their own keys safely. One self-describing column can't come apart. The wrapper
joins every app, not only comradarr (owner decision). Rotation is left out because the apps are
rewritten from scratch with no stored data to carry over, and a key change is rare enough to handle
by entering a few secrets again (owner decision). Checking the key from the first version makes it
part of installing zimuarr from the start, rather than a surprise when a later module first stores a
secret. zimuarr was the last app to get its copy (owner decision, 2026-10-30).

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
