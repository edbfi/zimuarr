# Plan: `secrets` (module 2), ported from obzorarr

Spec: [docs/SPEC-secrets.md](../docs/SPEC-secrets.md), approved by the owner (2026-10-30) and kept in
step with obzorarr by #60 (`aacdf6e`). The reference is obzorarr's built module at `b9b4737`
(edbfi/obzorarr#283, the last of #276, #278, #280–#283); comradarr#189, otpravkarr#202 and
zondarr#330 ported it as pure renames. obzorarr#284's note on the image's first start is already in
`docs/SPEC.md` ("Left out on purpose").

Only the spec's allowed differences change: the `ZIMUARR_` prefix, `zimuarr` in the associated data,
and the stored-secret list (docs only). One thing is zimuarr's alone: the `contract-spike` harness
starts the built server, so it needs a generated key (the spec's "Startup").

## Slice 0: this plan (`docs(tasks): plan the secrets work stream`)

`tasks/plan.md` and `tasks/todo.md`, committed before any code; Slice 2 deletes them.

## Slice 1: the code (`feat(secrets): port obzorarr's secrets code and tests`)

**Pure renames** of `b9b4737` (`OBZORARR`→`ZIMUARR`, `Obzorarr`→`Zimuarr`, `obzorarr`→`zimuarr`),
13 files: `playwright.config.ts` (zimuarr's is byte-identical to obzorarr's `bae6e8b`),
`src/hooks.server.ts`, `src/lib/server/config/secret-key{,.test}.ts`,
`src/lib/server/security/secrets/{key-text,keyring,secret,cipher}{,.test}.ts`,
`tests/e2e/secret-key.test.ts`. `cipher.test.ts`'s other-app case binds `comradarr`, still another
app here.

**Declared exceptions:**
1. `src/env.ts` already declares `contract-spike`'s three variables. obzorarr's two key entries join
   them, word for word, in an unannotated object checked with
   `satisfies Record<SecretKeyVariable, EnvVarConfig<string | undefined>>` and spread into
   `defineEnvVars` (a `satisfies` on the whole literal would reject the spike's keys). The existing
   comment is scoped to the spike's variables; obzorarr's comment, word for word, covers the key's.
2. `tests/contract/contract.test.ts`: one key generated per contract run, as `playwright.config.ts`
   generates it, and passed to `Zimuarr.start`'s from-scratch environment as `ZIMUARR_SECRET_KEY`
   only (never `_FILE`). Every restart in a run uses it.

## Slice 2: closing the stream (`docs(secrets): close the secrets work stream`)

obzorarr's #282 and #283 secrets doc edits, as the siblings ported them:
- **README:** obzorarr's "Master key" section, renamed. "Changing the key" gains the spec's one
  zimuarr sentence: each Bazarr instance is issued a new callback key to set in Bazarr.
- **AGENTS.md:** Status, Commands (`dev` and `preview` need a key; `smoke` and `contract` bring
  their own), Structure (`env.ts`, `hooks.server.ts`, `config/` listing both files,
  `security/secrets/` with `security/` off the "later" list, `e2e/secret-key.test.ts`).
- **docs/SPEC.md:** status; `**Built.**` in row 2; "Where modules live"; the `src/env.ts` setup
  fact; Commands (`dev`, `build`, `preview`, `smoke`, and `contract` with its own key); Testing
  strategy (the secrets unit tests, `secret-key.test.ts`, the generated keys, and the closing bullet:
  CI's `smoke` builds with no key); the "Never" boundary scoped to modules not yet built.
- **docs/SPEC-secrets.md:** cut to what code and tests can't say, from zondarr's cut text with
  zimuarr's names. Differences: Status (built, module 2, D17 and D26; 13 files copied from
  `b9b4737` and two declared exceptions; the pre-cut text is `aacdf6e:docs/SPEC-secrets.md`, and
  the pull request of the commit that cut it maps every cut requirement); the Objective's list; the
  test-isolation rule covers the contract harness; the limit line.
- **docs/decisions.md:** unchanged (D26 holds the key-error fix, no rotation and the callback-key
  re-issue; D15 keeps the backup procedure open).
- `tasks/` deleted.

The PR body carries the copy proof, both exceptions as diffs, the preservation gate (the siblings'
rows plus zimuarr's: the contract harness's key, the callback-key re-issue and rotation (D26,
capability row 9), and the `contract` criterion (SPEC.md Testing strategy and CI, the harness)), the
sibling apps, and one port-back: obzorarr's `SPEC-secrets.md` Status still says each sibling keeps
its full copy until it builds `secrets`, which no sibling does any more.

## Checks

Each slice: `check`, `test`, `lint`, `prek run --all-files --hook-stage manual`. Before the push: a
keyless `build`, `smoke` with no `.env` and no exported key, `contract:up`, `contract`,
`contract:down`, and `bun --no-env-file ./build` with no key (exit 1, no "Listening", one
`KeyringError` line). CI: `checks`, `smoke`, `contract`, `ci-ok`.

## Out of scope

Anything that stores a secret, a database, rotation, the image's first start, TypeScript 7 (#52),
any change to the reference's code beyond the renames.
