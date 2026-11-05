# Tasks: `contract-spike`

Plan: [plan.md](plan.md). Each task: test first, then code; prek and unit tests before each commit.

- [x] 1. `bazarr-lines.ts`: Bazarr's line normalisation and the fingerprint, one unit test per pysubs2
  rule. Files: `services/translation/bazarr-lines.ts` + test.
- [x] 2. `callback-request.ts`: D20 shape validation. + test.
- [x] 3. `src/env.ts`, `config/contract-spike.ts` and `stand-in-translator.ts` (directives,
  cancellation); `test` script → `--project unit`. + tests.
- [x] 4. `held-response.ts`: heartbeat, answers, no write after cancel, headers incl. `bare-headers`.
  + test.
- [x] 5. `callback-work.ts` and the route: checks in order, identity, join, keep, deadline, shutdown,
  event lines. + test.
- [x] Checkpoint A: unit tests, `check`, `lint`, `build`, `smoke`, prek green; a manual POST to
  `bun ./build` holds past 10 s and answers (C6 premise on the build; stop rule).
- [ ] 6. Compose stack and pins: `compose.yaml`, Caddyfile, nginx template; digests resolved;
  services start on aarch64.
- [ ] 7. `setup.ts`: provisioning, keys, run state, version check, allocation table; `contract:up`
  and `contract:down` work end to end.
- [ ] 8. Fixtures and their derived variants.
- [ ] 9. `fault-proxy.ts` (HTTP framing, keyed cues) and `bazarr.ts` (job poller).
- [ ] 10. `contract.test.ts` phase 1: C1–C4, C7–C10, C12, then C6, then C5.
- [ ] 11. Phase 2: C8 wrong key, C6 heartbeat-off control, C11.
- [ ] Checkpoint B: `contract:full` passes locally (aarch64); C12 body-limit decision; findings
  recorded for the PR body; D20/D23/D25 corrections made if any.
- [ ] 12. `select.ts` + unit test; `ci.yml` `contract` job; `dependabot.yml` entry.
- [ ] 13. Docs: `docs/SPEC.md` CI section and Commands, AGENTS.md Structure and Commands.
- [ ] 14. Cleanup procedure 2 in its own commit (delete `tasks/`, reduce the spike spec, close the
  open decision).
- [ ] 15. PR: file, babysit (the PR's own `contract` job runs every case), merge, clean up.
