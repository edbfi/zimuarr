# Spec: zimuarr

**Status:** the ground floor (skeleton) is specified here and approved by the orchestrator
(2026-10-22). Product modules aren't specified yet (see the capability map).

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

Placeholder. Product modules come later, each through an owner-approved `docs/SPEC-<id>.md`. The map
(module ids, dependencies, build order) is proposed with `spec-driven-development` Phase 0 after the
skeleton has merged, from the legacy spec and the [surface briefs](../.impeccable/surfaces/). No
module id exists yet.

## Tech stack

The stack decisions are in [decisions.md](decisions.md) (D1–D11). The skeleton uses the package set
and versions of the other rewrite apps' skeletons (edbfi/zondarr#306) and locks what it resolves;
after that, `package.json` and `bun.lock` are the source.

| Part | Package |
|---|---|
| Runtime and package manager | Bun (`packageManager: "bun@1.4.3"`) |
| Language | `typescript` (6.x) |
| UI framework | `svelte` / `@sveltejs/kit` |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` |
| Adapter | `@sveltejs/adapter-bun` |
| Styling | `@pandacss/dev`, `@pandacss/vite` (its Vite plugin), `@pandacss/preset-base` |
| Primitives | `@ark-ui/svelte` |
| Type check | `svelte-check` |
| Unit tests | `vitest` (`node` environment); `happy-dom` joins with the first component test |
| e2e | `@playwright/test` (Chromium) |
| Lint and format | `@biomejs/biome` (already on main) |

Setup facts already proven for this stack:
- SvelteKit 3 is configured through the Vite plugin, and its library alias is `#lib` (a
  `package.json` `imports` entry), not `$lib`.
- `svelte-kit sync` runs before Panda's codegen.
- Package subpath imports need explicit file targets.
- Hook types come from `@sveltejs/kit/hooks`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server |
| `bun run --bun build` | production build through adapter-bun into `build/` |
| `bun run --bun preview` | runs the built server (`bun ./build`) |
| `bun run --bun check` | `svelte-kit sync`, then `svelte-check` with zero errors and warnings |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e smoke against the built server |
| `bun run --bun lint` | `biome check` |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The skeleton creates only folders that hold a real file, laid out by
[Code structure](../AGENTS.md#code-structure). AGENTS.md gains the tree as its Structure section
when this work stream closes.

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports. File names and layout follow [Code structure](../AGENTS.md#code-structure).

```ts
import { healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => healthResponse();
```

## Design tokens

- `panda.config.ts` takes every value in [`docs/design/tokens.json`](design/tokens.json): colours,
  type styles, spacing, radii, layout sizes and motion durations, under the names DESIGN.md uses.
- Colours are semantic tokens behind a colour-mode condition, dark by default; light values can be
  added later without touching components.
- Once the Panda config holds them, `docs/design/tokens.json` and `tokens.css` are deleted, and the
  links to them point at `panda.config.ts`.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components. Its
  heading uses the `h1` style (Public Sans).

## Testing strategy

- **Unit (Vitest, `node` environment):** one test, for the `/healthz` handler: status 200, body
  `ok`, `cache-control: no-store`. Component tests use happy-dom when components exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** one smoke test against the built adapter-bun server.
  It checks that `/` returns 200, shows the placeholder heading, hydrates, applies the Panda
  background token and logs no console errors, and that `/healthz` returns `ok`.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds and runs the smoke test.

## CI and repo tooling

zimuarr is already a Bun web repo with Biome, `biome-migrate`, `check-peers`, the Bun Dependabot
block and the `checks` and `audit` jobs. This work adds what an application needs:
- `.pre-commit-config.yaml` gains the template's `tests` hook and a `check` hook
  (`bun run --bun check`).
- `.github/workflows/ci.yml` gains the template's `smoke` job (with the Playwright browser install)
  behind `ci-ok`, with the failing `node`/`npm`/`npx` shims on `PATH`.

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
6. AGENTS.md has its structure section, and `tasks/` is deleted when the work stream closes.

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
   a CSP belong to the first module that serves real pages (sign-in and first-run setup), not the
   skeleton.
4. **No logo yet.** zimuarr has no logo or icon file, so the skeleton has no `static/` folder and no
   favicon; the visible name is the text "Zimuarr". A logo joins when the owner provides one.
5. **Health.** `/healthz` always answers `ok`. The module that adds the database replaces it with
   the legacy spec's health endpoint (Logging, health, diagnostics): instances, providers, workers,
   last observation times and breaker states.
