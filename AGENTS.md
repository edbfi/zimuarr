# AGENTS.md

This file provides guidance to AI coding agents when working with code in this
repository.

## Repository state

Pre-implementation. The entire tracked tree is:

```
.agents/rules/{backend,frontend}-dev-pro.md   stack coding references
docs/zimuarr-idea.md                          normative spec (846 lines)
.gitignore  LICENSE (AGPL-3.0)
```

There is no `backend/`, `frontend/`, `prek.toml`, `README.md`, or CI workflow yet, and
therefore **no build, test, or lint command exists.** Do not invent one, and do not report a
command as verified until the manifest defining it exists.

`docs/zimuarr-idea.md` is authoritative for every design and implementation decision. Its
Bazarr findings come from source inspection and are normative, not aspirational.

## What Zimuarr is

A self-hosted subtitle translation control plane for Bazarr. Bazarr owns subtitle and media
file integration; Zimuarr owns translation intent, execution, validation, provenance, budgets,
and safety. It replaces the Lingarr + Perevoditarr three-party topology with two parties.

The model is declarative reconciliation, not queue processing: poll Bazarr into an
observed-state mirror -> resolve policies -> compute desired subtitles -> diff
desired/observed/managed -> classify drift -> explainable plan -> safety admission -> dispatch
-> verify. The dry-run planner and the dispatch planner must share one decision path.

Headline invariant: **a translation is either provably complete or it did not happen.**

## Invariants that are wrong to guess

Detail for each lives in `docs/zimuarr-idea.md` § "Bazarr Wire Contract" — read it before
touching the integration boundary. Violating one produces silently corrupt subtitle files.

- Bazarr's `POST /api/translate/content` callback is **synchronous and blocking**, with a
  1800 s client timeout. Hold the request open and fit chunking plus every provider retry
  inside a ~28 min session deadline. Configure Granian and any proxy for long-lived requests.
- Callback metadata cannot identify a session — for episodes `arrMediaId` is the Sonarr
  **series** ID. Correlate by source-content fingerprint plus per-instance credential and
  language pair, and replicate pysubs2 `plaintext` stripping exactly, or fingerprints will not
  match the raw SRT from `GET /api/subtitles/contents`.
- Bazarr accepts partial responses and logs them as successes, so Zimuarr's validation is the
  only defense, not defense-in-depth. Return `200` only when every completeness invariant
  passes, `422` for validation failure and quarantine, `429`/`5xx` only when a retry could
  genuinely succeed — never a reduced line set.
- Bazarr auto-retries after its own timeout. Idempotency must serve the **full cached completed
  output**, never an empty dedup response; that exact sequence is the predecessor bug and must
  exist as an adversarial regression test.
- Bazarr's translator is a single global setting per instance. Issue a distinct API key per
  Bazarr instance, and verify at onboarding that Bazarr points at Zimuarr.
- Bazarr exposes no event stream and no delta API. The observed-state mirror is polling-based:
  incremental per-series, paginated, and rate-limited.
- No predecessor terminology may enter the product. Keep Lingarr and Perevoditarr out of domain
  terms, database models, UI, configuration, events, and service names; use translation
  sessions, subtitle translation requests, translation attempts, and managed artifacts. Bazarr's
  wire vocabulary stays confined to the outer integration boundary.
- Raw provider request templating is a permanent non-goal. Offer typed prompt configuration,
  typed provider parameters, and glossaries; a new provider is a thin adapter plus a capability
  declaration, and the engine branches on capability flags rather than per-provider forks.

## Toolchain — locked by the spec

| Layer | Use | Never use |
| --- | --- | --- |
| Backend | Python 3.14, uv, Litestar, Granian, msgspec, SQLAlchemy 2 async + asyncpg, PostgreSQL, Alembic, Advanced Alchemy, httpx, structlog, Ruff, basedpyright, pytest, Hypothesis | Pydantic for request/response models, FastAPI `Depends()`, uvicorn/gunicorn, sync HTTP clients, legacy `session.query()`, `create_all` in production |
| Frontend | Bun, Svelte 5 runes, SvelteKit 2, TypeScript, UnoCSS `presetWind4`, shadcn-svelte, Bits UI, Biome, svelte-check | Svelte 4 idioms (`export let`, `$:`, stores, `on:click`), `$app/stores`, npm/pnpm, ESLint, Prettier |
| Frontend tests | Bun's test runner for pure TS modules; Vitest + Testing Library for Svelte component tests | Mixing the two roles |

PostgreSQL is deliberate — durable worker claims, dispatch-session leases, and reconciliation
locks need it — despite the `arr` ecosystem's SQLite norm.

## Bootstrapping order

Follow the spec's sequence rather than improvising:

1. Establish repository quality controls **first**; § "Engineering Baseline" has a copy-ready
   `prek.toml`.
2. Add the backend `[tool.basedpyright]` table exactly as § "Strict Typing Policy" specifies
   (allowlisted keys only), plus `backend/tools/check_basedpyright_config.py`, the gate that
   rejects global suppressions and baselines.
3. Scaffold `backend/` (src layout under `src/zimuarr/`) and `frontend/`, introducing packages
   only where a real boundary exists.
4. Mirror every local hook as an independent CI check; local hooks must not be the only
   enforcement boundary.
5. Do Phase 0 (the Bazarr contract spike) before building reconciliation infrastructure.

Once `prek.toml` exists, the gate commands it defines are
`uv run --project backend ruff format`, `uv run --project backend ruff check --fix`,
`uv run --project backend basedpyright`, `bun run --cwd frontend lint`, and
`bun run --cwd frontend check`. Use `--project backend`, **not** `--directory backend`: prek
passes repo-relative paths and `--directory` breaks them.

## Gotchas

- **`docs/` and `artifacts/` are meant to be gitignored.** Commit `6edf1d7` commented both
  entries out at the bottom of `.gitignore`. `docs/zimuarr-idea.md` is already tracked, so
  re-enabling them needs `git rm --cached` handling.
- The spec's `prek.toml` adds `no-commit-to-branch --branch main` and Conventional Commit
  enforcement. Once installed, work on a branch; the current direct-to-`main` history predates
  the hook.
- **Perevoditarr is a structural quarry, not a dependency.** Port its module decomposition,
  auth/first-admin flow, SSE infrastructure, and basedpyright config gate structurally — but
  audit for three-party assumptions, and strip any Lingarr client, health-check, or
  version-gating logic that assumes a third external system exists.
- AGPL-3.0's network clause applies: the UI must link to corresponding source (footer or About
  item) from the first release onward.

## Reference files

- `docs/zimuarr-idea.md` — the normative spec. Read before any design or implementation work;
  § "Bazarr Wire Contract" before touching the integration boundary, § "Suggested Delivery
  Sequence" before starting a new area of work.
- `.agents/rules/backend-dev-pro.md` — Litestar routing/DI, msgspec modeling, SQLAlchemy async
  pitfalls (`MissingGreenlet`, eager loading), Granian, Alembic, and the uv/Ruff/basedpyright
  workflow. Read before writing Python.
- `.agents/rules/frontend-dev-pro.md` — runes, SvelteKit routing and form actions, Bun tooling,
  and the non-obvious UnoCSS `presetWind4` + shadcn-svelte integration (do **not** run
  `shadcn-svelte init`; create `components.json` and the `cn()` utility manually; keep an empty
  `tailwind.config.js` solely to satisfy the shadcn CLI). Read before writing Svelte or
  TypeScript.
