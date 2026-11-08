# Implementation plan: `i18n`

## Overview

Build module 3 of the capability map as [docs/SPEC-i18n.md](../docs/SPEC-i18n.md) specifies, ported
from obzorarr: the messages Paraglide JS compiles and the message check, choosing each request's
language, the language switcher, the formatters and the subtitle-language names, with D19's
validations. Three tasks, one PR each, each test first. The tasks are in [todo.md](todo.md).

obzorarr built the same module in five PRs (#297 to #301). Here they fold into three: its
toolchain PR and its message check, its two language PRs (choosing the language, then the
switcher), and its formatting PR with this app's language names and the close of the work stream.

## Architecture decisions

- **The riskiest work comes early.** Task 1 wires Paraglide into the build beside the `unit` and
  `contract` Vitest projects and runs the Weblate round trip before any product text exists, so a
  surprise in the toolchain or the file format changes nothing that was written in it. Task 2 then
  runs the middleware through the built adapter-bun server, where Paraglide issue
  [#725](https://github.com/opral/paraglide-js/issues/725) would show, runs the concurrency check,
  and puts the held Bazarr callback behind the language handle under the contract job.
- **The message check comes with the messages.** Task 1 writes it test first: once the toolchain
  compiles, `checkMessages` is stubbed to return `[]` and every broken in-memory file fails, as
  obzorarr's #301 showed; then the check makes them pass. Every later message is checked from the
  start.
- **Every PR leaves `main` working.** Task 1 compiles the placeholder's messages, but the page keeps
  its own text until task 2 adds the server's language handle and the browser hook. A hydrated
  page that called the messages without them would let the browser runtime choose a language by
  itself and write the cookie the viewer never asked for (SPEC-i18n.md, "In the browser").
- **The server and the browser change together,** and the switcher with them. Task 2 adds both
  hooks, because each half alone is wrong: the server's choice means nothing if the browser chooses
  again on hydration. The switcher joins in the same PR, so the e2e test covers choosing and
  switching against one build.
- **Each validation's evidence goes in the body of the PR that runs it:** the pinned versions with
  no Node on `PATH` and the Weblate round trip in task 1's, the concurrency check and the contract
  job in task 2's, and the full list in task 3's, which closes D19. zimuarr's Vite, Biome, Vitest
  and Panda are newer than obzorarr's, so obzorarr's evidence is run again, not cited. The temporary
  messages, route and scripts are never committed (SPEC-i18n.md, "Validation").
- **Facts change in the task that changes them.** Each task updates SPEC.md's tech stack, setup
  facts, Commands and testing sections, and AGENTS.md's structure, as its files land. Task 3 does
  the rest of the spec's "Docs this module changes when built" list and the end-of-work-stream
  cleanup.

## Task list

### Phase 1: the toolchain and the message check

- [ ] Task 1: Paraglide compiles the messages, and the message check guards them

### Phase 2: each page in the viewer's language

- [ ] Task 2: each request gets the viewer's language, the browser keeps it, the switcher
  changes it

### Checkpoint: after task 2

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke`, `contract`
  and `ci-ok` pass.
- [ ] The built server serves `/` in Danish to a Danish browser and in English otherwise, the
  switcher changes it, and `/healthz` and the callback's answers are unchanged.

### Phase 3: the tools later modules write through

- [ ] Task 3: formatting, subtitle-language names, and closing the work stream

### Checkpoint: complete

- [ ] Every success criterion in SPEC-i18n.md is met.
- [ ] The end-of-work-stream cleanup (AGENTS.md, "Cleanup procedures") is done in task 3.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The middleware returns nothing in the adapter-bun build (#725) | High | Task 2's e2e tests run against the built server |
| The language handle changes the held callback or its answers | High | Task 2 runs CI's `contract` job (every case but C5); the weekly run adds C5 |
| The CLI and the Vite plugin write different layouts into one folder | Medium | `outputStructure: "message-modules"` in the shared config; task 1 runs `check` beside `dev` |
| The Paraglide plugin breaks the `contract` Vitest project or the contract scripts' build | Medium | Task 1 adds the plugin once, and both projects inherit it; CI's `contract` job runs on task 1's PR too |
| Weblate writes the files in a shape Biome or the plugin refuses | Medium | Task 1's round trip, before any real message is written |
| Concurrent requests mix languages under Bun's AsyncLocalStorage | High | Task 2's 200-request check against the built server |
| Generated output trips Biome, Panda or the docs-set hook | Low | The two `.gitignore` lines and Panda's `exclude` land in task 1; prek runs with the output present |
| The agents' Danish reads badly | Low | The owner may spot-check it; Weblate corrects it later (SPEC-i18n.md, "Who writes them") |

## Open questions

None. The choices obzorarr's spec left to each port were decided by the council while the owner was
away, and the spec PR's body lists them for the owner's review.
