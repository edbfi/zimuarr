# Zimuarr — Product and Design Specification for a Rewrite

> [!NOTE]
> **Legacy product specification**, imported from the pre-rewrite planning documentation. It
> describes the intended behaviour, which the rewrite keeps unless an approved spec or decision
> changes it. Its technology and deployment content is superseded by
> [`docs/decisions.md`](../decisions.md): "Status: planned only, nothing built" (the state of the old
> repository) and, in "Deployment shape", the separate API and worker roles, the multi-process
> deployment and the server-grade relational store (the rewrite runs one process on embedded Turso:
> D4, D5 and D16). The durable claims, leases and no-duplicate-dispatch requirements still apply. The
> visual language this text leaves open is now [DESIGN.md](../../DESIGN.md). Sections are deleted as
> approved `docs/SPEC-<id>.md` files cover them, and the file goes once nothing is left (AGENTS.md,
> cleanup procedures).

## Status: planned only, nothing built

Zimuarr exists today solely as a planning document and an empty repository scaffold. There is no functional application, no runtime, no deployment, no persistence schema, no user interface, and no validated behaviour. Every statement in this document describes **intended** behaviour as recorded in the project handoff, not behaviour that has been observed in a running system. Where the handoff is prescriptive about matters that are really open design questions, this document says so explicitly in the section "Open design questions" and inline where it matters.

Two things in the plan are stronger than mere intent, because they were verified by reading the source of the external systems involved rather than by guessing:

1. The **failure modes of the predecessor systems** (Lingarr and Perevoditarr, both by the same author) were confirmed by source inspection. They are the reason Zimuarr exists.
2. The **wire contract Bazarr exposes for external translators** was verified by source inspection of Bazarr. It is undocumented and unversioned, so these facts can rot with any Bazarr release, but they were accurate at the time of writing.

Nothing else — not the fingerprint-based correlation, not the deadline model, not the concurrent-episode disambiguation — has been proven in practice. The plan itself insists that these be proven in a dedicated contract spike before anything else is built.

---

## Purpose

Zimuarr is a **self-hosted subtitle translation control plane** that works alongside Bazarr. The name joins the Mandarin word for subtitles (zìmù, 字幕) with the familiar "-arr" naming convention of the self-hosted media ecosystem.

### The problem

In a typical self-hosted media stack, Bazarr fetches subtitles for the series and movies managed by Sonarr and Radarr. Bazarr also offers a hook for an *external translator*: when a subtitle in a wanted language is unavailable, Bazarr can hand the text of an existing subtitle to an external service and write back the translated lines. That hook is primitive. It is a fire-and-forget button press: nothing remembers why a translation was made, with which model, from which source, or whether it was actually complete. If the source subtitle is later replaced with a better one, the translation silently goes stale. If a provider returns half a file, Bazarr happily writes a half-translated subtitle and records success.

### What Zimuarr does

Zimuarr makes subtitle translation **declarative, continuous, and provable**:

- Users declare **translation policies** ("every episode matching this policy should have a Swedish subtitle translated from the preferred English source").
- Zimuarr continuously compares that desired state against the subtitles Bazarr actually reports, classifies every gap and every drift, and produces an **explainable plan**.
- When it decides a translation should happen, it performs the translation itself through an AI translation provider, under **budgets, admission control, and completeness invariants**.
- Every subtitle it produces becomes a **managed artifact with full provenance** (source revision, provider, model, prompt revision, glossary revision, validation policy revision, cost and pricing revision), so it can be detected as stale and **upgraded** later when any of those inputs change.

Bazarr remains responsible for media and subtitle file integration (discovery, downloading, writing files to disk, path mapping). Zimuarr is responsible for deciding which translations *should* exist, safely producing them, and keeping them tracked and upgradeable.

### Where it sits

The predecessor topology was three-party: Bazarr ↔ an orchestrator (Perevoditarr) ↔ a translator (Lingarr). Zimuarr collapses this to **two parties: Bazarr and Zimuarr**. There is no third system with its own queue and opaque state. Translation execution is an internal, fully observable pipeline with no blind spot where "the translator has it now."

### What it deliberately does NOT do

- It does **not** modify Bazarr, patch Bazarr, or require a Bazarr fork. It uses Bazarr's existing external-translator contract exactly.
- It does **not** manage media, discover subtitles, or write subtitle files itself. Bazarr does all of that.
- It does **not** depend on, reference, or inherit runtime concepts from Lingarr or Perevoditarr. It is a total replacement, not an add-on. Historical application names must not appear in domain terminology, persistence models, screens, configuration concepts, provider abstractions, internal events, service names, or normal-operation documentation.
- It does **not** offer user-editable raw provider request templates. This is a permanent, documented non-goal (see "Provider capability model").
- It is **not** "more AI features." The headline is a guarantee: **a translation is either provably complete or it did not happen.**

### Licensing fact that shapes the product

Zimuarr is licensed under the AGPL-3.0. Because the network clause applies to a self-hosted web application, the web UI must link to the corresponding source from the very first release (a footer or an About screen is sufficient).

---

## Why Zimuarr exists: the predecessor failure modes and the invariants that answer them

This section is the heart of the product. The rewrite team should treat each failure mode as a mandatory adversarial regression scenario and each answering invariant as non-negotiable.

### Failure mode 1 — Silent partial success

**What happened in the predecessors.** When a translated position was missing from a provider's batch result, Lingarr logged a warning, substituted the *original source-language line* in that position, and proceeded as if the translation had succeeded. On its side, Bazarr replaces only those positions that are present and non-empty in the response, keeps the source text for everything else, and records the operation as a success in its history. Combined, the result is a subtitle file that is part source language and part target language, recorded as complete everywhere.

**Why it is so dangerous.** Bazarr *silently accepts partial translations*. There is no second check downstream. If the translator ever returns fewer lines than it received, Bazarr writes a mixed-language file and considers the job done. The translator's own completeness check is therefore the **only** line of defense, not defense-in-depth.

**Zimuarr's answer.**
- Hard **completeness invariants** are enforced before any translation is returned (see "Validation invariants"). Every source cue must be represented exactly once; nothing missing, nothing duplicated, nothing invented.
- A failed validation must surface to Bazarr as a **non-retryable error**, never as a reduced line set. Returning fewer lines is forbidden under all circumstances.
- "No partial translation is successful" is a top-level product principle.

### Failure mode 2 — Duplicate requests collapsing to empty output

**What happened in the predecessors.** Lingarr deduplicated concurrently active translation requests by returning an *empty result* to the duplicate caller. Through Bazarr's partial-acceptance behaviour, an empty result means "no positions translated," so Bazarr keeps every source line and logs success. Bazarr's own automatic retry on timeout triggers this exact sequence: attempt one times out while the translation is still in progress; attempt two is deduplicated to an empty result; Bazarr writes an entirely untranslated file and records it as a successful translation.

**Zimuarr's answer.**
- **Idempotency returns cached completed output, never an empty deduplication response.** A repeated request for a translation that is already complete receives the full translated line set.
- A repeated request for a translation that is still in progress must not be answered with an empty success. It must either wait for the in-flight result, or be answered with a response Bazarr treats as an error (retryable or not, depending on whether a later retry could succeed).
- The exact predecessor sequence — timeout, retry, dedup-to-empty, success logged — must exist as an adversarial regression test.

### Failure mode 3 — The timeout cost trap

**What happens in Bazarr.** Bazarr's call to the external translator is synchronous and blocking, with a client timeout of thirty minutes, and Bazarr retries on timeout. If a translation takes longer than that, Bazarr gives up and retries while the translator may still be working and paying a provider.

**Zimuarr's answer.**
- Every translation session carries a **deadline derived from Bazarr's timeout** (roughly twenty-eight minutes, i.e. the timeout minus a safety margin). Chunking, provider calls, and provider retries must fit within it, and the safety engine must model this deadline explicitly.
- If Bazarr nevertheless gives up, Zimuarr **keeps computing**, caches the completed result keyed by session and content fingerprint, and serves the cached output instantly on Bazarr's automatic retry. This "abandoned-then-completed" path is a first-class lifecycle state, recorded and visible.
- Retries must never create duplicate work or duplicate cost.

### Failure mode 4 — Blind spots from a three-party topology

**What happened in the predecessors.** Perevoditarr had to reason about two external systems with their own queues and opaque states. Its dispatch, health checks, circuit breakers, and version gating all assumed a third system existed and could be "holding" a job.

**Zimuarr's answer.** Translation execution is internal and fully observable. Any logic inherited structurally from the predecessor must be audited for three-party assumptions, not merely renamed.

### Failure mode 5 — Lost intent and untracked artifacts

**What happened in the predecessors.** Translation was a one-off job. Once done, nothing remembered why it was made or with what. Source upgrades, prompt improvements, and model changes could not be propagated; manual edits could be clobbered.

**Zimuarr's answer.** Desired state is durable; jobs and attempts are temporary. Every managed subtitle has provenance. Unmanaged and manually edited subtitles are protected by default. Plans and decisions are explainable.

### The resulting product principles

These are the product and engineering principles from the handoff, with tooling and codebase-hygiene items removed:

1. Bazarr integration without Bazarr modification.
2. No runtime dependency on the historical translation applications.
3. Desired state is durable; jobs and attempts are temporary.
4. Every managed subtitle has provenance.
5. No partial translation is successful — and because Bazarr silently accepts partial output, Zimuarr's validation is the only defense.
6. Safety decisions happen before dispatch.
7. Retries must not create duplicate work or duplicate cost; idempotent responses always return the full cached output, never an empty result.
8. Live telemetry never replaces durable verification.
9. Unmanaged and manually edited subtitles are protected by default.
10. Plans and decisions must be explainable.
11. The Bazarr contract is verified by tests, version-gated at registration, and monitored for drift.
12. Providers are described by capabilities; the engine adapts by capability flags, not per-provider forks.
13. Raw provider request templating is a permanent non-goal.
14. Secrets must never be committed or logged.
15. The user interface presents backend decisions; it does not independently recreate them.

---

## Product feel and goals

### Native to the "-arr" ecosystem, but solving a different class of problem

Zimuarr should *feel* like a sibling of Sonarr, Radarr, and Bazarr: a single self-hosted web application with a dense, operational dashboard, a left-hand or top-level navigation of a dozen or so areas, settings pages, an activity/history view, and a system/health area. Users of that ecosystem should find it immediately familiar. At the same time, the handoff is clear that Zimuarr solves a *different* problem than its siblings: not "get a file" but "continuously manage translated subtitles as durable, auditable, safe, and upgradeable artifacts." The interface should therefore foreground **state and explanation** rather than queues and buttons.

### Explainability over automation theatre

A central opinion: **every decision must be explainable**. A reconciliation plan is "an explained set of actions." A safety decision is a recorded verdict against named rules. A quarantine case records why output was rejected. A managed artifact shows the full provenance of how it came to exist. When the system refuses to do something, the UI should say which window, cap, budget, breaker, or protection rule refused it. The planner used for dry-run previews must be the same planner used for real dispatch, so what the user previews is what the system will do.

### Safe by default, deliberately activated

New Bazarr connections and new policies begin in **observation-only or dry-run mode**. Nothing translates until a human deliberately activates it. Existing unmanaged subtitles are never overwritten automatically. Manually edited subtitles are never replaced without an explicit policy or approval. Unknown callbacks are rejected. Global and scoped pause controls are always one click away. The intended emotional tone is "this thing will not surprise me or run up my provider bill."

### Durable truth over live telemetry

Live events may refresh the interface or trigger an earlier observation, but they are never treated as proof of success. Durable observations (what Bazarr actually reports) and Zimuarr's own records determine correctness. The UI should make this distinction visible: a "dispatched" or "in progress" indicator is telemetry; a "verified" badge is durable truth.

### Provenance as a first-class, nearly free feature

Prompt revisions, glossary revisions, and validation-policy revisions are **content-addressed** (identified by a hash of their content). This is a deliberate design choice: staleness detection and provenance comparison reduce to "are the hashes equal," and revision tracking costs almost nothing. The UI should be able to show, for any managed artifact, exactly which revisions produced it, and for any policy change, exactly which artifacts it makes stale.

### Visual direction, density and theming

The handoff gives little explicit visual direction beyond "native to the -arr ecosystem." The frontend guidelines in the repository add a few generic expectations that are reasonable to carry forward as product intent: both light and dark appearance must be supported without a flash of the wrong theme on load; interface primitives should be accessible by construction (keyboard operable, correctly labelled); filter, sort, and pagination state should live in the address so views are shareable and survive reloads. The exact visual language is an open design question.

### Speed

Pages should be fast and the interface should feel live. A server-pushed event stream refreshes dashboards, activity, and health without manual reload, with reconnection recovery for events missed while disconnected. Heavy library views must be paginated.

---

## Users, roles and permissions

The handoff defines a single human role and one machine role:

| Actor | How they authenticate | What they can do |
|---|---|---|
| Administrator (first-run setup creates the first one) | Interactive sign-in to the web UI | Everything: connect Bazarr instances, configure providers, write policies, activate, pause, review quarantine, approve replacements, view budgets and diagnostics |
| Machine clients of Zimuarr's own API | API keys issued by Zimuarr | Programmatic access to Zimuarr's versioned API (scope of keys is an open question) |
| Connected Bazarr instances | A distinct static key per instance, presented on each callback | May only call the translation callback; everything else rejected |

**Open questions.** The handoff does not define additional roles (for example a read-only viewer, or a per-policy approver), multi-tenant separation, or whether more than one administrator is expected. A rewrite is free to add a role model; the only hard requirements are that the UI and API require authentication, that a first-run administrator setup exists, and that the Bazarr callback is authenticated per instance.

---

## Domain model

The central modelling decision: **a translation is not a single terminal job.** It is a durable declaration (desired subtitle) that is repeatedly reconciled against observed reality, with temporary attempts and sessions in between and a durable, provenance-bearing artifact at the end.

### Entities

| Entity | Nature | Summary |
|---|---|---|
| Bazarr instance | Durable, configured | A connected Bazarr installation with its own credential, supported-version status, path-mapping context, activation state, and circuit-breaker state. |
| Media item | Mirrored | A series, episode, or movie as reported by Bazarr, with its upstream identifiers (Sonarr series and episode identity, Radarr identity). |
| Observed subtitle | Mirrored, replaceable | A subtitle that Bazarr currently reports for a media item. |
| Translation policy | Durable, user-authored | A declaration of which media should have which target-language subtitles translated from which preferred sources, under which prompt, glossary, provider, model, and validation policy, with an activation mode. |
| Source-language preference | Durable, user-authored | The ordering of acceptable source languages and variants a policy should translate from. |
| Desired subtitle | Durable, computed | A persistent declaration that a translated subtitle should exist for a particular media item, language, and variant, derived from policies. |
| Managed artifact | Durable | A translated subtitle produced or deliberately adopted by Zimuarr, with full provenance. |
| Translation attempt | Temporary record | One execution with a specific combination of inputs; may succeed, fail, be retried, or produce a quarantined candidate. |
| Translation session | Short-lived authorization | Links a reconciliation decision to the callback later received from Bazarr; holds correlation data, budget reservation, deadline, and cached output. |
| Reconciliation plan | Computed, explained | The set of actions produced by comparing desired, observed, and managed state, with the reason for each. |
| Safety decision | Recorded verdict | The outcome of evaluating admission rules for a proposed action. |
| Quarantine case | Durable until resolved | A translation candidate retained for inspection but rejected from normal activation. |
| Provider | Configured | An AI translation provider with credentials, a capability declaration, and breaker and pause state. |
| Model | Configured | A specific model offered by a provider, with provider parameters and a pricing reference. |
| Prompt revision | Content-addressed | An immutable prompt configuration identified by its content hash. |
| Glossary revision | Content-addressed | An immutable glossary identified by its content hash. |
| Validation-policy revision | Content-addressed | An immutable set of validation thresholds identified by its content hash. |
| Pricing revision | Versioned configuration | A snapshot of provider token prices; every settled cost records which revision it used. |
| Domain event / audit record | Append-only | A record of what happened and why, feeding the live event stream and history views. |

### Observed subtitle

An observation may carry: the Bazarr instance, media identity, language, forced flag, hearing-impaired flag, the file path or Bazarr identifier, a content fingerprint, the observation timestamp, and any file metadata Bazarr exposes. **Observed-state data is replaceable and may be rebuilt from Bazarr at any time**; it is a mirror, not a source of truth, and losing it must never lose intent or provenance.

### Desired subtitle

A desired subtitle remains meaningful after a successful translation. Over its life it can be classified as:

| Classification | Meaning |
|---|---|
| Missing | No subtitle in the target language/variant is observed and none is managed. |
| Current | A managed artifact exists, is observed in place, and its provenance matches the policy's current inputs. |
| Stale | A managed artifact exists but its source revision, prompt revision, glossary revision, validation-policy revision, provider, model, or policy has since changed. |
| Manually modified | The observed subtitle's fingerprint no longer matches the managed artifact that was written; someone edited it. |
| Unmanaged | A subtitle exists in the target language that Zimuarr did not produce and has not adopted. Protected by default. |
| Blocked by a safety policy | The desired translation is admissible in principle but currently refused by a window, cap, budget, breaker, or pause. |
| Quarantined | The latest attempt produced output that was retained for inspection but not activated. |
| No longer required | The policy no longer selects this media item, language, or variant; the desired subtitle may be retired. |

Transitions between these classifications are driven by reconciliation cycles, not by user actions directly; user actions (activate, approve, adopt, pause) change inputs, and the next cycle reclassifies.

### Managed artifact

A managed artifact is linked to its desired subtitle, the source subtitle revision it was translated from, the successful translation attempt that produced it, its own content fingerprint, its creation and verification timestamps, and its current drift status. An artifact can also come into being by **adoption**: a user may deliberately take an existing unmanaged subtitle under management (the mechanics of adoption are an open question; see later).

### Translation attempt

An attempt is one execution with a specific combination of: source content revision, source and target languages, provider, model, prompt revision, glossary revision, validation-policy revision, chunking strategy, and provider parameters. Because the revisions are content-addressed, "does the current policy still match this artifact's provenance" reduces to comparing a handful of hashes.

### Translation session

A session is a short-lived authorization that must contain enough to:

- Authenticate and correlate the incoming callback (per-instance credential plus source-content fingerprint plus language pair).
- Confirm the expected source content.
- Reserve a budget before any provider cost is incurred.
- Prevent duplicate execution.
- Enforce a deadline derived from Bazarr's callback timeout.
- Return cached completed output on retries, including Bazarr's automatic retry after its own timeout.
- Record the complete execution lifecycle, including the abandoned-then-completed case.

A plausible session lifecycle (the exact states are an open question): planned → dispatched to Bazarr → awaiting callback → callback matched, executing → either completed (output cached, served) or failed (non-retryable, surfaced) or quarantined; with an orthogonal flag for "caller abandoned before completion" and "cached output served on retry." Sessions should expire if no callback ever arrives.

### Identity and uniqueness rules

- A desired subtitle is unique per (Bazarr instance, media item, target language, forced flag, hearing-impaired flag).
- A Bazarr instance is identified by its credential; each instance must be issued a distinct key, so the caller is identified by credential and never by payload content.
- Prompt, glossary, validation-policy revisions are identified by content hash; identical content is the same revision.
- A translation session is correlated by (instance identity, language pair, source-content fingerprint). Metadata alone cannot disambiguate concurrent episodes of the same series.
- A settled cost always references the pricing revision it was computed against.

---

## Core behaviours and workflows

### The reconciliation cycle

Zimuarr behaves as a declarative reconciliation engine rather than a queue processor. Each cycle:

1. Observes current Bazarr state.
2. Updates the local external-state mirror.
3. Resolves effective translation policies.
4. Calculates desired subtitles.
5. Compares desired, observed, and managed state.
6. Classifies missing subtitles and drift.
7. Produces an explainable plan.
8. Evaluates safety admission for each planned action.
9. Dispatches authorized work.
10. Verifies the resulting subtitle through a later observation.

Cadence is an open question. Observation must be **polling-based** (Bazarr offers no outbound event stream or change cursor), incremental (per series), paginated, and rate-limited so that Zimuarr never becomes a load problem for the Bazarr instance it watches. Live events inside Zimuarr may trigger an earlier observation but never substitute for it.

Correctness must not depend on a single process: where duplicate execution would be unsafe (worker claims, dispatch sessions, reconciliation leases), the claim must be durable, so two instances or two workers cannot both dispatch the same desired subtitle.

### Translation policies and desired-state calculation

A policy expresses intent such as "every episode matching this policy should have a Swedish subtitle translated from the preferred English source." A policy is expected to specify at minimum: a scope selecting media (what the selector vocabulary is — libraries, series, tags, instance — is an open question), one or more target languages and variants, a source-language preference ordering, the provider and model, the prompt revision, the glossary revision, the validation-policy revision, and an activation mode (dry-run/observe-only versus active). Changing any content-addressed input of a policy makes existing artifacts stale rather than silently leaving them behind.

Source selection picks the preferred available source subtitle for each desired target per the preference ordering, and records which source revision (by fingerprint) was chosen. If no acceptable source exists, the desired subtitle is missing-but-unactionable, and the plan should say so.

### Dry-run plans

A dry-run plan shows exactly what the reconciler *would* do and why each action was chosen or refused, including the safety verdict for each item. It uses the same decision logic as real dispatch. Dry-run is the default mode for new connections and new policies; a plan preview must be available at any time, including for active policies.

### Dispatch

For each authorized action, Zimuarr:

1. Fetches the source subtitle content from Bazarr and computes the expected **content fingerprint** of its lines, normalized the same way Bazarr will normalize them before calling back (see the normalization subtlety under integrations).
2. Reserves budget and concurrency, opens a translation session with a deadline, and records the decision.
3. Asks Bazarr to translate that subtitle to the target language, using the path exactly as Bazarr sees it (path mappings matter) and the correct upstream identifier (the episode identity for episodes, the movie identity for movies), with forced and hearing-impaired flags as needed.
4. Treats Bazarr's acceptance as confirming **nothing** about the outcome. Bazarr only enqueued a job; correctness is established by the later callback and the later observation.

### The callback and the translation execution

When Bazarr processes the queued job, it calls Zimuarr back with a synchronous, blocking request containing the media's upstream identifier, a title, the source and target language, the media type, and the subtitle's lines as position-and-text pairs. Zimuarr must:

1. Authenticate the caller by its per-instance key; reject unknown callers by default.
2. Fingerprint the incoming lines and match the callback to an open session by instance identity, language pair, and fingerprint. Unmatched callbacks are rejected by default (whether an administrator may opt in to accepting unsolicited callbacks is an open question).
3. If the session already has **cached completed output**, return it in full immediately.
4. If the session is already executing (a duplicate or a retry after a timeout), never return an empty result; either hold until completion within the deadline or answer with an error Bazarr will treat as retryable.
5. Otherwise, hold the request open while internal workers chunk the lines, call the provider, parse structured output, and assemble the result, all within the session deadline.
6. Run the full set of validation invariants.
7. Return the complete translated line set only if every invariant passes; cache it; settle cost; record the attempt and create the managed artifact candidate.
8. On validation failure, quarantine the candidate and return a non-retryable error. On provider or infrastructure failure where a retry might genuinely succeed, return a retryable error.
9. Later, confirm via observation that Bazarr actually wrote the subtitle, and only then mark the artifact verified.

Because the request is held open for the duration, the whole deployment path (the application's own server and any reverse proxy) must tolerate requests lasting up to the Bazarr timeout.

### Validation invariants

Before any translation is returned, all of the following must hold:

- Every source cue is represented exactly once.
- No positions are missing.
- No positions are duplicated.
- No unknown positions are introduced.
- Output ordering remains valid.
- Non-empty source lines do not silently become empty.
- Markup and control sequences satisfy the configured policy. (This governs what the *model introduces*; Bazarr itself destroys source markup before calling, see integrations.)
- Translation expansion remains within reasonable, configurable limits.
- Repetition checks pass (the model did not loop or copy one line across many).
- Untranslated-text checks pass (the output is not still in the source language).
- Provider output satisfies the expected structured schema.
- Every chunk succeeded before the complete subtitle is accepted.

Thresholds for expansion, repetition, and untranslated-text checks live in the content-addressed validation-policy revision, so tightening them later makes earlier artifacts visibly stale rather than silently inconsistent.

### Idempotency and caching

- Provider retries within a session must not re-bill work already completed; chunk results are retained within the session.
- Repeated Bazarr callbacks for the same session return the full cached output.
- A completed translation is reused rather than translated and billed again.
- The idempotent response is always the full output. An empty response is never a valid "already handled" answer.

### Quarantine

Any invalid or suspicious output is retained as a quarantine case rather than discarded, together with the reasons it failed. An administrator can inspect the candidate, see the failing checks, compare with the source, and choose to discard it, re-attempt with different inputs, or (an open question) manually approve activation. Quarantined output is never returned to Bazarr.

### Protection of unmanaged and manually edited subtitles

- A subtitle in the target language that Zimuarr did not produce is **unmanaged**. It is never overwritten automatically. A user may adopt it under management or write a policy that explicitly permits replacement.
- A managed artifact whose observed fingerprint no longer matches what Zimuarr wrote is **manually modified**. It is never replaced without an explicit policy setting or a per-item approval.
- These protections are evaluated as admission rules and appear in plans as refusals with reasons.

### Safety and admission control

Safety decisions happen **before** dispatch, and are recorded. The admission engine must support, at minimum:

| Category | Controls |
|---|---|
| Timing | Dispatch windows (only dispatch during configured hours/days) |
| Concurrency | Global limit; per-Bazarr-instance limit; per-provider limit |
| Volume | Hourly and daily caps on number of translations; character limits; subtitle-line limits |
| Money | Per-attempt budget ceiling; daily budget ceiling; monthly budget ceiling; cost **reservation** before dispatch and **settlement** after provider completion |
| Time | Per-session deadline derived from the Bazarr callback timeout |
| Breakers | Provider circuit breaker; Bazarr circuit breaker; structured-output failure breaker (trips when a provider repeatedly fails to produce schema-valid output) |
| Retries | Bounded retries with backoff, within the session deadline |
| Pause | Global pause; per-provider pause; per-policy pause |
| Content | Quarantine for invalid or suspicious output; manual-edit protection; unmanaged-subtitle protection |
| Preview | Dry-run plan previews using identical logic |

Budgets reserve an estimated cost at admission (using the model's pricing and the request size), and settle the actual cost when the provider reports usage (or an estimate, where the provider's capability model says usage is only estimable). Reservations must be released if the session fails or expires, so stuck sessions cannot permanently consume budget.

### Pricing provenance

Provider token prices change over time. Pricing tables are **versioned configuration**, and every settled cost records which pricing revision it was computed against. Historical cost reports must remain explainable after prices change; a report must never retroactively re-price old work.

### Provider capability model

Zimuarr must support many AI providers without forking the translation engine per provider. Each provider is described by an explicit **capability declaration**, including at least:

- Structured-output support: strict schema, structured mode, or free text only.
- Maximum request size or context budget.
- Token accounting granularity: exact usage reporting versus estimation.
- Streaming support.
- Rate-limit characteristics.
- A pricing model reference.

The validation strategy, chunking strategy, and output-parsing path are **selected by capability flags**, not implemented per provider. Adding a provider is a thin adapter plus a capability declaration — a configuration-level change. Structured responses are used wherever the capability model says they are supported; the internal contract is richer than the minimal line-set Bazarr needs.

**Permanent non-goal: raw request templating.** Predecessor systems allowed users to customize the raw request body sent to a provider. Zimuarr never will. A user-templated request can break the schema contract the completeness guarantees depend on. Zimuarr offers typed prompt configuration, typed provider parameters, and glossaries only.

### Upgrades and lifecycle (designed, lowest priority)

Once closed-loop translation and safety exist, the lifecycle features are:

- **Source-change detection**: if Bazarr replaces the source subtitle (fingerprint changes), dependent artifacts become stale.
- **Prompt, glossary, validation-policy revisions**: content-addressed; changing one marks dependent artifacts stale.
- **Provider and model revisions**: switching a policy's provider or model marks artifacts stale.
- **Managed upgrades**: stale artifacts are re-translated under admission control, with the old artifact's provenance retained.
- **Manual-edit detection**: fingerprint drift of a managed artifact flips it to manually modified and protects it.
- **Adoption** of existing subtitles under management.
- **Rollback and replacement workflows**: restore a previous artifact or replace a protected one with explicit approval. The mechanics (does Zimuarr keep artifact content itself, or re-translate, given that Bazarr owns the files?) are an open question.

---

## External integrations

### Bazarr — the highest-risk dependency

Bazarr's external-translator hook is an **undocumented, unversioned internal contract** that can change in any release with no notice. The plan treats it as follows:

- Facts about the contract are encoded as **contract tests** exercised against a pinned Bazarr version, so drift is detected before it reaches users' libraries.
- A **supported Bazarr version range** is enforced when an instance is registered and surfaced in diagnostics.
- The **first thing built** is a contract spike proving the integration end to end against a real Bazarr before any reconciliation infrastructure exists.

#### Direction 1: Zimuarr asks Bazarr to translate (dispatch)

- Zimuarr calls Bazarr's subtitle action API asking for a translation, supplying the subtitle path as Bazarr sees it, the target language as a two-letter code, the media type, the upstream identifier (Sonarr **episode** identity for episodes, Radarr identity for movies), and optional forced/hearing-impaired flags.
- Bazarr enqueues the job and returns immediately. The response confirms nothing about the outcome.
- Bazarr's external translator is a **single global setting** (translator type plus the external service's address and token). Only one external translator can be configured. Consequences: onboarding must verify Bazarr is pointed at Zimuarr; diagnostics should include a self-test translation round trip; and Zimuarr cannot coexist with Bazarr's built-in translation options on the same instance. This limitation must be documented for users.

#### Direction 2: Bazarr calls Zimuarr back (callback)

- Bazarr sends a synchronous, blocking request containing: the upstream media identifier, a title, source language, target language, media type (episode or movie), and the subtitle lines as position-and-text pairs. It authenticates with one static token per Bazarr instance, sent as a request header.
- **Thirty-minute client timeout**, synchronous. There is no asynchronous job handoff; the complete translated payload must be returned in the same response. The session is a long-lived held request, not a token exchange. Everything in front of the callback handler must allow long-lived requests.
- **Correlation is weak.** The payload carries no session token, no file path, and for episodes the identifier is the Sonarr **series** identity, not the episode. Two episodes of the same series translating to the same language concurrently are indistinguishable by metadata. The only robust correlator is a **content fingerprint of the source lines**, matched against open sessions alongside instance identity and language pair.
- **Normalization subtlety.** The callback carries *plaintext* lines with markup stripped by Bazarr's subtitle library, while the content Zimuarr fetched at dispatch time is raw cue text. Zimuarr's normalization must replicate Bazarr's stripping exactly or fingerprints will not match. This must be proven in the contract spike before the session model is finalized.
- **Partial acceptance.** Bazarr replaces only positions present and non-empty in the response, keeps source text for the rest, and logs success. Zimuarr's completeness validation is the only defense.
- **Response semantics (Bazarr's client behaviour).** Rate-limit-style and server-error-style responses are retried by Bazarr a small number of times with backoff; an authentication failure fails the job as an auth error; any other non-success response fails the Bazarr job immediately without retry. Zimuarr therefore returns: success with the complete translated line set only when every invariant passes; a non-retryable client error for validation failures and quarantined output (fail fast, no retry storm); and a retryable error only when a retry might genuinely succeed.
- **Timeout policy.** Keep computing after Bazarr gives up; cache the completed result by session and fingerprint; serve it instantly on Bazarr's retry.

#### Direction 3: Zimuarr observes Bazarr (mirror)

- Bazarr exposes no outbound event stream and no delta or cursor API; its webhooks are inbound. Observation is polling-based, full stop.
- Mirror synchronization must be incremental (per series), paginated, and rate-limited for large libraries.
- The mirror reads series, episodes, movies, and their subtitle inventory, and fetches subtitle content on demand for fingerprinting.

#### Data-shape facts

- Language codes are two-letter with a small conversion map applied by Bazarr for regional Chinese and Brazilian Portuguese variants; Bazarr internally mixes two-letter and three-letter codes. Zimuarr needs an explicit **language-identity normalization layer** at the integration boundary, and must never leak Bazarr's internal inconsistencies into its domain.
- Bazarr always writes the translated destination in a plain subtitle format without rich styling.
- Because Bazarr sends stripped plaintext and writes translated text back as the full cue text, source markup (italics, positioning) is destroyed by Bazarr regardless of what Zimuarr does. Markup validation governs model-introduced markup only; the upstream limitation must be documented to users.

#### Failure handling

- Bazarr unreachable: the Bazarr circuit breaker opens; observation pauses; plans show the instance as unhealthy; no dispatch to that instance.
- Version outside the supported range: registration is refused or flagged; diagnostics explain.
- Callback from an unknown key: rejected and recorded as a security event.
- Callback that matches no session: rejected by default and recorded.
- Partial mirror data: the mirror is replaceable; partial syncs must not cause desired subtitles to be classified as "no longer required" (a media item missing from a failed page is not a deleted media item). This guard is an inference from the design, not spelled out in the handoff.

### AI translation providers

- Providers are integrated through thin adapters plus capability declarations (see capability model). Credentials are secrets, encrypted at rest where practical and never logged.
- Provider failures are classified: schema-invalid output feeds the structured-output breaker; rate limits and outages feed the provider breaker; bounded retries with backoff occur inside the session deadline.
- Usage reporting feeds cost settlement; where only estimates exist, settlements are marked as estimated.

### Sonarr and Radarr

Zimuarr does not integrate with Sonarr or Radarr directly. It handles their identifiers only because Bazarr's contract uses them.

---

## User interface

### Information architecture

The first interface should contain these areas (names indicative):

| Area | What it shows | What you can do |
|---|---|---|
| First-run setup | Create the first administrator | Set credentials; proceed to onboarding |
| Sign-in | Authentication | Sign in; sign out |
| Bazarr onboarding | Connect an instance; verify version; verify that Bazarr's global translator points at Zimuarr; run a self-test round trip | Add/edit/remove instances; issue and rotate the per-instance key; set observation-only vs active |
| Dashboard | Counts by desired-subtitle classification; recent activity; budget consumption against ceilings; breaker and pause status; health summary | Jump to any area; emergency global pause |
| System health | Instance connectivity and version status; provider status; worker status; last successful observation per instance; contract-drift warnings | Run diagnostics; download a redacted diagnostic bundle |
| Media and subtitle inventory | Series, episodes, and movies as mirrored from Bazarr, with their observed subtitles and managed artifacts, each row classified | Filter by instance, language, classification; drill into an item to see observed vs desired vs managed |
| Translation policies | List of policies with scope, targets, sources, provider/model, revisions, activation mode | Create, edit, activate, pause, dry-run a policy; see which artifacts a change would make stale |
| Source-language preferences | Ordered preferences | Edit ordering and variant rules |
| Dry-run plans | The explained plan for a policy, instance, or the whole system; each action with its safety verdict | Trigger a preview; promote to active when satisfied |
| Translation activity and history | Live and past sessions and attempts with their lifecycle, including abandoned-then-completed and cached-on-retry outcomes | Inspect a session; see chunk results, validation results, cost |
| Providers and models | Providers with capability declarations, keys, breaker and pause state; models with parameters and pricing revision | Add/edit providers; pause a provider; reset a breaker with justification |
| Budgets and usage | Reserved vs settled spend by day/month/provider/policy; caps and remaining headroom; pricing revisions in effect | Edit ceilings and caps; view historical reports at the prices that applied |
| Circuit breakers | Current state and history of each breaker | Inspect trip reasons; manually reset |
| Quarantine review | Cases with failing checks, side-by-side source and candidate | Discard, re-attempt, or (open question) approve |
| Managed-artifact provenance | For any artifact: source revision, attempt, provider, model, prompt/glossary/validation revisions, cost and pricing revision, timestamps, drift status | Trigger an upgrade; adopt; roll back or replace with approval |
| Pause controls | Global, per-provider, per-policy pause switches | Toggle with a recorded reason |
| About | Version, license, link to corresponding source | — |

### Key interaction patterns

- **Explanations everywhere.** Every refused or deferred action shows which rule refused it. Every artifact shows how it came to exist.
- **Preview before activate.** Policies and connections offer a plan preview; activation is a deliberate, confirmed step.
- **Live refresh.** A server-pushed event stream updates dashboard, activity, health, and breaker views; events carry versioned envelopes and durable identifiers so the UI can recover missed events after reconnection.
- **Telemetry vs truth.** In-progress states are visually distinct from verified states.
- **Paginated, filterable inventory** with filter state preserved in the address.
- **Dangerous actions require confirmation** and record a reason (resetting a breaker, replacing a protected subtitle, overriding a quarantine).

### States

- **Empty states**: no instances connected (points to onboarding); no policies (points to policy creation with an example); no activity yet (explains that the system is in observation-only mode).
- **Loading**: skeletons for tables; paginated loads for inventory.
- **Error**: unreachable instance banners; provider breaker banners; a global "paused" banner that is impossible to miss.

### Theming, responsiveness, accessibility, localisation

Light and dark appearance, no flash of wrong theme. Keyboard-operable, correctly labelled controls. Dense desktop-first layout appropriate to an operations tool, degrading gracefully on narrow screens. UI localisation is not mentioned in the handoff and is an open question; note that the *domain* is multilingual (language names and codes must display correctly in every view).

---

## Configuration and operations

### What is configurable

| Scope | Settings |
|---|---|
| Instance | Bazarr address, credential for Bazarr's API, issued callback key, activation mode, per-instance concurrency limit, supported-version status |
| Provider | Credentials, capability declaration overrides where allowed, concurrency limit, pause, breaker thresholds |
| Model | Provider parameters (typed), pricing revision |
| Policy | Scope, targets, source preferences, provider/model, prompt/glossary/validation revisions, activation mode, replacement permissions for unmanaged and manually edited subtitles, pause |
| Safety (global) | Dispatch windows, global concurrency, hourly/daily volume caps, character and line limits, per-attempt/daily/monthly budget ceilings, retry bounds, breaker thresholds, global pause |
| Prompts, glossaries, validation policies | Edited as typed configuration; each save creates a new content-addressed revision |
| Pricing tables | Versioned; editing creates a new revision; old settlements keep their revision |
| Observation | Polling cadence and rate limits per instance (open question whether per-instance or global) |

The backend is authoritative for all of these; the UI collects and presents them.

### First-run and onboarding

1. Create the first administrator.
2. Connect a Bazarr instance; Zimuarr checks reachability and version against the supported range.
3. Zimuarr issues a distinct callback key for the instance and tells the administrator exactly what to configure in Bazarr's single global external-translator setting (address and token).
4. Zimuarr verifies that Bazarr is now pointed at it and runs a self-test translation round trip.
5. The instance starts in observation-only mode; the mirror begins to populate; the dashboard shows inventory with no dispatch.
6. The administrator configures a provider and a model, writes a policy, previews a plan, and only then activates.

### Deployment shape

- A single self-hosted instance, serving the web UI and the API on the same origin, with the API versioned.
- Two runtime roles from the same application: an API role and a background worker role, with a combined mode for simple single-instance installations. Correctness must not depend on exactly one process existing; durable claims and leases cover multi-process deployments.
- Long-lived request tolerance is mandatory along the whole callback path, including any reverse proxy; reverse-proxy guidance must be documented.
- The callback endpoint must be safely exposable when Bazarr and Zimuarr live on different networks.
- The handoff chooses a server-grade relational store because durable worker claims, session leases, and reconciliation locks need it, and acknowledges this diverges from the lightweight-embedded-store norm of the ecosystem, creating installation friction that packaging must offset with trivial single-command deployment. Whether the rewrite keeps that choice is open; the *requirements* (durable leases, safe multi-process claims) are not.
- Sign-in must work on plain-network self-hosted installs (no assumption that the app is only reachable over encrypted connections on a public hostname).

### Persistence and backups

- Durable: policies, desired subtitles, managed artifacts and provenance, sessions and attempts, quarantine cases, budgets and settlements, pricing revisions, content-addressed revisions, audit events, credentials.
- Replaceable: the observed-state mirror.
- Backups should cover the durable set; a restore followed by a full mirror rebuild must reproduce correct classifications.
- Schema migrations are versioned and applied deliberately, never by ad-hoc creation in production.

### Logging, health, diagnostics

- Structured logs that never contain secrets.
- A health view and health endpoint covering instances, providers, workers, last observation times, and breaker states.
- A "doctor" diagnostics capability: connectivity, version, translator-pointing verification, self-test round trip, and a redacted diagnostic bundle for support.
- Audit and domain events are first-class and feed the live stream and history.

### Privacy posture

Subtitle text is sent to third-party AI providers of the user's choosing; this should be stated clearly in provider setup. No telemetry leaves the instance other than those provider calls and Bazarr calls.

---

## Security

- The web UI and API require authentication; first-run administrator setup is the only unauthenticated write path and must close after use.
- Session handling for the web UI must work over plain connections inside a home network as well as behind an encrypting reverse proxy.
- Machine access to Zimuarr's API uses API keys.
- The Bazarr callback authenticates with a per-instance static key and rejects unknown callers by default. Keys are distinct per instance and rotatable.
- Secrets (Bazarr tokens, provider keys, issued callback keys) are encrypted at rest where practical, never logged, and redacted from diagnostic bundles.
- Provider and Bazarr payloads are converted to native types at the boundary and never leak into the public API or UI.
- Trust assumptions: Bazarr is trusted to the extent of its key; its payloads are not trusted for correlation (hence fingerprinting). Providers are untrusted; their output is validated in full.

---

## Non-functional requirements

- **Scale**: large personal libraries (tens of thousands of episodes) without stressing Bazarr; observation is incremental, paginated, and rate-limited.
- **Latency**: a translation session must complete, including chunking and bounded retries, within roughly twenty-eight minutes; the UI should reflect progress live.
- **Reliability**: no duplicate dispatch under multiple workers; no lost intent on restart; sessions survive process restarts or are safely failed and their reservations released; cached results survive long enough to answer Bazarr's retry.
- **Cost safety**: no provider spend without a prior reservation; hard ceilings cannot be exceeded by concurrent sessions.
- **Correctness over throughput**: when in doubt, refuse and explain.

---

## Delivery sequence as planned (what to validate first)

The governing principle is **prove the riskiest bet first**: the entire product rests on an undocumented Bazarr contract.

| Phase | Intent | Validation status |
|---|---|---|
| 0 — Contract spike | Stand up the callback against a real Bazarr; prove fingerprint correlation including the plaintext-normalization subtlety; prove concurrent-episode disambiguation; exercise timeout/retry/cached-response including the adversarial retry-after-timeout sequence; capture it all as the initial contract-test suite | Not started |
| 1 — Observation | Authentication and first-run setup; Bazarr connection with version gating; read-only incremental mirror; domain events; live stream; basic dashboard; **no dispatch** | Not started |
| 2 — Declarative planning | Policies; desired-subtitle calculation; source selection; drift classification; explainable dry-run plans; policy provenance; safety-decision previews | Not started |
| 3 — Closed-loop translation | Sessions with fingerprint correlation and deadlines; dispatch; callback; one provider via the capability model; validation invariants; idempotent cached replay; result observation; artifact provenance | Not started |
| 4 — Safety and operations | Windows, caps, budgets with pricing provenance, breakers, concurrency, quarantine, pause controls, durable claims, diagnostics | Not started |
| 5 — Upgrades and lifecycle | Source-change detection; content-addressed revisions; managed upgrades; manual-edit detection; adoption; rollback and replacement | Not started |

The handoff also notes that the predecessor orchestrator's structure (its mirror, intent, policy, safety-rail, dispatch, diagnostics, and watch concepts, its first-administrator setup, its live event stream, and its instance version gating) maps closely onto Zimuarr's needs and can be ported structurally — provided every ported piece is audited for three-party-topology assumptions and every historical name is removed. A rewrite on a different stack should read this as "the concepts are proven; the code is not required."

---

## Known weaknesses, open design questions and improvement ideas

### Inherent weaknesses the rewrite must live with

- **The Bazarr contract is undocumented and can break silently.** Mitigations are contract tests against a pinned version, version gating, and diagnostics — but a Bazarr release can still break users. Consider adding a contract-drift *detector* that notices unexpected payload shapes at runtime and trips a breaker rather than guessing.
- **Weak correlation.** Fingerprinting is the only robust correlator, and it depends on replicating Bazarr's markup stripping exactly. If two *different* subtitles have identical plaintext lines (rare but possible: duplicate episodes, re-encodes), the correlation is ambiguous. The design should define behaviour for fingerprint collisions among open sessions (refuse rather than guess).
- **Source markup is destroyed by Bazarr.** Nothing Zimuarr does can preserve italics or positioning. Users must be told.
- **Single global translator in Bazarr.** Zimuarr excludes Bazarr's built-in translators on the same instance.
- **Synchronous thirty-minute callback.** Long-held requests are operationally awkward behind proxies and under restarts. The abandoned-then-completed path mitigates cost, but a process restart mid-session must be handled explicitly (fail safe, release reservation, let the retry re-execute or serve cache).
- **Partial acceptance by Bazarr.** The single most important invariant has no backstop. Any bug that lets a reduced line set through produces silently corrupted files. Treat the completeness validator as the most heavily tested unit in the system, with property-based and adversarial tests.

### Open design questions (the handoff is prescriptive or silent, but these are genuinely undecided)

1. **Policy scope vocabulary.** How media is selected (per instance, library, series, tag, genre, path pattern?) and how overlapping policies are resolved (priority? most specific wins? refuse overlap?).
2. **Session lifecycle states and expiry.** The handoff lists what a session must contain, not its state machine, nor how long a session waits for a callback that never arrives, nor how long cached output is retained for a retry.
3. **Behaviour for a duplicate callback while execution is in flight.** Hold the second request until the first finishes, or answer it with a retryable error? Both satisfy "never empty"; they have different proxy and timeout implications.
4. **Unsolicited callbacks.** Always reject, or allow an administrator to opt into "accept and translate under a default policy"? The safe default is reject; whether an opt-in exists is open.
5. **Quarantine approval.** Can an administrator approve quarantined output for activation despite failed checks? If yes, how is it delivered to Bazarr given that the original callback already failed?
6. **Adoption, rollback and replacement mechanics.** Bazarr owns the files. Does Zimuarr retain artifact content to roll back, or re-translate? How does it cause Bazarr to re-write a file without a fresh translation callback?
7. **Chunking strategy and deadline budgeting.** How the deadline is split across chunks and retries; whether chunks run in parallel; how context (previous lines, glossary) is carried between chunks for consistency.
8. **Capability declaration ownership.** Are capability declarations shipped with the application, user-editable, or both? What happens when a provider changes capabilities?
9. **Roles.** Only an administrator is defined. Viewer and approver roles are plausible additions.
10. **Observation cadence and triggers.** Fixed interval, adaptive, manual, or event-nudged (Bazarr can send inbound webhooks to other systems; whether Zimuarr accepts a Bazarr webhook as a hint to observe sooner is unexplored and would be a cheap win).
11. **Deployment store choice.** The handoff picks a heavier server-grade store for lease semantics; the requirement is durable claims, not a particular engine.
12. **Multiple Bazarr instances.** Supported in the model (per-instance keys, limits, breakers), but cross-instance behaviour (same media on two instances, shared budgets) is unspecified.
13. **UI localisation** is unmentioned.
14. **Several wire-level numbers** (thirty-minute timeout, retry counts) are Bazarr's current behaviour, not product decisions; they must be configurable or detected, not hard-coded.

### Improvement ideas for the rewrite

- Make the completeness validator a pure, exhaustively tested component with an adversarial corpus including the exact predecessor sequences (missing position, duplicate request, retry after timeout).
- Add a runtime contract-drift detector alongside offline contract tests.
- Define fingerprint-collision behaviour explicitly (refuse and surface).
- Surface "source markup is lost" and "Zimuarr replaces Bazarr's built-in translators" prominently in onboarding, not only in docs.
- Consider accepting Bazarr's outbound webhooks as *hints* to observe sooner, while keeping polling as the authority.
- Provide a per-policy "estimated monthly cost at current prices" preview in the plan, since budgets and pricing provenance already exist.
- Keep the UI strictly presentational over backend decisions; resist re-deriving classifications client-side.

---

## Glossary

| Term | Meaning |
|---|---|
| Admission control | The pre-dispatch evaluation of windows, limits, budgets, breakers, and protections that decides whether a planned action may run. |
| Adoption | Deliberately bringing an existing unmanaged subtitle under Zimuarr's management so it gains provenance and protection. |
| Bazarr instance | One connected Bazarr installation, identified by its own issued callback key. |
| Breaker (circuit breaker) | A safety state that stops dispatch to a provider or Bazarr instance, or stops structured-output attempts, after repeated failures, until reset or cooled down. |
| Callback | The synchronous request Bazarr makes to Zimuarr carrying subtitle lines to translate; the response must contain the complete translation. |
| Capability model | The declarative description of what a provider can do, used to select validation, chunking, and parsing strategies. |
| Content-addressed revision | A prompt, glossary, or validation-policy version identified by a hash of its content. |
| Content fingerprint | A hash of a subtitle's normalized lines, used to correlate callbacks with sessions and to detect source changes and manual edits. |
| Desired subtitle | A durable declaration, derived from policies, that a translated subtitle should exist for a media item, language, and variant. |
| Dispatch | Zimuarr asking Bazarr to run a translation for a specific subtitle. |
| Dispatch window | A configured period during which dispatch is permitted. |
| Drift | Any divergence between a managed artifact's provenance or content and the current policy inputs or observed file. |
| Dry run | Producing and showing a plan without dispatching anything. |
| Managed artifact | A translated subtitle produced or adopted by Zimuarr, with full provenance. |
| Manually modified | A managed artifact whose observed content no longer matches what Zimuarr wrote; protected by default. |
| Mirror (observed state) | Zimuarr's replaceable local copy of what Bazarr reports about media and subtitles. |
| Observation | A polling pass that refreshes the mirror; also the act of verifying that a translated subtitle actually exists after dispatch. |
| Pricing revision | A versioned snapshot of provider prices; every settled cost references the one it used. |
| Provenance | The complete record of how a managed artifact was produced: source revision, attempt, provider, model, revisions, cost, timestamps. |
| Quarantine case | A translation candidate retained for inspection but excluded from activation because it failed validation or looked suspicious. |
| Reconciliation | The cycle of observing, computing desired state, comparing, classifying, planning, admitting, dispatching, and verifying. |
| Reconciliation plan | The explained set of actions produced by a reconciliation cycle. |
| Reservation and settlement | Budget is reserved at admission using an estimate and settled with actual usage after the provider completes. |
| Safety decision | The recorded verdict of admission control for one action. |
| Session (translation session) | The short-lived authorization linking a dispatch decision to its callback, with correlation data, budget reservation, deadline, lifecycle, and cached output. |
| Source-language preference | The ordered list of acceptable source languages and variants for a policy. |
| Stale | A managed artifact whose inputs have changed since it was produced. |
| Translation attempt | One execution with a fixed combination of inputs; may succeed, fail, retry, or be quarantined. |
| Translation policy | A user-authored declaration of which media should have which translated subtitles, from which sources, with which provider, model, prompt, glossary, and validation policy. |
| Unmanaged | A subtitle Zimuarr did not produce or adopt; never overwritten automatically. |
| Verified | A managed artifact whose presence has been confirmed by a later observation, as opposed to merely dispatched or returned. |
