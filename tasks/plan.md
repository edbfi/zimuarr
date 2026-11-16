# Implementation plan: `setup`

## Overview

Build module 4 of the capability map as [docs/SPEC-setup.md](../docs/SPEC-setup.md) specifies:
startup checks, the database and its migrations with a tested backup, logging with redaction,
shutdown, the health endpoint, the security headers and CSP, the cross-origin check, and first run,
which ends at the claim. Nine tasks, one PR each, each test first, then a docs PR that ends the
work stream. The tasks are in [todo.md](todo.md).

`setup` is ported from obzorarr (Shared groundwork): each task starts from obzorarr's code and tests
at `b59b909` for the same part, renamed for zimuarr, and adds only what SPEC-setup.md's "What
differs" names. obzorarr's own split (its #324) is the starting point; zimuarr adds the health
endpoint as its own task.

## Architecture decisions

- **The riskiest part lands first.** Task 1 is D14's validation: the Drizzle and Turso pair, the
  bundled migrations and Turso's native binding inside `bun --no-install ./build`, as obzorarr
  proved them (its D15). Its fallback, the platform package beside `build/`, is known; task 1
  confirms it here on Linux arm64 and CI's x64.
- **The startup service grows task by task.** Task 1 creates `services/setup/startup.ts` with the
  spec's steps 1–3: the key, the configuration and the database. `ZIMUARR_LOG_DEBUG` (task 2) and
  `ORIGIN` (task 5) join step 2, so they are checked before the database is opened; shutdown
  (task 3) and first run's state and token (tasks 7 and 8, step 4) follow. `hooks.server.ts` only
  calls it, because hooks never touch `db/` (Code structure).
- **Startup failures are thrown first and logged later.** Until task 2 brings the logger, a failed
  step throws from `init` as the key error does now; task 2 adds "logged, then thrown", and
  `handleError`.
- **Bazarr's callback is the first machine route, and every task keeps it working.** The contract
  job runs on every code PR (all cases but C5), so a task that breaks the held callback fails CI.
  Task 1 gives the contract harness its own database under `tests/contract/.state/`; task 2 makes
  it tell log entries from the stand-in's event lines; task 3 keeps held callbacks draining (C11);
  task 5 keeps the headers stage from buffering the held body; task 6 puts the machine-route rule
  before the `ORIGIN` branches; task 9 lets the gate pass the route's path.
- **The request checks come before any form.** SvelteKit's own form check would refuse the claim
  over plain HTTP. Task 6 switches it off and puts the cross-origin check in its place in one PR,
  so `main` never has neither; its e2e posts to `/`, which passes the check and gets SvelteKit's
  405.
- **The gate comes last.** Task 8 makes the claim work at `/setup` with every other page still
  served, so the smoke and language tests keep running unchanged. Task 9 adds the gate with the
  Playwright global setup that claims the instance for those tests.
- **Named operations join with their first caller.** Task 1 writes both tables into the first
  migration; each operation in `db/owner.ts` and `db/settings.ts` lands with the task that first
  calls it (task 4's health row is the first `settings` write), so nothing merges unused.
- **The migrator** is Drizzle's record migrator for Turso
  (`drizzle-orm/tursodatabase/wasm-migrator`), fed by `import.meta.glob("/drizzle/*/migration.sql",
  { query: "?raw" })` with the folder names as keys, as in obzorarr. Task 1 compares both migrators'
  rows, as obzorarr's test does.
- **The handle-built refusal page is unstyled.** Its fixed policy allows no stylesheet or font, so
  the page sets only `color-scheme: dark` and holds no raw values (D10), until `sign-in` builds the
  styled error pages.
- **Signal handlers only in the built server,** one turn after `init` resolves, so adapter-bun's
  come first; `dev` keeps Ctrl+C.
- **The fonts and Lucide join with the claim page** (task 8), their first user, as approved with
  the spec; the root layout imports the fonts, and the tokens name the families.
- **Generated migrations are formatted:** `db:generate` runs `biome format --write drizzle` after
  Drizzle Kit, so the shared `biome.json` stays unchanged.
- **Facts change in the task that changes them.** Each task updates the README, SPEC.md (the status
  line, the tech stack, Commands, the testing section), decisions.md and AGENTS.md's status and
  structure where it changes them, and ticks off its items here. Task 10 reduces the spec and
  deletes `tasks/`.

## Task list

### Phase 1: the foundations

- [x] Task 1: the database (D14) and the backup procedure
- [ ] Task 2: logging with redaction, and `handleError`
- [ ] Task 3: shutdown
- [ ] Task 4: the health endpoint

### Checkpoint: after task 4

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke`, `contract`
  and `ci-ok` pass.
- [ ] The built server migrates a new database, logs JSON lines, refuses a bad configuration with
  one line, exits 0 on `SIGTERM` and `SIGHUP`, and `/healthz` reads and writes the database.

### Phase 2: the request checks

- [ ] Task 5: `ORIGIN`, the security headers and the CSP
- [ ] Task 6: the cross-origin check

### Checkpoint: after task 6

- [ ] Every page and `/healthz` carry the headers; pages carry the nonce CSP with no violation.
- [ ] A cross-site POST gets the "Access denied" page, in the viewer's language; Bazarr's callback
  still passes, with `ORIGIN` set and unset, and the contract job passes.

### Phase 3: first run

- [ ] Task 7: the bootstrap token
- [ ] Task 8: the claim at `/setup`
- [ ] Task 9: the setup gate

### Checkpoint: complete

- [ ] Every success criterion in SPEC-setup.md is met.

### Phase 4: closing

- [ ] Task 10: close the work stream (cleanup procedure 2)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A newer Turso or Drizzle `rc` behaves differently from obzorarr's validated pair | High | Task 1 runs D14's whole validation on the newest releases (D27), with the rollback test failing on rc.4 |
| Turso's native binding is missing beside `build/`, or Bun quietly downloads it | High | `--no-install` on every built-server start (Playwright, the contract harness, the README); task 1 checks a folder with only `build/` and the platform package |
| A rollback undoes an unrelated write on the shared connection (D5) | High | Task 1's rollback-isolation test, against a file, under Bun |
| The contract harness writes `data/zimuarr.db` into the repo, or reads log lines as callback events | Medium | Task 1 points it at `tests/contract/.state/`; task 2 filters log entries |
| Shutdown closes held callbacks, so a stop fails Bazarr's jobs at once | High | Task 3 closes only event streams (none yet); C11 still sees the 30-second drain |
| The headers stage buffers or breaks the callback's held `200` | High | Task 5's unit test copies an immutable streaming response and reads its chunks as they come; the contract job's hold cases (C6, C9) |
| The cross-origin check refuses the callback when `ORIGIN` is set | High | Task 6's matrix and an e2e case with `ORIGIN` set; the contract job runs without `ORIGIN`, so it can't catch this alone |
| `/healthz` writes on every request, or hangs on a stuck database | Medium | Task 4's unit tests: shared results within the window, none past it, and a 503 within 3 s from a probe that never answers |
| An unexpected error reaches the console unredacted | High | Task 2's `handleError` test with a token in the message and the URL |
| The token or a password reaches a log entry or a response | High | Tasks 7 and 8's e2e search the server's output and every response; task 2's redaction tests |
| Playwright's URL check wins the race against the token line | Medium | Task 9's `wait.stdout` pattern spans the token line through "Listening on" |
| Startup forgets a completed first run after a restart | High | Task 8 loads the step pointer at startup and restarts the built server on a claimed file, and on a restored copy |
| Timer and timing tests flake under load (obzorarr #341) | Medium | Fake clocks for the token tests, and obzorarr's growth-ratio check for redaction's linear time, from the start |
| No `node` sneaks into the validation | Low | Task 1 runs the gates with failing `node`, `npm` and `npx` shims on `PATH`, as CI does |

## Sibling apps

Each task's PR body names comradarr, zondarr and otpravkarr where zimuarr's change would help them:
the machine-route order in `cross-origin.ts` (comradarr, with its API keys) and `handleError`
(every app; the obzorarr `sign-in` thread is adding it there).

## Open questions

None. The owner approved the spec on 2026-11-16. This task list is approved by the orchestrating
session after the council's review, as obzorarr's #324 was, and merged once its review loop ends.
