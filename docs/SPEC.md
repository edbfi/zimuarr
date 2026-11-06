# Spec: zimuarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-22) and built. The capability map below is approved; `contract-spike` is built
([SPEC-contract-spike.md](SPEC-contract-spike.md)), and so is `secrets`
([SPEC-secrets.md](SPEC-secrets.md)).

## Objective

zimuarr is a self-hosted subtitle translation control plane that works alongside Bazarr: it
observes subtitle state, plans translations from declarative policies, sends them to configured AI
providers, and calls a subtitle Verified only once Bazarr durably confirms the complete result
([PRODUCT.md](../PRODUCT.md)).

**Beyond the capability map, this spec covers only the ground floor:** an empty, production-shaped
SvelteKit app that builds, type-checks, tests, lints and serves on Bun, styled from the design
tokens, with the edbfi Bun web CI around it. It has no database, authentication, Bazarr, AI
providers or product features. Its job is to make the first module spec cheap to build: every later
PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24; the D20, D24 and D25 changes 2026-10-25; shared rows
aligned 2026-10-30). Module ids never change. Each module gets its own `docs/SPEC-<id>.md`, which the
owner approves just before it is built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[surface briefs](../.impeccable/surfaces/) and the [Module notes](#module-notes) below.

**Every module keeps to [Code structure](../AGENTS.md#code-structure).** Its spec names the files it
adds in that layout, and review checks them. In short:
- The same role folders as every edbfi app. A folder exists only once it holds a real file.
- One purpose per file. No `utils`, `helpers`, `common` or `misc` files.
- Group by domain under the role folders. The folder says where; the file name says what.
- Imports only go downwards. Routes, hooks and jobs stay thin and call services.
- Tests sit next to their source.

**Every module writes its text in English and Danish** through `i18n` (D18): no user-facing text in
components or services, and dates and numbers formatted for the viewer's locale.

**Instances run on their own** (D21): media, observations, desired subtitles, sessions, attempts and
artifacts each belong to one Bazarr instance, and lists filter by instance. Policies, revisions,
providers and the global ceilings are shared by all instances.

| # | Module id | Responsibility | Depends on | Surfaces |
|---|---|---|---|---|
| 1 | `contract-spike` | The Bazarr contract spike (D20): a callback that answers Bazarr's Lingarr translator, run against the latest stable Bazarr (D22), proving correlation by source and destination path with the fingerprint (with Bazarr's markup stripping replicated exactly), two episodes of one series at once, a normal and a forced subtitle from one source, and timeout, retry and cached replies, including a retry that arrives while the attempt before it still runs (D20), and the held callback and its answers through a real reverse proxy (D25). Its results become the first contract tests. No database, sign-in or UI, and its code becomes product code only through later specs | — | — |
| 2 | `secrets` | Encrypts stored secrets (Bazarr API keys, issued callback keys, provider keys, two-factor secrets, the OIDC client secret) before they reach the database (D17, D26), and the secret wrapper that shows only a redaction marker and opens at one named call | — | — |
| 3 | `i18n` | The translation groundwork (D18) with Paraglide JS (D19): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's locale, language names through `Intl.DisplayNames`, and a check that every message exists in both languages | — | the language switcher in each shell |
| 4 | `setup` | Startup checks, the database and migrations (D5), runtime settings, structured logging with redaction (D11), security headers and CSP (ground-floor choice 3), the setup gate, the bootstrap token, printed to the console and never through the stored logs, and claiming the instance for its one owner, with the address hint on the claim page (`sign-in`). zimuarr adds its health endpoint in place of `/healthz`'s fixed answer (ground-floor choice 5) | `secrets`, `i18n` | first-run setup: claim and account (no brief yet); `/healthz` |
| 5 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D17), sessions, sign-out (POST only), rate limits, the cross-origin check (it asks the browser, stores no address and takes `ORIGIN` as an optional override) and its address hint on the claim and sign-in pages, app-named cookies that work over plain HTTP at home and behind an HTTPS proxy, password change, error pages, recovery (D17), and the operator shell. zimuarr adds the shell's sidebar and its link to the source code, with zimuarr's version beside it, from the first release (PRODUCT.md, License) | `setup` | `/login`; the address hint on the claim page and `/login`; the operator shell; the Account tab of the settings (no brief yet); the password section of the Account tab |
| 6 | `two-factor` | Optional but strongly recommended (D17): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D17), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the operator shell while it is off | `sign-in` | the two-factor offer in first-run setup; its section of the Account tab; the reminder in the operator shell |
| 7 | `events` | Domain events and the append-only audit record of what happened and why, and the live stream to the browser with versioned envelopes and durable ids, so a page that reconnects catches up on what it missed | `sign-in` | — |
| 8 | `bazarr-provider` | The Bazarr API client: system status and version, series, episodes, movies and their subtitles page by page, subtitle content for fingerprints, the translate action, and the translator and upgrade settings for the checks in `bazarr-instances` (D23), with language codes normalised at the boundary | `setup` | — |
| 9 | `bazarr-instances` | Connecting Bazarr instances (D21): reachability and the version check against the latest stable release (D22), the issued callback key and its rotation, the Bazarr settings to change (pick Lingarr, endpoint and key, D20) with the warnings that Bazarr strips source markup and loses its built-in translators and the recommendation to turn off its translator-info cue (D20), the check that Bazarr points at zimuarr, the required upgrade settings (D23), observation-only by default, per-instance limits and the breaker, editing and removing. Adds the Connect Bazarr step to first-run setup | `sign-in`, `bazarr-provider` | `/setup/bazarr`; the Bazarr instances settings (no brief yet) |
| 10 | `observation` | The polling mirror: incremental per series, paged and rate-limited per instance, its cadence with Bazarr's live events as hints (D23), the guard that a failed page never retires desired subtitles, and the Bazarr breaker | `bazarr-instances`, `events` | "observed 2 min ago" on the dashboard and `/system` |
| 11 | `inventory` | Media and subtitles as mirrored, with filters in the URL, and the item detail with its Observed tab. `policies` adds the classifications and the Desired tab, and `verification` the Managed tab and the provenance chain | `observation` | `/inventory`, `/inventory/[item]` |
| 12 | `revisions` | Prompts, glossaries, validation policies and chunking strategies (D24) as typed configuration, each save a new content-addressed revision | `sign-in` | their editors (no brief yet) |
| 13 | `validation` | The completeness invariants and the other checks in its Module notes, with thresholds from the validation-policy revision: a pure component with property-based and adversarial tests, including the predecessors' exact failure sequences | `revisions` | — |
| 14 | `providers` | Translation providers (D24): a thin adapter plus a capability declaration each for OpenAI Chat Completions-, Anthropic Messages- and Open Responses-compatible endpoints and for DeepL, Google Cloud Translation and LibreTranslate, with language pairs, context use, proofreading and recovery of lost answers among the capabilities, credentials, models with typed parameters, versioned pricing revisions, the connection test, per-provider concurrency, pause and breakers (the structured-output breaker included), and the notice that subtitle text goes to the provider, over the SSRF-safe HTTP that `bazarr-provider` adds (D8). No raw request templates and no plugins | `sign-in`, `bazarr-provider` | `/settings/providers` |
| 15 | `policies` | Translation policies: scope (every instance by default or the ones named, D21), targets, source-language preferences, the fallback chain of provider profiles with its retry, repair and repeat limits, the context mode and lines, and proofreading (off, required or best effort, with its profile) (D24), revisions, activation mode, replacement permissions and pause; desired subtitles, source selection and the classifications that need no artifact, with the Desired tab and the classification of each row in `inventory` | `inventory`, `revisions`, `providers` | `/policies/[policy]` (the form); the policy list (no brief yet); the source-language preferences on `/settings/budgets` |
| 16 | `admission` | Safety decisions before dispatch, recorded with their reasons: dispatch windows, global, per-instance and per-provider concurrency, volume, character and line caps, breakers, the protection for unmanaged subtitles, and the global, per-provider and per-policy pause, with the always-visible Pause translations control | `policies` | the Pause translations control and dialog; the windows and caps settings (no brief yet) |
| 17 | `budgets` | Money: per-attempt, daily and monthly ceilings for all instances plus optional daily and monthly ceilings per instance (D21), reservation before dispatch and before every further billable call, a ceiling per session, lost answers counted as spent (D24), settlement after, releasing reservations of failed or expired sessions, pricing provenance, and reports by instance, provider and policy at the prices that applied | `admission`, `providers` | `/settings/budgets` |
| 18 | `plans` | The reconciliation planner and its explained plans: a reason and a safety verdict for each action, estimated cost, previews per policy, per instance or for everything, the same planner for preview and dispatch, and activation as a confirmed step | `admission`, `budgets` | the plan on `/policies/[policy]`; the Plans page (no brief yet) |
| 19 | `translation` | Closed-loop translation: sessions with deadlines and correlation (D20), dispatch of SRT sources (D20) with the path and ids exactly as Bazarr sees them, the Lingarr-compatible callback held open, chunked provider calls within the deadline, the fallback chain with retries and repairs, context and the proofreading stage (D24), validation before any answer, retries that join the running work and cached replies after an abandoned call (D20), the answers Bazarr retries or not, never an empty list, and the failure Bazarr won't retry once the chain runs out (D24), accepting callbacks zimuarr didn't plan under the policy chosen for the instance, with the per-instance switch to turn them off (D20), and safe failure on restart. Keeps every attempt with its candidate output and failing checks, and creates the managed artifact for output that passed. Holds the callback open with keep-alive whitespace for the working deadline (D25), and documents what a reverse proxy in front must allow. Adds the self-test round trip to the Connect Bazarr step | `plans`, `validation` | the round trip check on `/setup/bazarr`; the Bazarr-started switch and policy in the instances settings |
| 20 | `quarantine` | Quarantine review of the attempts `translation` rejected: their failing checks, the source and candidate side by side, discarding and re-attempting with different inputs. Incomplete output is never approved, and approved output reaches Bazarr as `upgrades` delivers it (D23) | `translation` | `/quarantine/[case]`; the Quarantine list (no brief yet) |
| 21 | `verification` | Verifying a managed artifact only when a later observation finds the subtitle Bazarr wrote, compared after Bazarr's writing rules (D23), noticing when Bazarr replaced it, the classifications that need an artifact (current, stale and manually modified), the protection for manually edited subtitles in `admission`, and the Managed tab with the provenance chain in `inventory` | `translation` | the Verified states and the Managed tab on `/inventory` |
| 22 | `activity` | Live and past sessions and attempts with their lifecycle, including abandoned-then-completed and cached-on-retry, with chunk and validation results and cost | `translation` | the Activity page (no brief yet) |
| 23 | `upgrades` | Acting on drift: managed upgrades of stale artifacts under admission, adopting unmanaged subtitles, and rollback and replacement with an approval and a reason, delivered as a new translation answered from the kept content (D23) | `verification` | their actions on `/inventory/[item]` (no brief yet) |
| 24 | `system` | System health: instances, providers, jobs, last observations and breakers in plain words, contract-drift warnings with the runtime drift detector that trips a breaker rather than guessing at an unexpected payload, running diagnostics and the redacted diagnostic bundle | `translation` | `/system` |
| 25 | `dashboard` | Counts by classification with the in-progress telemetry kept apart, recent observations, the budget rail with settled and reserved spend apart, connections and policy modes | `verification`, `budgets` | `/dashboard` |
| 26 | `api-keys` | The owner's API keys, as in comradarr: a recognisable prefix, shown once, stored as a hash, an optional enforced expiry, an optional narrower scope from a fixed list of actions, last used, and revoking. They reach only the versioned JSON API. Also publishes the OpenAPI document behind sign-in | `sign-in` | the API keys section of the settings (no brief yet) |
| 27 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D17) | `two-factor` | its section of the Account tab; its button on `/login` |

Build order: `contract-spike` → `secrets` → `i18n` → `setup` → `sign-in` → `two-factor` → `events` →
`bazarr-provider` → `bazarr-instances` → `observation` → `inventory`, `revisions` → `validation`,
`providers` → `policies` → `admission` → `budgets` → `plans` → `translation` → `quarantine`,
`verification`, `activity` → `upgrades`, `system`, `dashboard`, `api-keys`, `oidc-sign-in`. A comma
means either order works. The spike comes first because the whole product rests on Bazarr's
undocumented contract (D20; owner decision). Then come the five modules every edbfi app shares
(D17). Observation comes before planning, and admission and budgets come before `translation`, so no
provider is ever paid without a prior reservation (PRODUCT.md, principle 2). `translation` is the
first time zimuarr does its job.

First-run setup grows step by step: `setup` claims the instance and creates the owner account,
`two-factor` offers itself, `bazarr-instances` connects the first Bazarr instance, observation-only,
and `translation` adds the self-test round trip to that step (D17). Adding a provider, writing a
policy, previewing its plan and activating it come after first run (PRODUCT.md, "The working
rhythm").

### Where modules live

Paths are under `src/lib/server/`, except those starting with `routes/` (under `src/`) or `lib/`
(under `src/`), `hooks.server.ts` (`src/hooks.server.ts`) and `vite.config.ts` (at the repo
root). Signed-in pages sit in `routes/(app)/`, with the operator shell as its layout. The endpoint
zimuarr gives Bazarr is its address plus `/bazarr`, so the callback is
`routes/bazarr/api/translate/content/` and stays apart from zimuarr's own versioned API under
`routes/api/`. They follow the [Code structure](../AGENTS.md#code-structure) layout:

| Module | Main homes |
|---|---|
| `contract-spike` | `tests/contract/` (the contract tests; `compose.yaml` pins the Bazarr release they run against), `routes/bazarr/api/translate/content/`, `services/translation/` and `config/contract-spike.ts` (the callback and its stand-in translator, until `translation` decides what it keeps), `src/env.ts` (its settings) |
| `secrets` | `security/secrets/` (key checks, keyring, cipher, `Secret`), `config/secret-key.ts`, `src/env.ts` and the `init` hook in `hooks.server.ts` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (Paraglide's settings), `lib/shared/i18n/` (formatting and language names); `paraglideMiddleware` in `hooks.server.ts` |
| `setup` | `db/` (client, migrations, settings and owner schema), `config/`, `logging/` (with redaction), `services/setup/`, `services/health.ts`, `security/bootstrap-token.ts`, `security/headers.ts`; `routes/setup/`, `routes/healthz/`, and the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions and their storage, recovery), `db/` session schema, `security/` (session-token and password hashing, rate limiting, the cross-origin check), `vite.config.ts` (SvelteKit's own form check off); the sign-in and the address hint at the claim in `routes/setup/`, `routes/login/`, `routes/(app)/` layout, the Account tab under `routes/(app)/settings/`, `lib/components/layout/` |
| `two-factor` | `services/two-factor/`, the owner schema's two-factor fields in `db/`; the offer in `routes/setup/`, the challenge page beside `routes/login/`, its section of the Account tab, and the reminder in `lib/components/layout/` |
| `events` | `services/events/` (the bus and the audit record), `db/` event schema; the stream under `routes/api/`; the listener in `lib/components/layout/` |
| `bazarr-provider` | `providers/bazarr/`, `http/` (the SSRF-safe fetch, D8) |
| `bazarr-instances` | `services/bazarr-instances/`, `db/` instance schema, `security/callback-key.ts`; `routes/setup/bazarr/`, the instances settings under `routes/(app)/settings/` |
| `observation` | `services/observation/`, `db/` mirror schema, `jobs/observation.ts` |
| `inventory` | `services/inventory/`; `routes/(app)/inventory/`, `routes/(app)/inventory/[item]/` |
| `revisions` | `services/revisions/`, `db/` revision schema; their editors under `routes/(app)/` |
| `validation` | `services/validation/` |
| `providers` | `providers/translation/` (one adapter per provider), `services/providers/` (capabilities, models, pricing), `db/` provider schema; `routes/(app)/settings/providers/` |
| `policies` | `services/policies/` (policies, desired subtitles, source selection, classification), `db/` policy and desired-subtitle schema; `routes/(app)/policies/` |
| `admission` | `services/admission/`, `db/` safety-decision schema; the Pause control in `lib/components/layout/`, its settings under `routes/(app)/settings/` |
| `budgets` | `services/budgets/`, `db/` reservation, settlement and pricing schema; `routes/(app)/settings/budgets/` |
| `plans` | `services/plans/`; the plan on `routes/(app)/policies/[policy]/`, `routes/(app)/plans/` |
| `translation` | `services/translation/` (sessions, dispatch, execution, chunking), `db/` session, attempt and artifact schema, `jobs/dispatch.ts`, `jobs/session-deadlines.ts`; `routes/bazarr/api/translate/content/` |
| `quarantine` | `services/quarantine/`; `routes/(app)/quarantine/` |
| `verification` | `services/verification/`; its tab on `routes/(app)/inventory/[item]/` |
| `activity` | `services/activity/`; `routes/(app)/activity/` |
| `upgrades` | `services/upgrades/`; their actions on `routes/(app)/inventory/[item]/` |
| `system` | `services/system/` (diagnostics, the bundle, the drift detector); `routes/(app)/system/` |
| `dashboard` | `services/dashboard/`; `routes/(app)/dashboard/` |
| `api-keys` | `services/api-keys/`, `db/` API key schema, `security/api-key.ts`; its settings section under `routes/(app)/settings/`, the key check in `hooks.server.ts`, and the OpenAPI document under `routes/api/` |
| `oidc-sign-in` | `services/sign-in/oidc.ts`, the provider settings and the owner's link in `db/`; its callback route beside `routes/login/` |

### Open decisions each module closes

- `i18n`: the validation that D19 lists (pinned versions, the adapter-bun build, a Weblate round
  trip).
- `setup`: D14 (Turso and Drizzle versions), the logging library half of D13, and D15's backup
  and restore procedure, with the database file and the `secrets` key restored together.
  `verification` checks that a restore followed by a full mirror rebuild gives the same
  classifications.
- `sign-in`: how long an owner session lasts.
- `sign-in`: the password rules: the minimum length, whether a list of common passwords is
  refused, and how repeated failed sign-ins are slowed beyond the rate limits (backoff, or a lockout
  where the app's approved docs allow one).
- The first module with a background job closes the job half of D13: `sign-in` if its session
  cleanup is a job, otherwise `observation`.
- `observation`: the cadence, and whether it asks Bazarr to rescan a series or movie from disk
  (Bazarr's own full rescan runs once a day), with Bazarr's live events as hints (D23).
- `providers`: the dependencies of the provider adapters, if any (the owner approves each), and who
  owns capability declarations: shipped with zimuarr, editable by the owner, or both, and what
  happens when a provider's capabilities change.
- `policies`: the scope vocabulary (such as libraries, series, tags or paths) and how overlapping
  policies resolve.
- `admission`: the time zone of dispatch windows and daily caps.
- `budgets`: how a reservation bounds what a call can cost (its largest answer, say), so a
  settlement above the estimate can't break a ceiling.
- `translation`: the session states (D20 sets how long a session waits and how long output is
  kept), the shares of the working deadline and the default number of context lines (D24 sets the
  rest), and refusing and surfacing a callback that still matches more than one open session after
  D20's full key, rather than guessing.
- `quarantine`: whether complete but suspicious output can ever be approved.
- `upgrades`: the rules for adoption, rollback and replacement; D23 sets how their output reaches
  Bazarr.
- D12: the first JSON endpoint that needs a generated client decides it, at the latest `api-keys`,
  which publishes the OpenAPI document. D16 stays open as an accepted limit.

### Left out on purpose

- Any role beyond the one owner, such as viewers or approvers (D17).
- Signing in through a reverse proxy's headers (D17): `oidc-sign-in` covers the same identity
  providers.
- Matching media across instances, and reusing a translation across instances (D21; owner
  decision).
- Writing, moving or deleting subtitle files, Bazarr's upload, and detecting instances or other
  tools that share files (D23).
- Code for Bazarr versions other than the latest stable release, and workarounds for Bazarr bugs
  (D22).
- Anything of Lingarr beyond the callback Bazarr calls (D20; owner decision).
- Raw provider request templates (PRODUCT.md, D24): a permanent non-goal, because a templated
  request could break the schema the completeness checks rely on.
- Plugins, mixing providers within one file, a credit cue of zimuarr's own, and proofreading
  subtitles already delivered (D20, D24; owner decisions).
- The separate API and worker roles and the multi-process deployment (D4, D16).
- The container image: packaging lives in its own repository, as for the other edbfi apps, and
  D15's production-container check closes there. **Its first start** (deferred: a note, not a
  design) is specified and built only when Zimuarr is first tested through its image
  (`edbfi/zimuarr-docker`, a repository that doesn't exist yet); building images through GitHub,
  including the nightly build of `main`, is a later goal. The intent, with the app's code unchanged:
  when `ZIMUARR_SECRET_KEY` and `ZIMUARR_SECRET_KEY_FILE` are both unset or empty, the image's setup
  script points `ZIMUARR_SECRET_KEY_FILE` at `/config/secret.key` whenever that file exists. It
  creates the file first (a random 32-byte key in standard base64, written atomically, mode 0600,
  owned by the app's user) only when `/config/data` is empty and nothing shows an older install (the
  image's own defaults don't count, and the exact checks are decided with the image); otherwise it
  creates nothing, and the app stops with its own key error. An operator's own key or secret file
  always wins, and the README tells the operator to keep a copy of the key file. The previous
  zimuarr never shipped an image, so no earlier image's files need handling.
- Talking to Sonarr or Radarr, managing media and writing subtitle files (PRODUCT.md, principle 4).
- The light theme: deferred, not dropped. When it comes, the page loads in the chosen mode, with no
  flash of the other.
- Connecting Weblate (D18): later work. The message files are ready for it.

### Surfaces with no brief yet

First-run setup's claim and account and two-factor steps, the Account tab, the Bazarr instances
settings, the prompt, glossary and validation editors, the policy list, the Plans, Activity and
Quarantine lists, the windows and caps settings, the upgrade, adoption and rollback actions, the
`/inventory` list and the API keys section are needed (each is named in its capability-map row) but
have no brief. The `/setup/bazarr` brief needs the Bazarr settings to change (D20), a version
warning in place of its "Version compatible" check (D22), the upgrade-settings check (D23), and the
callback address and the plain-HTTP opt-in (Module notes, `bazarr-instances` and `bazarr-provider`).
The `/settings/budgets` brief needs the ceilings per instance (D21), and the `/policies/[policy]`
brief the instance scope (D21) and the fallback chain, context and proofreading (D24). The
`/settings/providers` brief needs the provider kinds and their capabilities (D24), the plain-HTTP
opt-in and typing the key again for a changed URL (Module notes, `providers`). Each gets its brief,
or its brief's change, before its module is specced.

### Module notes

What a capability-map row commits to in more detail than a clause fits. It is behaviour to keep
unless the module's approved spec or a decision changes it. Layout, placement, visuals and exact
wording are not behaviour: where a note describes them, DESIGN.md and the surface's brief win, and
for a surface with no brief yet the note is only a starting point for that brief. Each block moves
into its module's `SPEC-<id>.md` when that module is specced. `setup` and `sign-in` are shared with
the other edbfi apps (D17): a bullet or clause marked "(zimuarr)" is this app's own, and the rest is
the shared wording; a "(zimuarr)" mark inside a bullet covers the rest of that bullet, and
"(zimuarr: …)" only its own parentheses. Decision numbers in these blocks are zimuarr's; each app
cites its own.

#### setup

- **The claim** is a POST, cross-origin-checked like any other (`sign-in`), and it stores no
  address. It needs a valid bootstrap token and the browser's address (`sign-in`). Using up the
  token and creating the owner are one atomic step, and the owner session it starts follows
  `sign-in`'s cookies.
- **Security headers** (zimuarr: ground-floor choice 3), on every response, early returns included,
  include a referrer policy of `same-origin` or `strict-origin-when-cross-origin`, never
  `no-referrer` (which makes browsers send `Origin: null` on the app's own form posts).
- **The health endpoint** (zimuarr) takes the place of `/healthz`'s fixed `ok`, at the same path. It
  is public, so it says only whether zimuarr itself can serve: `200` with `ok`, or `503` while its
  database can't be read and written or its job runner has stopped (D7). The setup gate lets it
  through, so it answers before the claim too. An unreachable Bazarr instance or provider doesn't
  fail it, so a container health check never marks zimuarr unhealthy for someone else's outage. It
  shows no version (D22) and no names; instances, providers, jobs, the last observation of each
  instance and the breakers are shown behind sign-in on `/system` (`system`).

#### sign-in

- **SvelteKit's own form check is off:** `sveltekit({ csrf: { trustedOrigins: ['*'] } })` in
  `vite.config.ts` (SvelteKit 3 takes its options in the `sveltekit()` call, with no `kit:`
  wrapper). Remote functions stay off. A config test asserts both, so SvelteKit's only remaining
  check before `handle` is the remote-function one, which nothing uses. The cross-origin check
  replaces SvelteKit's form check.
- **The cross-origin check** asks the browser, so the app doesn't need to know its own address and
  stores none. It runs first in `handle` for every method except GET, HEAD and OPTIONS, and for
  every content type (form, JSON, multipart, `text/plain`, empty). Internal `event.fetch`
  subrequests (`event.isSubRequest`) skip it.
  - An `Origin` header, whenever it is present, must parse as one bare `http` or `https` origin;
    `null`, a malformed value or several values are refused. This applies on every branch below.
  - With `ORIGIN` set, a present `Origin` must equal `ORIGIN`, compared as parsed origins. Without
    `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
  - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`
    (`same-site` and `cross-site` are refused). Otherwise `Origin`'s host and port must equal the
    `Host` header, with default ports normalised. Browsers send `Sec-Fetch-Site` only to HTTPS,
    `localhost` and loopback addresses, so over plain HTTP outside loopback every browser gets
    this comparison.
  - A request with neither `Origin` nor `Sec-Fetch-Site` doesn't come from a browser. It passes only
    on an explicit list of machine routes (zimuarr: Bazarr's translator callback,
    `POST /bazarr/api/translate/content` with its `X-Api-Key` under D20, and the versioned JSON API
    with one of the owner's API keys under `api-keys`): the API-key endpoints and other machine
    routes the app's approved docs already name, each with the credentials those docs require. The
    session cookie is never honoured on it: such a request that carries only a session cookie gets a
    403. (zimuarr) The cross-origin check doesn't check those keys: on those routes, a request with
    neither header that doesn't carry only a session cookie goes on to the route's own key check, so
    the callback still answers a missing or wrong `X-Api-Key` with `401` (D25; `contract-spike`
    does the same for its stand-in keys), and the cross-origin check, like every other check, runs
    before the callback's held `200`.
  - A refusal is a 403 with the app's own "Access denied" page, or a JSON error for JSON callers,
    with the security headers and in the viewer's language.
- **The browser's address** is `ORIGIN` when it is set, and otherwise the validated `Origin` of the
  POST that passed the cross-origin check. It decides the cookies' `Secure` flag and the OIDC
  `redirect_uri`. Every POST that sets or deletes a cookie needs it, such as the claim, sign-in, the
  two-factor challenge, recovery, sign-out and the start of OIDC sign-in: when a browser stripped
  `Origin`, they get a 403 that says so (the "Access denied" page, or a JSON error for JSON
  callers). OIDC sign-in keeps the address in the flow's state. The OIDC callback address is saved
  when the owner configures OIDC, and must match. Links shown on GET pages for copying, such as the
  OIDC callback to register, are built in the browser from the address the user is on, or from
  `ORIGIN` when it is set (zimuarr: the address Bazarr is given is `bazarr-instances`' editable
  suggestion, never built from the browser's address). App code never uses `event.url.origin` or
  `event.url.protocol` for security, cookies or rendered URLs, which a test that searches the code
  enforces, and redirects stay relative.
- **The address hint:** when `ORIGIN` is set and doesn't match the address the browser is on, or
  when `ORIGIN` is unset and that address's host and port don't match the `Host` header, the claim
  and owner sign-in pages suggest setting `ORIGIN=<that address>` (or removing a wrong `ORIGIN`) or
  adding the proxy line `proxy_set_header Host $http_host`, so someone without a session can
  recover. (zimuarr) zimuarr has no module that diagnoses the browser's address, so this hint is
  the whole of that diagnosis.
- **`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name (an
  app prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
  variable). When set, it must be a bare `http` or `https` origin (a trailing `/` is fine; no path,
  query, fragment or credentials), compared as a parsed origin, or startup stops with an error that
  doesn't echo the value. adapter-bun 1.0.0 ignores `ORIGIN`; from 1.0.1 a set `ORIGIN` also
  corrects SvelteKit's `event.url`, and an empty `ORIGIN=""` throws with the value in the message,
  so the container image's entrypoint unsets an empty `ORIGIN` and its templates leave it out (the
  image's work, not this repo's).
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
- **Tests:** the cross-origin check is one pure module, unit-tested against a matrix of headers and
  copied to each app as D17 shares the opening modules. One Playwright test against the built server
  (`bun ./build`) checks that a cross-site form POST is refused and that a same-origin POST carrying
  no `Sec-Fetch-*` headers passes, both on `localhost` and on a plain-HTTP host name that isn't
  loopback (such as Chromium's `--host-resolver-rules="MAP app.test 127.0.0.1"`).
- **Cookies:** session cookies are named after the app (zimuarr: `zimuarr_session` for the owner
  session), because cookies ignore ports and apps on one address would otherwise sign each other
  out. They are host-only, `HttpOnly` and `SameSite=Lax`. Every cookie is `Secure` exactly when the
  browser's address is `https`, so a plain-HTTP install at home still works. Every cookie write and
  deletion sets `secure` explicitly (SvelteKit's default is `Secure` on every host but `localhost`),
  and a deletion whose scheme isn't known uses `secure: false`, which works over HTTP and HTTPS.
- **A wrong address never locks the owner out.** No stored address can stop password sign-in: a
  wrong `ORIGIN` is fixed or removed, then the app restarts. The OIDC callback address is stored,
  so OIDC may need registering again after a move, but password sign-in always remains (D17).

#### events

- **The live stream** refreshes the dashboard, activity and `/system` as things happen, without a
  reload.

#### bazarr-provider

- **Addresses.** An instance's address may be `https://` or `http://`. Plain HTTP is only for a
  local address, and only once the owner opts in for that address: loopback, the private LAN
  ranges, link-local, IPv6 unique-local and the shared range VPNs such as Tailscale use
  (`100.64.0.0/10`). Whether an address is local is judged by the address its name resolves to when
  zimuarr connects (D8), never by the name, so `http://bazarr:6767` on a Docker network can qualify
  and a local-looking name that resolves to a public address can't. The rule holds for every address
  zimuarr calls; `providers` applies it to provider base URLs.
- **At the boundary.** Bazarr's answers are validated and turned into zimuarr's own types where they
  arrive, and none of Bazarr's shapes reaches zimuarr's API or screens. Language identity is
  normalised there too, so Bazarr's mix of two-letter and three-letter codes never enters zimuarr's
  domain ([Bazarr research](research/bazarr.md)).

#### bazarr-instances

- **An instance** holds its address, the key for Bazarr's API, the address Bazarr calls zimuarr at,
  the distinct callback key zimuarr issued for it, observation-only or active, its limits, its
  breaker and the result of its version check (D21, D22). zimuarr tells instances apart only by that
  callback key, never by what a callback's payload says.
- **The callback address.** Before the first round trip, connecting an instance
  suggests the address Bazarr should call zimuarr at, as Bazarr sees it, in an editable field:
  `http://zimuarr:3000/bazarr` by default, the usual address on a shared Docker network, since
  Bazarr often can't reach the address the owner's browser uses. The owner enters it, with the
  issued key, as the Lingarr endpoint in Bazarr's settings. The check that Bazarr points at zimuarr
  compares Bazarr's endpoint and key with the stored ones (D23), and `translation`'s self-test
  round trip proves that Bazarr reaches it.
- **Editing.** A test or a save reuses the stored Bazarr API key only while the address is
  unchanged: a changed address needs the key typed again, so a stored secret is never sent to a
  newly typed address.

#### observation

- **The mirror** holds what Bazarr reports for each instance: series, episodes and movies with their
  Sonarr and Radarr ids, and each subtitle Bazarr reports for them, with its language, forced and
  hearing-impaired flags, its path or Bazarr's id for it and when it was observed, and, where read
  or given, its content fingerprint and file details. It is a replaceable copy, never the truth of
  record: it can be rebuilt from Bazarr at any time, and losing it never loses intent or provenance.
- **An unreachable instance** opens its Bazarr breaker: observation of that instance pauses, plans
  show it as unhealthy, and nothing is dispatched to it until the breaker closes (`admission`).

#### inventory

- **The list** is paged, and its sort and page live in the URL with its filters (row 11), so a view
  can be shared and survives a reload.

#### revisions

- **A revision is immutable** and named by the hash of its content, so identical content is the
  same revision, and whether an artifact's provenance still matches the current policy comes down
  to comparing hashes.

#### validation

- **Before any translated output is returned,** all of these hold, or the output is rejected:
  - every source cue is represented exactly once: no position missing, duplicated or unknown;
  - the order is valid;
  - a non-empty source line never comes back empty;
  - markup and control sequences meet the validation policy; this governs only what the model
    adds, because Bazarr strips the source's markup before it calls (D20);
  - the translation grows only within the policy's limits;
  - no repetition: the model didn't loop or copy one line across many;
  - no untranslated text: the output isn't still in the source language;
  - the provider's output matches the expected schema;
  - every chunk succeeded before the whole subtitle is accepted.
- **Thresholds** for growth, repetition and untranslated text live in the validation-policy
  revision, so tightening them makes earlier artifacts visibly stale rather than silently
  inconsistent.
- **Providers are untrusted:** their output is always checked in full.
- **The predecessors' failures are adversarial tests** (row 13):
  1. A provider's batch misses a position; the translator fills it with the source line and reports
     success, and Bazarr, which replaces only the positions present and non-empty, records a
     part-translated file as complete.
  2. Bazarr's first callback times out while the work still runs; its retry is deduplicated to an
     empty list, and Bazarr writes the untranslated file and logs success.
  3. The work finishes after Bazarr gave up, and Bazarr's retry must get the result.

  zimuarr rejects the first at the checks; in the other two the retry joins the running work or
  gets the kept output (D20), never an empty list (D24), and the work runs once (`translation`).

#### providers

- **Addresses.** A provider's base URL follows `bazarr-provider`'s address rule: plain HTTP only for
  a local address, such as a translation server on the LAN, once the owner opts in for that URL.
- **Editing.** A test or a save reuses a stored provider key only while the base URL is unchanged:
  when a key is stored, a changed URL needs it typed again, so a stored secret is never sent to a
  newly typed address.
- **At the boundary.** Provider answers are validated and turned into zimuarr's own types where they
  arrive, and none of a provider's shapes reaches zimuarr's API or screens.
- **Failures are classified:** output that breaks the schema counts toward the structured-output
  breaker, and rate limits and outages toward the provider's breaker. Retries, repairs and fallback
  are D24's.

#### policies

- **Changing a policy's translation inputs** (a revision, the provider chain or proofreading, D24)
  makes the artifacts they produced stale, never leaves them silently behind, and before the owner
  saves a change, the policy shows which artifacts it would make stale.
- **Desired subtitles** are durable and unique per instance, media item, target language, and forced
  and hearing-impaired flags; which variants are wanted comes from the item's Bazarr language
  profile (D23).
- **Source selection** picks the preferred available source by the policy's source-language
  preference, an ordered list of acceptable languages and their variants, and records which source
  revision, by fingerprint, it chose. When no acceptable source exists, the desired subtitle is
  missing but can't be acted on, and the plan says so.
- **Classifications** that need no artifact:
  - **Missing:** nothing in the target language and variant is observed or managed.
  - **Unmanaged:** a subtitle in the target language that zimuarr didn't produce or adopt;
    protected by default (`admission`).
  - **Blocked by a safety policy:** admissible in principle, but refused for now by a window, cap,
    budget, breaker or pause.
  - **Quarantined:** the latest attempt's output was kept for inspection, not delivered.
  - **No longer required:** the policy no longer selects the item, language or variant, so the
    desired subtitle may be retired.

  Only reconciliation changes a classification: the owner's actions (activating, approving,
  adopting, pausing) change inputs, and the next cycle classifies again.
- **With no policy yet,** the policy list points to writing one, with an example.

#### admission

- **Every decision is recorded** with its verdict against the named rules, and plans show each
  refusal with its reason.
- **The controls:** dispatch windows (hours and days); concurrency for all instances, per instance
  and per provider; hourly and daily caps on the number of translations, and limits on characters
  and subtitle lines; the Bazarr, provider and structured-output breakers; the global, per-provider
  and per-policy pause; and the protections below. Money is `budgets`', and retries and time are
  D24's.
- **Protections.** An unmanaged subtitle is never overwritten automatically: the owner adopts it
  (`upgrades`) or a policy explicitly permits replacing it. A managed subtitle someone edited
  (`verification`) is never replaced without a policy setting that allows it or an approval for
  that item. Both are admission rules, shown in plans as refusals with their reasons.
- **Breakers** open after repeated failures and close again when the owner resets them or after
  their cool-down. Their thresholds are settings, globally and per provider. A manual reset asks for
  confirmation and records a reason.
- **Pausing and resuming** are recorded with their reason. While the global pause is on, every
  signed-in page says so, as it does for an unreachable instance or a provider whose breaker is
  open.

#### budgets

- **Each reservation** (D24) estimates the cost from the model's pricing and the request's size.
  **Settlement** uses the usage the provider reports, or an estimate, marked as estimated, where its
  declaration says usage can only be estimated.
- **Ceilings hold under concurrency:** a reservation is taken against every ceiling that applies in
  one step, so sessions running at once can never exceed a ceiling between them.
- **Pricing revisions:** editing prices creates a new revision, every settled cost names the one it
  used, and reports never re-price old work.

#### plans

- **A reconciliation cycle** observes Bazarr's state (`observation`), resolves the policies that
  apply, computes the desired subtitles, compares desired, observed and managed state, classifies
  each gap and drift, produces the explained plan, evaluates admission for each action, dispatches
  what was admitted (`translation`), and verifies the result by a later observation
  (`verification`).
- **A preview** is available at any time, for active policies too.

#### translation

- **Dispatch,** for each admitted action: zimuarr fetches the source subtitle's content from Bazarr
  and computes its fingerprint the way Bazarr will build the lines it sends (D20); reserves the
  budget and the concurrency, opens the session and records the decision; then asks Bazarr to
  translate, with the path exactly as Bazarr sees it, the right id (the episode's for an episode,
  the movie's for a movie) and the forced and hearing-impaired flags as needed, as the contract
  tests dispatch (`tests/contract/bazarr.ts`). Each desired subtitle is claimed durably for its
  dispatch, so a restart or an overlapping job never dispatches it twice (D7).
- **A session** holds what correlates its callback (D20), the expected source content, its
  reservation, its deadlines (D20, D24) and its kept output, and records its whole lifecycle,
  including a caller that gave up before the work finished and kept output served to a retry.
- **An attempt** records its inputs: the source revision, the language pair, the profile and the
  frozen media details (D24), and the glossary, validation-policy and chunking-strategy revisions.
- **A callback without one of zimuarr's keys** gets `401` (D25) and is recorded as a security event
  (`events`). Bazarr is trusted only as far as its key: a callback's paths identify its work only
  together with that key, and the fingerprint confirms the match (D20).
- **Answering:** a result or a failure already kept for the work is answered at once (D20, D25); a
  callback for running work joins it (D20); otherwise the reply is held (D25) while the work runs
  within the working deadline, with the fallback chain, repairs and proofreading (D24). Output whose
  assembled file fails the `validation` checks is kept with its failing checks (`quarantine`), and
  the next profile gets an attempt, unless the policy makes failed checks fail the session (D24).
  Once the answer is chosen, the complete checked list, or D25's failure when the chain runs out,
  is kept before it is written, and its cost is settled. A successful answer is always the complete
  list.

#### quarantine

- **Approving** complete but suspicious output, if this module's spec allows it, asks for
  confirmation and records a reason.

#### verification

- **A managed artifact** links its desired subtitle, the source revision it was translated from and
  the attempt that produced it (unless it was adopted, `upgrades`), its own content fingerprint,
  when it was created and verified, and its drift.
- **Classifications** that need an artifact:
  - **Current:** the artifact is observed in place, and its provenance matches the policy's current
    inputs.
  - **Stale:** its source revision, one of its revisions, its provider or model, or the policy has
    changed since.
  - **Manually modified:** the observed subtitle no longer matches what zimuarr delivered, after
    Bazarr's writing rules (D23); someone edited it, and it is protected (`admission`).

#### activity

- **With nothing to list yet,** the page says why, such as every instance still observing only.

#### upgrades

- **Adopting** takes an existing unmanaged subtitle under management.
- **After an upgrade,** the old artifact keeps its provenance.

#### system

- **Breakers:** each one's history, with the reason it tripped.
- **Diagnostics** check each instance's connection and version, that its translator points at
  zimuarr (D23), and run the self-test round trip (`translation`); the diagnostic bundle has every
  secret redacted.

#### dashboard

- **With no instance connected,** it points to connecting one.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D11, D27). Versions are exact pins in
`package.json` (Bun from its `packageManager` field) and `bun.lock`; Dependabot moves them to the
newest stable release (D27). Every package is a dev dependency, so adapter-bun bundles it and
`bun ./build` needs no `node_modules`.

| Part | Package |
|---|---|
| Runtime and package manager | Bun |
| Language | `typescript` (6.x) |
| UI framework | `svelte` / `@sveltejs/kit` |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` |
| Adapter | `@sveltejs/adapter-bun` |
| Styling | `@pandacss/dev`, `@pandacss/vite` (its Vite plugin), `@pandacss/preset-base` |
| Primitives | `@ark-ui/svelte` |
| Type check | `svelte-check` |
| Unit tests | `vitest` (`node` environment); `happy-dom` joins with the first component test |
| e2e | `@playwright/test` (Chromium) |
| Lint and format | `@biomejs/biome` |

Setup facts for this stack:
- SvelteKit 3 is configured through its Vite plugin (`vite.config.ts`); there's no
  `svelte.config.js`. `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Package subpath imports replace `$lib` and need explicit file targets: `#lib/*` maps to
  `./src/lib/*` and imports name the file with its extension (`#lib/server/services/health.ts`);
  `#styled-system/*` maps to the generated `./styled-system/*/index.js`.
- `svelte-kit sync` runs before Panda's codegen, in `prepare` and in `check`.
- The Panda Vite plugin appends the generated CSS to the stylesheet that declares the layer order
  (`src/app.css`), and `transform: true` turns static `css()` calls into class strings at build
  time.
- Hook types come from `@sveltejs/kit/hooks`.
- SvelteKit 3 exposes only the environment variables declared in `src/env.ts`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server; needs a key in `.env` or the environment, and without one every request fails with the key error |
| `bun run --bun build` | production build through adapter-bun into `build/`; needs no key and never embeds one |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`); without a valid key it exits before listening |
| `bun run --bun check` | `svelte-kit sync`, Panda codegen, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e: the browser smoke test and the startup tests, with a key it generates, never a developer's `.env` or exported key; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome ci`, read-only; `biome.json` lists the file extensions Biome checks |
| `bun run --bun contract:up` | starts the throwaway Bazarrs, Sonarr, Radarr, Caddy and nginx under a project of its own and provisions them (needs Docker) |
| `bun run --bun contract` | builds zimuarr, starts it with a key it generates and runs every contract case but C5 |
| `bun run --bun contract:full` | the same with C5 (a 35-minute translation) |
| `bun run --bun contract:down` | removes the run's services, their volumes and `tests/contract/.state/` |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The folder tree is in [AGENTS.md](../AGENTS.md#structure) and its rules in
[Code structure](../AGENTS.md#code-structure).

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports. File names and layout follow [Code structure](../AGENTS.md#code-structure).

```ts
import { healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => healthResponse();
```

## Design tokens

- [`panda.config.ts`](../panda.config.ts) holds every design token: colours, type styles,
  spacing, radii, layout sizes, breakpoints and motion durations, under the names DESIGN.md uses.
- Colours are semantic tokens behind a colour-mode condition (`_dark`), dark by default
  (`class="dark"` on `<html>` in `src/app.html`); light values can be added later without touching
  components.
- Only `@pandacss/preset-base` is loaded (utilities and conditions), so no preset palette competes
  with the app's tokens, and `strictTokens` makes a raw value in `css()` a type error that `check`
  reports.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components. Its
  heading uses the `h1` style (Public Sans).

## Testing strategy

- **Unit (Vitest's `unit` project, `node` environment):** next to their source: the `/healthz`
  handler (status 200, body `ok`, `cache-control: no-store`), the callback's modules, the contract
  job's case selection and the `secrets` module (`config/secret-key.test.ts`, and
  `key-text.test.ts`, `keyring.test.ts`, `cipher.test.ts` and `secret.test.ts` in
  `security/secrets/`, under `src/lib/server/`). Component tests use happy-dom when components
  exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** against the built adapter-bun server, with a master key
  Playwright generates for each run, so CI needs no stored secret.
  - `smoke.test.ts` checks that `/` returns 200, shows the placeholder heading, hydrates (it waits
    for the `data-hydrated` attribute the root layout sets when mounted), applies the Panda
    background token and `h1` text style and logs no console errors, and that `/healthz` returns
    `ok`.
  - `secret-key.test.ts` checks that the built server refuses to start without a valid key.
- **Contract (Vitest's `contract` project, Docker):** C1–C12 against real, unmodified Bazarrs
  ([SPEC-contract-spike.md](SPEC-contract-spike.md)), with a master key the harness generates for
  each run. `bun run --bun test` and prek run only the `unit` project.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds with no key and runs `smoke`.

## CI and repo tooling

zimuarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke), `contract`
  and `audit` (outside PRs); `checks`, `smoke` and `contract` sit behind `ci-ok`, every job that
  installs runs with failing `node`, `npm` and `npx` on `PATH`, and the weekly run is `7 5 * * 0`.
- `contract` (a departure from the template, approved with `contract-spike`) picks its cases inside
  the job with `tests/contract/select.ts`: nothing for a pull request of only Markdown, `docs/`,
  `.impeccable/` or images (it passes as not applicable); every case for the weekly and manual
  runs, a pull request that changes `tests/contract/compose.yaml` and one whose changed files
  can't be listed; every case but C5 otherwise. It has a 90-minute timeout and uploads the run's
  evidence, keys redacted, as an artifact kept for 7 days.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit`, `bun` and, weekly, the contract
  tests' images (`docker-compose` in `/tests/contract`, each image its own PR, so a Bazarr release
  merges only once every contract case passes against it: D22), and
  `.github/workflows/biome-migrate.yml` applies Biome migrations and formatter output to
  Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Bazarr, AI providers or any other product feature before
  its module's approved spec builds it; a second styling tool or primitive library; Node, npm or
  npx anywhere, including CI.

## Success criteria

1. A fresh clone passes `bun ci`, `bun run --bun check` (zero errors and warnings), `bun run --bun
   test`, `bun run --bun build`, `bun run --bun smoke` and `prek run --all-files --hook-stage
   manual`, with no Node on `PATH`.
2. The built server (`bun ./build`) serves `/` with the placeholder page and `/healthz` with `ok`.
3. `panda.config.ts` holds every design token; the seed token files are gone, and nothing in `src/`
   uses a raw colour, size or font value.
4. Only folders with real files exist; `#lib` resolves in app code, tests and `svelte-check`.
5. CI on the PR runs `checks`, `smoke` and `ci-ok` green; `audit` runs outside PRs.

## Ground-floor choices

Choices 1–3 were settled for the first rewrite app's skeleton and are reused here, since zimuarr's
design doesn't call for anything different; choices 4 and 5 are zimuarr's own.

1. **Fonts.** DESIGN.md wants Public Sans and Roboto Mono bundled locally, with no remote font
   requests. The skeleton defines the font tokens with system fallbacks; the first surface adds the
   font files (a dependency the owner approves then).
2. **Ark UI before its first use.** The skeleton installs `@ark-ui/svelte`, so the Panda and Ark
   pairing and `check-peers` are settled early; the first `ui/` wrapper comes with the first surface
   that needs one.
3. **Security headers and CSP.** zimuarr needs authentication on its interface and API, and a
   first-run setup that closes after use (D17). Security headers and a CSP belong to the first
   module that serves real pages (`setup`, whose claim page comes before `sign-in`), not the
   skeleton.
4. **No logo yet.** zimuarr has no logo or icon file, so the skeleton has no `static/` folder and no
   favicon; the visible name is the text "Zimuarr". A logo joins when the owner provides one.
5. **Health.** `/healthz` always answers `ok`. `setup`, which adds the database, replaces that with
   the health endpoint in its Module notes, and the parts it leaves out are shown on `/system`
   (row 24).
