---
version: 1
slug: "route-settings-providers"
primary_target: "route:/settings/providers"
related_targets: []
---

# Zimuarr Provider and model settings

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/settings/providers`.

## Purpose and composition

Tabbed settings Providers / Language preferences / Budgets / Account. One provider form, capabilities summary and model pricing revision panel.

## Visual reference

[Detailed mockup](../../docs/design/screens/07-settings-providers.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Translation provider'. Name Demo Translate, endpoint https://translate.example, API key Stored •••• 4821, New key blank, Test connection. Model Standard. Capabilities Streaming, Structured output displayed as supported/not supported. Pricing revision Oct 2025, cost per million input/output tokens shown separately. 'Save provider'.

## Acceptance criteria

Do not invent raw provider template editor. Secrets stay hidden. Price is example, stored with revision; no current provider-price claims.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Field anatomy

[States and components board](../../docs/design/screens/10-states-and-components.webp), input specimen: a focused input with its visible label.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
