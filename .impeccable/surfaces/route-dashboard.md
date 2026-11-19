---
version: 1
slug: "route-dashboard"
primary_target: "route:/dashboard"
related_targets: []
---

# Zimuarr Operator dashboard

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/dashboard`.

## Purpose and composition

Dense shell, class counts across content, recent observations table and right budget/connection rail.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Subtitle state, explained.' Verified 1,248; Missing 24; Stale 12; Quarantined 3. Separate In progress 2 telemetry block. Bazarr Connected, observed 2 min ago. Settled $6.40, Reserved $1.20, Available $12.40, Cap $20.00. Swedish policy Active, Danish Observation only. Pause translations.

## Acceptance criteria

Counts not merged with telemetry. In progress has activity icon, Verified has check. No ageing-based staleness explanations.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

Two mobile web views at 390px: the classified dashboard and the global pause dialog (quarantine details are in the [quarantine case brief](route-quarantine-case.md)). Compact app header, nav drawer closed; persistent Pause control within reach. Do not squeeze the full desktop table into phone width. States stack; primary controls retain labels. No consumer navigation.

Required content: Verified 1,248 / Missing 24 / Stale 12 / Quarantined 3; In progress 2 separate. Budget $6.40 settled, $1.20 reserved of $20.00. Pause dialog with reason and confirmation.

## Deferred state

Provider deferred: 'Translation deferred. Daily budget is fully reserved.' View budget. Text and icon convey the state.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
