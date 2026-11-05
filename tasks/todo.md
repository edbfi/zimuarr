# Todo: `secrets`

## Slice 0: the plan

- [ ] Commit `tasks/plan.md` and `tasks/todo.md` before any code.

## Slice 1: the code

- [ ] Copy the 13 files from obzorarr `b9b4737` with the renames; the copy proof shows them
      identical.
- [ ] `src/env.ts`: add the two key variables (exception 1).
- [ ] `tests/contract/contract.test.ts`: a generated key per run (exception 2).
- [ ] `check`, `test`, `lint`, prek pass.

## Slice 2: closing the stream

- [ ] README "Master key".
- [ ] AGENTS.md Status, Commands, Structure.
- [ ] docs/SPEC.md: status, row 2, Where modules live, setup fact, Commands, Testing strategy,
      Boundaries.
- [ ] docs/SPEC-secrets.md cut.
- [ ] Delete `tasks/`.

## Before the push

- [ ] Keyless `build`, then `smoke`.
- [ ] `contract:up`, `contract`, `contract:down`.
- [ ] Manual start with no key exits 1 before listening.

## The PR body

- [ ] Copy proof, the two exceptions as diffs, the preservation gate, the sibling apps, the
      port-back, the council review.
