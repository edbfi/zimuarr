# Zimuarr product context

An operator-focused control plane for complete, explainable subtitle translation alongside Bazarr.

## Platform

web

## Users

Operational shell: 224px sidebar Dashboard, Inventory, Policies, Plans, Activity, Quarantine, Budgets, Providers, System, Settings. Global Pause translations at upper right. v1 all authenticated operators are admins; 'operator' and 'admin' here are task perspectives, not invented permission roles.

## Primary tasks

- **Operator:** Sign-in and first connection. Proposed route: `/login → /setup/bazarr`.
- **Operator admin:** Operator dashboard. Proposed route: `/dashboard`.
- **Operator:** Subtitle inventory and provenance. Proposed route: `/inventory/northbound-s02e04`.
- **Operator admin:** Policy editor and dry-run plan. Proposed route: `/policies/english-to-swedish`.
- **Operator:** Quarantine comparison and validation. Proposed route: `/quarantine/case-312`.
- **Operator admin:** System administration and pause. Proposed route: `/system`.
- **Operator admin:** Provider and model settings. Proposed route: `/settings/providers`.
- **Operator admin:** Budgets and source-language preferences. Proposed route: `/settings/budgets`.

## Product requirements

- No separate consumer/member portal. This is an operator tool; sign-in is its public entry.
- New connections and policies observation-only. Preview plan before deliberate activation.
- In progress is telemetry; Verified requires durable confirmation from Bazarr. Partial output never successful.
- Protect unmanaged/manually edited subtitles. Staleness follows source/prompt/glossary/validation revisions, not age.
- Show reserved and settled spend separately. Global pause always available. No raw provider templates.

## Confirmed visual direction

Polar Control. Deep polar blue, seafoam primary actions, ice-blue informational accents. Dense desktop tool with clear subtitle classifications and budget rulers. Clean typography, flat panels, no decorative photography or cinematic gradients. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

This application is a planned control plane. Operator and admin labels describe tasks in the same authenticated workspace; no member portal or new permission roles are introduced.
