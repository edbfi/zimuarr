---
version: 1
slug: "route-setup-bazarr"
primary_target: "route:/setup/bazarr"
related_targets: []
---

# Zimuarr First connection

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/setup/bazarr`.

## Purpose and composition

Larger onboarding form with connection test result, shown beside the sign-in pane on the entry board. No product marketing landing or consumer sign-in.

## Visual reference

[Detailed mockup](../../docs/design/screens/01-entry-and-onboarding.webp), right pane.

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Connect Bazarr', address https://bazarr.example, key masked, Test connection. Checks Version compatible, Translator configured, Round trip verified. Mode 'Observation only' selected. 'Finish connection'.

## Acceptance criteria

Success checks each named. Finish does not activate translation. Never suggest automatic paid translation on first connection.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Entry board 01 places sign-in and onboarding side by side for review. Implement them as separate routes; sign-in never displays authenticated navigation.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
