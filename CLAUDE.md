# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Planning stage only. There is no `backend/`, `frontend/`, application manifest, runtime, or
test suite, so no build, test, lint, or single-test command exists yet. Don't invent one or
report one as verified.

The only check that runs today (and what CI's `content` job runs):

```bash
SKIP=no-commit-to-branch prek run --all-files   # prek 0.5.3
```

Once the manifests exist, the gate commands come from the `prek.toml` in the spec's
§ "Engineering Baseline". Use `uv run --project backend …`, not `--directory backend`: prek
passes repo-relative paths, and `--directory` breaks them.

## Source-of-truth precedence

`docs/zimuarr-idea.md` is the normative spec. The `.agents/rules/*.md` stack references are
generic and disagree with it in places. Where they conflict, follow the spec:

| Topic | Spec (follow this) | `.agents/rules` says (don't copy) |
| --- | --- | --- |
| `[tool.basedpyright]` | Exactly `pythonVersion`, `typeCheckingMode = "recommended"`, `include = ["src", "tests", "tools"]`; no `report*` keys, no baseline | Example sets `reportMissingTypeStubs = false`, omits `tools` |
| UnoCSS + shadcn | `presetWind4` + `unocss-preset-animations` + `presetShadcn` | `presetWind3` via `unocss-preset-shadcn/v3` |
| Svelte component tests | Vitest + Testing Library; Bun's test runner only for pure TS modules | `vitest-browser-svelte` Browser Mode instead of Testing Library |
| `.svelte` formatting | Biome only; ESLint/Prettier need an explicitly approved exception | Allows `prettier-plugin-svelte` |

Backend packages go under `backend/src/zimuarr/`, not the rule file's `bookstore` example layout.

## Invariants that are wrong to guess

These come from spec § "Bazarr Wire Contract". Violating one produces subtitle files that are
silently corrupt.

- `POST /api/translate/content` from Bazarr is **synchronous**: hold it open and return the full
  line set in the same response. Chunking and every provider retry must fit a ~28 min session
  deadline (Bazarr's client timeout is 1800 s).
- Correlate callbacks by source-line fingerprint, per-instance API key, and language pair. Don't
  use `arrMediaId`: for episodes it is the Sonarr **series** ID. Fingerprinting must replicate
  pysubs2 `plaintext` stripping, because `GET /api/subtitles/contents` returns raw SRT.
- Bazarr accepts partial output and logs it as success. Return `200` only when every completeness
  invariant passes, and `422` for validation failure or quarantine. Return `429`/`5xx` only when a
  retry could succeed. Never return a reduced line set.
- Idempotent replays (including Bazarr's auto-retry after its timeout) serve the **full cached
  output**, never an empty dedup response.
- Keep predecessor names (Lingarr, Perevoditarr) out of domain terms, models, config, events,
  UI, and service names. Use translation sessions, subtitle translation requests, translation
  attempts, and managed artifacts. Bazarr wire vocabulary stays at the integration boundary.
- No raw provider request templating. Use typed prompt config, typed provider parameters, and
  glossaries. A new provider is a thin adapter plus a capability declaration. The engine branches
  on capability flags, not on provider identity.
- Dry-run and real dispatch share one planner. Don't fork the decision logic.
- The UI must link to its corresponding source (AGPL-3.0 network clause) from the first release.

## Repository gotchas

- `.agents/rules/*.md` is synced from an external agent-rules repo (see the `chore: sync agent
  rules` commits), so local edits get overwritten. Record repo-specific overrides here or in the
  spec.
- CI runs `git diff --exit-code HEAD` after prek, so any hook that rewrites files fails CI. The
  live `prek.toml` leaves out the spec's fixer hooks (`trailing-whitespace`,
  `end-of-file-fixer`, and others). Enabling them rewrites existing content (`.gitignore` has
  trailing whitespace), so fix that content in the same change.
- `no-commit-to-branch --branch main` blocks local commits to `main` once `prek install` has run.
  Work on a branch. The PR policy also requires a Conventional Commit title and a matching
  `Signed-off-by` (`git commit -s`).
- `.gitignore` ends with `#docs/` and `#artifacts/` commented out. Uncommenting `docs/` would stop
  new spec files from being tracked, so keep the spec tracked.
- Renovate owns dependency and action-version bumps (see `renovate.json`, `CI.md`). Don't
  hand-bump the pinned `edbfi/automation@v3.0.1` refs or hook revs as a side effect of other work.

## Reference files

- `docs/zimuarr-idea.md` is the normative spec (~850 lines). Read the relevant section before any
  design or implementation work: § "Bazarr Wire Contract" before touching the integration
  boundary, § "Suggested Delivery Sequence" before starting a new area (Phase 0 contract spike
  comes before reconciliation infrastructure), and § "Strict Typing Policy" before creating
  `backend/pyproject.toml`.
- `.agents/rules/python-3_14-litestar-api.md` covers Litestar, msgspec, SQLAlchemy async,
  Granian, Alembic, and uv/Ruff/basedpyright usage. Read it before writing Python, subject to the
  precedence table above.
- `.agents/rules/svelte5-sveltekit-app.md` covers Svelte 5 runes, SvelteKit 2, Bun, UnoCSS, and
  the shadcn-svelte manual setup (no `shadcn-svelte init`). Read it before writing Svelte or
  TypeScript, subject to the precedence table above.
- `CI.md` covers the CI gate, PR policy, and Renovate merge ownership. Read it before editing
  `.github/workflows/`, `prek.toml`, or `renovate.json`.
