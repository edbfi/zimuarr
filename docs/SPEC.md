# Spec: zimuarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-22) and built. The capability map below is approved; `contract-spike` is specified in
[SPEC-contract-spike.md](SPEC-contract-spike.md).

## Objective

zimuarr is a self-hosted subtitle translation control plane that works alongside Bazarr: it
observes subtitle state, plans translations from declarative policies, sends them to configured AI
providers, and calls a subtitle Verified only once Bazarr durably confirms the complete result
([PRODUCT.md](../PRODUCT.md), [legacy spec](product/legacy-spec.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Bazarr, AI providers or product features. Its job
is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24; the D20, D24 and D25 changes 2026-10-25). Module ids
never change. Each module gets its own `docs/SPEC-<id>.md`, which the owner approves just before it
is built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[legacy spec](product/legacy-spec.md) and the [surface briefs](../.impeccable/surfaces/).

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
| 1 | `contract-spike` | The Bazarr contract spike (D20; legacy "Delivery sequence", phase 0): a callback that answers Bazarr's Lingarr translator, run against the latest stable Bazarr (D22), proving correlation by source and destination path with the fingerprint (with Bazarr's markup stripping replicated exactly), two episodes of one series at once, a normal and a forced subtitle from one source, and timeout, retry and cached replies, including a retry that arrives while the attempt before it still runs (D20), and the held callback and its answers through a real reverse proxy (D25). Its results become the first contract tests. No database, sign-in or UI, and its code becomes product code only through later specs | — | — |
| 2 | `secrets` | Encrypts stored secrets (Bazarr API keys, issued callback keys, provider keys, two-factor secrets, the OIDC client secret) before they reach the database (D17) | — | — |
| 3 | `i18n` | The translation groundwork (D18) with Paraglide JS (D19): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's locale, language names through `Intl.DisplayNames`, and a check that every message exists in both languages | — | the language switcher in each shell |
| 4 | `setup` | Startup checks, the database and migrations (D5), runtime settings, structured logging with redaction (D11), security headers and CSP (ground-floor choice 3), the setup gate, the bootstrap token, and claiming the instance for its one owner, keeping the origin it was claimed from as the first allowed origin. Replaces `/healthz` with the legacy health endpoint, to which later modules add their parts (ground-floor choice 5) | `secrets`, `i18n` | first-run setup: claim and account (no brief yet); `/healthz` |
| 5 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D17), sessions, sign-out, rate limits, the origin check, cookies that work over plain HTTP at home and behind an HTTPS proxy (legacy "Security"), password change, recovery (D17), error pages, and the operator shell with the sidebar and the link to the source code (legacy "Licensing fact") | `setup` | `/login`; the operator shell; the Account tab of the settings (no brief yet) |
| 6 | `two-factor` | Optional but strongly recommended (D17): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D17), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the operator shell while it is off | `sign-in` | the two-factor offer in first-run setup; its section of the Account tab; the reminder in the operator shell |
| 7 | `events` | Domain events and the append-only audit record (legacy "Domain model"), and the live stream to the browser with versioned envelopes and durable ids, so a page that reconnects catches up on what it missed (legacy "Key interaction patterns") | `sign-in` | — |
| 8 | `bazarr-provider` | The Bazarr API client: system status and version, series, episodes, movies and their subtitles page by page, subtitle content for fingerprints, the translate action, and the translator and upgrade settings for the checks in `bazarr-instances` (D23), with language codes normalised at the boundary (legacy "Data-shape facts") | `setup` | — |
| 9 | `bazarr-instances` | Connecting Bazarr instances (D21): reachability and the version check against the latest stable release (D22), the issued callback key and its rotation, the Bazarr settings to change (pick Lingarr, endpoint and key, D20) with the warnings that Bazarr strips source markup and loses its built-in translators and the recommendation to turn off its translator-info cue (D20), the check that Bazarr points at zimuarr, the required upgrade settings (D23), observation-only by default, per-instance limits and the breaker, editing and removing. Adds the Connect Bazarr step to first-run setup | `sign-in`, `bazarr-provider` | `/setup/bazarr`; the Bazarr instances settings (no brief yet) |
| 10 | `observation` | The polling mirror (legacy "Direction 3"): incremental per series, paged and rate-limited per instance, its cadence with Bazarr's live events as hints (D23), the guard that a failed page never retires desired subtitles (legacy "Failure handling"), and the Bazarr breaker | `bazarr-instances`, `events` | "observed 2 min ago" on the dashboard and `/system` |
| 11 | `inventory` | Media and subtitles as mirrored, with filters in the URL, and the item detail with its Observed tab. `policies` adds the classifications and the Desired tab, and `verification` the Managed tab and the provenance chain | `observation` | `/inventory`, `/inventory/[item]` |
| 12 | `revisions` | Prompts, glossaries, validation policies and chunking strategies (D24) as typed configuration, each save a new content-addressed revision (legacy "Provenance as a first-class, nearly free feature") | `sign-in` | their editors (no brief yet) |
| 13 | `validation` | The completeness invariants and the other checks of legacy "Validation invariants", with thresholds from the validation-policy revision: a pure component with property-based and adversarial tests, including the predecessors' exact failure sequences (legacy "Improvement ideas") | `revisions` | — |
| 14 | `providers` | Translation providers (D24): a thin adapter plus a capability declaration each for OpenAI Chat Completions-, Anthropic Messages- and Open Responses-compatible endpoints and for DeepL, Google Cloud Translation and LibreTranslate, with language pairs, context use, proofreading and recovery of lost answers among the capabilities, credentials, models with typed parameters, versioned pricing revisions, the connection test, per-provider concurrency, pause and breakers (the structured-output breaker included), and the notice that subtitle text goes to the provider (legacy "Privacy posture"), over the SSRF-safe HTTP that `bazarr-provider` adds (D8). No raw request templates and no plugins | `sign-in`, `bazarr-provider` | `/settings/providers` |
| 15 | `policies` | Translation policies: scope (every instance by default or the ones named, D21), targets, source-language preferences, the fallback chain of provider profiles with its retry, repair and repeat limits, the context mode and lines, and proofreading (off, required or best effort, with its profile) (D24), revisions, activation mode, replacement permissions and pause; desired subtitles, source selection and the classifications that need no artifact (legacy "Desired subtitle"), with the Desired tab and the classification of each row in `inventory` | `inventory`, `revisions`, `providers` | `/policies/[policy]` (the form); the policy list (no brief yet); the source-language preferences on `/settings/budgets` |
| 16 | `admission` | Safety decisions before dispatch, recorded with their reasons (legacy "Safety and admission control"): dispatch windows, global, per-instance and per-provider concurrency, volume, character and line caps, breakers, the protection for unmanaged subtitles, and the global, per-provider and per-policy pause, with the always-visible Pause translations control | `policies` | the Pause translations control and dialog; the windows and caps settings (no brief yet) |
| 17 | `budgets` | Money: per-attempt, daily and monthly ceilings for all instances plus optional daily and monthly ceilings per instance (D21), reservation before dispatch and before every further billable call, a ceiling per session, lost answers counted as spent (D24), settlement after, releasing reservations of failed or expired sessions, pricing provenance, and reports by instance, provider and policy at the prices that applied | `admission`, `providers` | `/settings/budgets` |
| 18 | `plans` | The reconciliation planner and its explained plans: a reason and a safety verdict for each action, estimated cost, previews per policy, per instance or for everything, the same planner for preview and dispatch, and activation as a confirmed step | `admission`, `budgets` | the plan on `/policies/[policy]`; the Plans page (no brief yet) |
| 19 | `translation` | Closed-loop translation (legacy "Dispatch", "The callback and the translation execution"): sessions with deadlines and correlation (D20), dispatch of SRT sources (D20) with the path and ids exactly as Bazarr sees them, the Lingarr-compatible callback held open, chunked provider calls within the deadline, the fallback chain with retries and repairs, context and the proofreading stage (D24), validation before any answer, retries that join the running work and cached replies after an abandoned call (D20), the answers Bazarr retries or not, never an empty list, and the failure Bazarr won't retry once the chain runs out (D24), accepting callbacks zimuarr didn't plan under the policy chosen for the instance, with the per-instance switch to turn them off (D20), and safe failure on restart. Keeps every attempt with its candidate output and failing checks, and creates the managed artifact for output that passed. Holds the callback open with keep-alive whitespace for the working deadline (D25), and documents what a reverse proxy in front must allow (legacy "Deployment shape"). Adds the self-test round trip to the Connect Bazarr step | `plans`, `validation` | the round trip check on `/setup/bazarr`; the Bazarr-started switch and policy in the instances settings |
| 20 | `quarantine` | Quarantine review of the attempts `translation` rejected: their failing checks, the source and candidate side by side, discarding and re-attempting. Incomplete output is never approved, and approved output reaches Bazarr as `upgrades` delivers it (D23) | `translation` | `/quarantine/[case]`; the Quarantine list (no brief yet) |
| 21 | `verification` | Verifying a managed artifact only when a later observation finds the subtitle Bazarr wrote, compared after Bazarr's writing rules (D23), noticing when Bazarr replaced it, the classifications that need an artifact (current, stale and manually modified), the protection for manually edited subtitles in `admission`, and the Managed tab with the provenance chain in `inventory` | `translation` | the Verified states and the Managed tab on `/inventory` |
| 22 | `activity` | Live and past sessions and attempts with their lifecycle, including abandoned-then-completed and cached-on-retry, with chunk and validation results and cost | `translation` | the Activity page (no brief yet) |
| 23 | `upgrades` | Acting on drift (legacy "Upgrades and lifecycle"): managed upgrades of stale artifacts under admission, adopting unmanaged subtitles, and rollback and replacement with an approval and a reason, delivered as a new translation answered from the kept content (D23) | `verification` | their actions on `/inventory/[item]` (no brief yet) |
| 24 | `system` | System health: instances, providers, jobs, last observations and breakers in plain words, contract-drift warnings with the runtime drift detector that trips a breaker (legacy "Improvement ideas"), running diagnostics and the redacted diagnostic bundle | `translation` | `/system` |
| 25 | `dashboard` | Counts by classification with the in-progress telemetry kept apart, recent observations, the budget rail with settled and reserved spend apart, connections and policy modes | `verification`, `budgets` | `/dashboard` |
| 26 | `api-keys` | The owner's API keys, as in comradarr: a recognisable prefix, shown once, stored as a hash, an optional enforced expiry, an optional narrower scope from a fixed list of actions, last used, and revoking. They reach only the versioned JSON API. Also publishes the OpenAPI document behind sign-in | `sign-in` | the API keys section of the settings (no brief yet) |
| 27 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D17) | `two-factor` | its section of the Account tab; its button on `/login` |

Build order: `contract-spike` → `secrets` → `i18n` → `setup` → `sign-in` → `two-factor` → `events` →
`bazarr-provider` → `bazarr-instances` → `observation` → `inventory`, `revisions` → `validation`,
`providers` → `policies` → `admission` → `budgets` → `plans` → `translation` → `quarantine`,
`verification`, `activity` → `upgrades`, `system`, `dashboard`, `api-keys`, `oidc-sign-in`. A comma
means either order works. The spike comes first because the whole product rests on Bazarr's
undocumented contract (D20; owner decision). Then come the five modules every edbfi app shares
(D17). Observation and planning follow the legacy delivery sequence, but admission and budgets come
before `translation`, so no provider is ever paid without a prior reservation (PRODUCT.md, principle
2). `translation` is the first time zimuarr does its job.

First-run setup grows step by step: `setup` claims the instance and creates the owner account,
`two-factor` offers itself, `bazarr-instances` connects the first Bazarr instance, observation-only,
and `translation` adds the self-test round trip to that step (D17; legacy "First-run and
onboarding"). Adding a provider, writing a policy, previewing its plan and activating it come after
first run (PRODUCT.md, "The working rhythm").

### Where modules live

Paths are under `src/lib/server/`, except those starting with `routes/` (under `src/`) or `lib/`
(under `src/`), and `hooks.server.ts` (`src/hooks.server.ts`). Signed-in pages sit in
`routes/(app)/`, with the operator shell as its layout. The endpoint zimuarr gives Bazarr is its
address plus `/bazarr`, so the callback is `routes/bazarr/api/translate/content/` and stays apart
from zimuarr's own versioned API under `routes/api/`. They follow the
[Code structure](../AGENTS.md#code-structure) layout:

| Module | Main homes |
|---|---|
| `contract-spike` | the contract tests, the Bazarr release they run against and the spike's callback, where its spec puts them in the Code structure layout |
| `secrets` | `security/secrets/`; loading the key in `config/` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (Paraglide's settings), `lib/shared/i18n/` (formatting and language names); `paraglideMiddleware` in `hooks.server.ts` |
| `setup` | `db/` (client, migrations, settings and owner schema), `config/`, `logging/` (with redaction), `services/setup/`, `services/health.ts`, `security/bootstrap-token.ts`, `security/headers.ts`; `routes/setup/`, `routes/healthz/`, and the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions and their storage, recovery), `db/` session schema, `security/` (session-token and password hashing, rate limiting, origin check); the sign-in at the claim in `routes/setup/`, `routes/login/`, `routes/(app)/` layout, the Account tab under `routes/(app)/settings/`, `lib/components/layout/` |
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

- `contract-spike`: whether correlation by source and destination path holds (D20), the exact
  normalisation of Bazarr's plaintext lines, and whether the held callback (D25) works end to end
  through a reverse proxy.
- `i18n`: the validation that D19 lists (pinned versions, the adapter-bun build, a Weblate round
  trip).
- `setup`: D14 (Turso and Drizzle versions), the logging library half of D13, and D15's backup
  and restore procedure, with the database file and the `secrets` key restored together.
  `verification` checks that a restore followed by a full mirror rebuild gives the same
  classifications (legacy "Persistence and backups").
- The first module with a background job closes the job half of D13: `sign-in` if its session
  cleanup is a job, otherwise `observation`.
- `observation`: the cadence, and whether it asks Bazarr to rescan a series or movie from disk
  (Bazarr's own full rescan runs once a day), with Bazarr's live events as hints (D23; legacy, open
  question 10).
- `providers`: the dependencies of the provider adapters, if any (the owner approves each), and who
  owns capability declarations (legacy, open question 8).
- `policies`: the scope vocabulary and how overlapping policies resolve (legacy, open question 1).
- `admission`: the time zone of dispatch windows and daily caps.
- `translation`: the session states (open question 2; D20 sets how long a session waits and how
  long output is kept), the shares of the working deadline and the default number of context lines
  (open question 7; D24 sets the rest), and refusing fingerprint collisions.
- `quarantine`: whether complete but suspicious output can ever be approved (open question 5).
- `upgrades`: the rules for adoption, rollback and replacement (open question 6); D23 sets how
  their output reaches Bazarr.
- D12: the first JSON endpoint that needs a generated client decides it, at the latest `api-keys`,
  which publishes the OpenAPI document. D16 stays open as an accepted limit.

### Left out on purpose

- Any role beyond the one owner, such as viewers or approvers (legacy, open question 9; D17).
- Signing in through a reverse proxy's headers (D17): `oidc-sign-in` covers the same identity
  providers.
- Matching media across instances, and reusing a translation across instances (D21; owner
  decision).
- Writing, moving or deleting subtitle files, Bazarr's upload, and detecting instances or other
  tools that share files (D23).
- Code for Bazarr versions other than the latest stable release, and workarounds for Bazarr bugs
  (D22).
- Anything of Lingarr beyond the callback Bazarr calls (D20; owner decision).
- Raw provider request templates (PRODUCT.md, legacy "Provider capability model"): a permanent
  non-goal.
- Plugins, mixing providers within one file, a credit cue of zimuarr's own, and proofreading
  subtitles already delivered (D20, D24; owner decisions).
- The separate API and worker roles and the multi-process deployment (D4, D16).
- The container image: packaging lives in its own repository, as for the other edbfi apps, and
  D15's production-container check closes there.
- Talking to Sonarr or Radarr, managing media and writing subtitle files (PRODUCT.md, principle 4).
- The light theme (legacy spec header): deferred, not dropped.
- Connecting Weblate (D18): later work. The message files are ready for it.

### Surfaces with no brief yet

First-run setup's claim and account and two-factor steps, the Account tab, the Bazarr instances
settings, the prompt, glossary and validation editors, the policy list, the Plans, Activity and
Quarantine lists, the windows and caps settings, the upgrade, adoption and rollback actions, the
`/inventory` list and the API keys section are needed (all are in the legacy spec or in PRODUCT.md's
sidebar) but have no brief. The `/setup/bazarr` brief needs the Bazarr settings to change (D20), a
version warning in place of its "Version compatible" check (D22) and the upgrade-settings check
(D23), the `/settings/budgets` brief the ceilings per instance (D21), the `/policies/[policy]` brief
the instance scope (D21) and the fallback chain, context and proofreading (D24), and the
`/settings/providers` brief the provider kinds and their capabilities (D24). Each gets its brief, or
its brief's change, before its module is specced.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D11). Versions are exact pins in
`package.json` (Bun from its `packageManager` field) and `bun.lock`; Dependabot moves them. Every
package is a dev dependency, so adapter-bun bundles it and `bun ./build` needs no `node_modules`.

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
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server |
| `bun run --bun build` | production build through adapter-bun into `build/` |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`) |
| `bun run --bun check` | `svelte-kit sync`, Panda codegen, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e smoke; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome check` |
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
  It replaced the seed token files that came with the design package.
- Colours are semantic tokens behind a colour-mode condition (`_dark`), dark by default
  (`class="dark"` on `<html>` in `src/app.html`); light values can be added later without touching
  components.
- Only `@pandacss/preset-base` is loaded (utilities and conditions), so no preset palette competes
  with the app's tokens, and `strictTokens` makes a raw value in `css()` a type error that `check`
  reports.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components. Its
  heading uses the `h1` style (Public Sans).

## Testing strategy

- **Unit (Vitest, `node` environment):** one test, for the `/healthz` handler: status 200, body
  `ok`, `cache-control: no-store`. Component tests use happy-dom when components exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** one smoke test against the built adapter-bun server.
  It checks that `/` returns 200, shows the placeholder heading, hydrates (it waits for the
  `data-hydrated` attribute the root layout sets when mounted), applies the Panda background token
  and `h1` text style and logs no console errors, and that `/healthz` returns `ok`.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds and runs the smoke test.

## CI and repo tooling

zimuarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke) and `audit`
  (outside PRs); `checks` and `smoke` sit behind `ci-ok`, every job that installs runs with failing
  `node`, `npm` and `npx` on `PATH`, and the weekly run is `7 5 * * 0`.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit` and `bun`, and
  `.github/workflows/biome-migrate.yml` applies Biome migrations and formatter output to
  Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Bazarr, AI providers or any product feature; a second
  styling tool or primitive library; Node, npm or npx anywhere, including CI.

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
3. **Security headers and CSP.** The legacy spec's Security section requires authentication on the
   web UI and API, with first-run setup as the only unauthenticated write path. Security headers and
   a CSP belong to the first module that serves real pages (`setup`, whose claim page comes before
   `sign-in`), not the skeleton.
4. **No logo yet.** zimuarr has no logo or icon file, so the skeleton has no `static/` folder and no
   favicon; the visible name is the text "Zimuarr". A logo joins when the owner provides one.
5. **Health.** `/healthz` always answers `ok`. `setup`, which adds the database, replaces it with
   the legacy spec's health endpoint (Logging, health, diagnostics), and later modules add their
   parts: instances, providers, workers, last observation times and breaker states.
