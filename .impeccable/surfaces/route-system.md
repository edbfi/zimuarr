---
version: 1
slug: "route-system"
primary_target: "route:/system"
related_targets: []
---

# Zimuarr System administration and pause

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/system`.

## Purpose and composition

Administrative health page with connection/provider/worker table, recent diagnostics and a global pause reason dialog example. Same shell as daily workspace.

## Visual reference

[Detailed mockup](../../docs/design/screens/06-admin-system.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'System health'. Bazarr main Connected / observed 2 min ago / contract compatible. Translation provider Available. Worker Ready. 'Run diagnostics'. Global pause dialog 'Pause translations', Reason field 'Maintenance', 'Pause new work', Cancel. Text 'In-flight attempts finish; no new work starts.'

## Acceptance criteria

Global pause action shown as future confirmation, not simultaneously paused/active. No unexplained circuit-breaker jargon; say Provider temporarily paused after errors.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
