# Implementation plan: zimuarr ground floor (skeleton)

**Status:** approved with [docs/SPEC.md](../docs/SPEC.md) (2026-10-22).
The tasks, with acceptance criteria and checks, are in [todo.md](todo.md).

## Overview

Build the skeleton the spec describes: a SvelteKit 3 app on Bun with adapter-bun, Panda tokens from
the design seed, Ark UI, a placeholder `/` page and `/healthz`, one unit test and one e2e smoke, and
the Bun web prek and CI parts an application needs. No database, auth or features. Each task leaves
the app working, and the stream goes through the house review loop (AGENTS.md). It follows the
zondarr skeleton (edbfi/zondarr#306) file for file wherever zimuarr's spec allows.

## Architecture decisions

- **Build the app before the tooling around it.** The `tests` and `check` hooks and the `smoke` job
  need `check`, `test`, `build` and `smoke` to exist, so they come last and switch on green.
- **Tests come with the code they cover** (TDD): `/healthz` lands with its unit test, and the smoke
  test lands once there's something to smoke.
- **Tokens move once.** Panda takes every value from `docs/design/tokens.json`; the seed files are
  deleted in a separate task that also repoints the links, so the move is easy to review.
- **Biome is already on main**, so the app code is formatted as each task lands; there's no separate
  Biome task.
- **Reuse the existing weekly CI minute** (`7 5 * * 0`), which is already unique to this repo.

## Dependency graph

```text
T1 app shell on Bun ──┬── T2 /healthz + unit test
                      ├── T3 Panda tokens ── T4 drop seed token files
                      ├── T5 Ark UI
                      └── T6 e2e smoke (needs T2, T3)
T7 prek tests and check hooks (needs T2) ── T8 CI smoke job (needs T6)
T9 close the work stream (needs everything)
```

## Phases

1. **App:** T1–T2, then checkpoint A.
2. **Design system and smoke:** T3–T6, then checkpoint B.
3. **Tooling and CI:** T7–T8, then checkpoint C.
4. **Close:** T9 (end-of-stream cleanup).

T2, T3 and T5 can run in parallel after T1. Everything else is sequential.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Panda codegen, `svelte-kit sync` and the Vite plugin order differs under SvelteKit 3 and Vite 8 | High | `prepare` runs sync before codegen, as in the other skeletons; T3 checks a clean clone |
| Playwright or Vitest calls Node somewhere | High | run every check with failing `node`/`npm`/`npx` shims on `PATH`, as CI does |
| Hydration isn't proven by server-rendered HTML alone | Medium | the smoke test waits for a client-side signal, not only the HTML |
| `check-peers` fails on a required peer | Medium | it's already on; fix any peer before committing |
| The adapter-bun output or preview command differs from `bun ./build` | Low | T1 records the working command in the `preview` script |
