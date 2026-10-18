---
version: 1
slug: "route-settings-budgets"
primary_target: "route:/settings/budgets"
related_targets: []
---

# Zimuarr Budgets and source-language preferences

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/settings/budgets`.

## Purpose and composition

Main monthly budget form and clear settled/reserved/available ruler, provider breakdown, smaller ordered source-language preference section.

## Visual reference

[Detailed mockup](../../docs/design/screens/08-settings-budgets.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Budgets and usage'. Monthly cap $20.00. Settled $6.40, Reserved $1.20, Available $12.40. Daily cap $2.00. 'Save budget caps'. 'Prices recorded when the translation ran.' Language preferences English, Danish, German with Move up / Move down. Scope applies per policy.

## Acceptance criteria

6.40 + 1.20 + 12.40 = 20.00. No ambiguous combined spending total labelled settled. Keyboard-operable ordering. No paid work from saving caps.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Budget reservation

[States and components board](../../docs/design/screens/10-states-and-components.webp), budget specimen: Settled $6.40 / Reserved $1.20, shown as separate values.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
