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

Same Polar Control composition as selected board: dense shell, class counts across content, recent observations table and right budget/connection rail.

## Visual reference

[Detailed mockup](../../docs/design/screens/02-operator-dashboard.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Subtitle state, explained.' Verified 1,248; Missing 24; Stale 12; Quarantined 3. Separate In progress 2 telemetry block. Bazarr Connected, observed 2 min ago. Settled $6.40, Reserved $1.20, Available $12.40, Cap $20.00. Swedish policy Active, Danish Observation only. Pause translations.

## Acceptance criteria

Counts not merged with telemetry. In progress has activity icon, Verified has check. No ageing-based staleness explanations.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-operator.webp), left and middle views.

Three mobile web views at 390px share one board: classified dashboard, global pause dialog and quarantine details. Compact app header, nav drawer closed; persistent Pause control within reach. Do not squeeze the full desktop table into phone width. States stack; primary controls retain labels. No consumer navigation.

Required content: Verified 1,248 / Missing 24 / Stale 12 / Quarantined 3; In progress 2 separate. Budget $6.40 settled, $1.20 reserved of $20.00. Pause dialog with reason and confirmation.

## Deferred state

[States and components board](../../docs/design/screens/10-states-and-components.webp), provider-deferred specimen: 'Translation deferred. Daily budget is fully reserved.' View budget. Text and icon convey the state.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
