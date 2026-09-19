# Repository CI

This repository currently contains specifications or scaffold content, with no
application package, runtime, or test suite. Every PR and default-branch push now
runs actual repository checks: JSON/TOML/YAML validity, merge and case conflicts,
private-key detection, and gitleaks. Existing content and vendored specifications
are checked read-only. No application stack or placeholder test command is added.

Run `SKIP=no-commit-to-branch prek run --all-files` locally with prek 0.5.3.
`prek install` enables local hooks; `prek install --hook-type commit-msg` enables
Conventional Commit validation. The branch hook protects local default-branch
commits and is deliberately skipped in CI.

The shared `ci / required` gate rejects missing, failed, cancelled, or unexpectedly
skipped prerequisites. Workflow permissions are read-only and version tags are
explicit. Renovate inherits the versioned shared policy and tracks hook revisions
and the annotated prek version.

Add stack-specific formatting, linting, type checks, real tests, builds, and smoke
checks when the application is implemented. Current content checks establish a
development baseline; they provide no evidence about an unimplemented application.
Shared actions, workflows and presets use immutable `v3.0.1` references.
Renovate is the sole ongoing dependency merge owner. Direct automerge remains
explicitly disabled, including matching package rules, until the hosted rollout
proves native Renovate operation behind complete required CI. The legacy Actions
merger and its comment commands are retired.

The separate PR policy workflow verifies Conventional Commit titles, genuine
matching author sign-offs, Renovate provenance, holds, outstanding review requests
and unresolved changes requests. Require its actual emitted policy context alongside
all existing application/content checks, pinned to GitHub Actions, with strict
up-to-date branch protection. Preserve stronger review requirements. Explicit CI
dispatches do not substitute for a missing metadata policy result. Review exact
head/base, full diffs and all required results before a bootstrap merge, then
verify resulting default-branch CI. Repository-specific updater ownership and
manual publication or delivery controls remain unchanged.
