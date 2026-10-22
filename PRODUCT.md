# Zimuarr product context

<!-- impeccable:product-schema 1 -->

An operator-focused control plane for complete, explainable subtitle translation alongside Bazarr.

## Platform

web

## Users

Operational shell: 224px sidebar Dashboard, Inventory, Policies, Plans, Activity, Quarantine, Budgets, Providers, System, Settings. Global Pause translations at upper right. One owner account runs the instance; 'operator' and 'admin' here are task perspectives, not invented permission roles.

## Primary tasks

- **Operator:** Sign-in and first connection. Proposed route: `/login → /setup/bazarr`.
- **Operator admin:** Operator dashboard. Proposed route: `/dashboard`.
- **Operator:** Subtitle inventory and provenance. Proposed route: `/inventory/northbound-s02e04`.
- **Operator admin:** Policy editor and dry-run plan. Proposed route: `/policies/english-to-swedish`.
- **Operator:** Quarantine comparison and validation. Proposed route: `/quarantine/case-312`.
- **Operator admin:** System administration and pause. Proposed route: `/system`.
- **Operator admin:** Provider and model settings. Proposed route: `/settings/providers`.
- **Operator admin:** Budgets and source-language preferences. Proposed route: `/settings/budgets`.

## Positioning

The claim is a guarantee, not more AI features: a translation is either provably complete or it did not happen. Bazarr's own external-translator hook is fire-and-forget. It does not record why a translation was made, from which source or with which model, and it accepts partial output as success. Zimuarr adds the missing control plane:

- **Declarative, continuous reconciliation.** Operators declare translation policies. Zimuarr keeps comparing that desired state with what Bazarr reports and turns every gap or drift into an explained plan, instead of running one-off jobs.
- **Completeness Zimuarr can prove.** Every source cue must come back exactly once, or the result is rejected and quarantined. A subtitle counts as Verified only after a later Bazarr observation confirms it. Because Bazarr silently accepts partial output, this validation is the only defense.
- **Durable provenance.** Every managed subtitle records its source revision, provider, model, content-addressed prompt, glossary and validation revisions, and its cost and pricing revision, so it can be detected as stale and upgraded later.
- **Two parties, no Bazarr changes.** Zimuarr works with an unmodified Bazarr through its existing external-translator contract and runs translation itself as an internal, observable pipeline. No third system holds work in an opaque queue. It replaces the predecessor translation tools outright; it is not an add-on to them.

## Operating Context

- **Where it runs.** A self-hosted media stack: Sonarr and Radarr manage series and movies, and Bazarr fetches subtitles and writes the files. Zimuarr connects to one or more Bazarr instances from the first release, each with its own key, limits and breakers. It never talks to Sonarr or Radarr directly; it handles their identifiers only because Bazarr's contract uses them. Behaviour across instances (the same media on two instances, shared budgets) is still to be decided in the spec.
- **How it is installed.** A single self-hosted instance: one container, one process and one HTTP port, with an embedded database on a persistent data volume (D4, D5, D16). Sign-in must work on a plain home network as well as behind an encrypting reverse proxy. Bazarr's callback is held open for up to Bazarr's client timeout (currently thirty minutes), so every proxy on that path must allow long requests, and the callback endpoint must be safe to expose when Bazarr runs on a different network.
- **How Bazarr is wired in.** Bazarr's external translator is a single global setting, so the operator points it at Zimuarr with the address and per-instance key Zimuarr issues. Zimuarr then cannot coexist with Bazarr's built-in translators on that instance. Bazarr strips source markup such as italics and positioning before it calls, and Zimuarr cannot preserve it. Observation polls Bazarr because Bazarr has no change feed, and it stays incremental, paginated and rate-limited for large personal libraries (tens of thousands of episodes).
- **Providers the operator brings.** Operators configure their own AI translation providers, credentials and models. Subtitle text goes to those providers; beyond provider and Bazarr calls, no telemetry leaves the instance.
- **The working rhythm.** First run creates the owner account, connects Bazarr, checks its version, issues the callback key, verifies Bazarr points at Zimuarr and runs a self-test round trip. The instance then starts observation-only. The operator adds a provider and model, writes a policy, previews the plan and only then activates it. After that, routine work is reading classified subtitle state on the dashboard, reviewing quarantine cases, watching budgets and pausing when needed. Desktop comes first. Mobile web is a real but secondary use: checking the dashboard, pausing and reviewing quarantine.

## Product requirements

- No separate consumer/member portal. This is an operator tool; sign-in is its public entry.
- New connections and policies observation-only. Preview plan before deliberate activation.
- In progress is telemetry; Verified requires durable confirmation from Bazarr. Partial output never successful.
- Protect unmanaged/manually edited subtitles. Staleness follows source/prompt/glossary/validation revisions, not age.
- Show reserved and settled spend separately. Global pause always available. No raw provider templates.

## Confirmed visual direction

Polar Control. Deep polar blue, seafoam primary actions, ice-blue informational accents. Dense desktop tool with clear subtitle classifications and budget rulers. Clean typography, flat panels, no decorative photography or cinematic gradients. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Evidence on Hand

What exists:

- **Product source:** [docs/product/legacy-spec.md](docs/product/legacy-spec.md), the imported pre-rewrite specification. Two parts were checked against the source code of the external systems rather than guessed, and were accurate when written: the predecessor failure modes and Bazarr's undocumented, unversioned external-translator wire contract. Everything else in it is intended behaviour.
- **Decisions:** [docs/decisions.md](docs/decisions.md), the decided and open technical decisions, including what has been validated so far.
- **Design mockups:** ten generated raster boards in `docs/design/screens/` (`01-entry-and-onboarding.webp` to `10-states-and-components.webp`), plus the selected direction reference `docs/design/references/polar-control.webp`. They guide composition only; their text, numbers, icons and incidental actions are illustrative (see each brief's raster corrections).
- **Seed tokens:** `docs/design/tokens.json` and `docs/design/tokens.css`, a proposed seed that matches DESIGN.md.
- **Surface briefs:** nine proposed route briefs in `.impeccable/surfaces/` (login, Bazarr setup, dashboard, inventory item, policy, quarantine case, system, provider settings, budgets).
- **Demo data:** [tests/fixtures/demo-fixtures.json](tests/fixtures/demo-fixtures.json), a fictional historical snapshot (2025-10-15) with classification counts, budget figures, a quarantine case and the fictional provider "Demo Translate" with fictional prices.
- **License:** `LICENSE` (AGPL-3.0). The web UI links to the corresponding source from the first release.

What does not exist, and must not be invented:

- No application code, running system, deployment, container image or validated behaviour yet.
- No Bazarr contract spike or contract tests yet. Fingerprint correlation, the deadline model and concurrent-episode disambiguation are unproven.
- No users, customers, testimonials, case studies, press, adoption or usage figures, benchmarks or performance measurements.
- No real provider names, models or prices: every provider, price and figure in the fixtures and mockups is fictional.
- No real integration logos or marks for Bazarr, Sonarr, Radarr or any provider in the repo. Do not reproduce generated connector logos.
- No screenshots of a real interface, and no pricing, hosted offering or support terms for Zimuarr itself.
- No backup and restore procedure yet (D15).
- No evidence from the previous version: the `legacy-old/v1` branch is behaviour reference only, and no code is brought over.

## Product Principles

1. **Provably complete or it did not happen.** When completeness can't be proven, the result is rejected, never accepted as good enough. The completeness and Verified rules are in Product requirements.
2. **Nothing spends or overwrites without a deliberate decision.** The preview uses the same planner as dispatch; safety decisions and budget reservations happen before any provider cost; retries never create duplicate work or duplicate cost. Unmanaged and manually edited subtitles are replaced only when a policy or approval explicitly allows it. The observation-only start and global pause are in Product requirements.
3. **Every decision is explained, every artifact is traceable.** Plans give a reason for each action; refusals name the rule, window, cap, budget, breaker or protection behind them; managed subtitles carry full provenance, and staleness follows changed inputs, never age. When in doubt, refuse and explain.
4. **Work with Bazarr, never around it.** Bazarr is not modified and keeps owning media and subtitle files. Its undocumented contract is pinned by tests, gated by version at registration and watched for drift.
5. **The server decides; the interface presents.** Classifications, admission verdicts, status transitions and budget arithmetic come from the backend. The UI shows them and never re-derives them.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

This application is a planned control plane. Operator and admin labels describe tasks of the one owner account; no member portal or further roles are introduced.
