---
version: 1
slug: "route-policies-policy"
primary_target: "route:/policies/[policy]"
related_targets: ["route:/policies/english-to-swedish"]
---

# Zimuarr Policy editor and dry-run plan

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/policies/english-to-swedish`.

## Purpose and composition

Two-column policy form and explained-plan preview. Main action Preview plan; activation confirmation panel appears only in plan area, not auto-on toggle.

## Visual reference

[Detailed mockup](../../docs/design/screens/04-policy-plan.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'English to Swedish'. Mode Observation only. Source English, Target Swedish, Scope All series, model Standard, glossary Nordic names v2. 'Preview plan'. Plan 24 Translate, 3 Skip protected, Estimated $0.48. Reasons Missing target subtitle / Manually edited, protected. 'Activate policy' secondary pending deliberate confirmation.

## Acceptance criteria

No spending before activation. Protected rows skipped. Same planner for preview/dispatch. Budget verdict explicitly Passed or Deferred.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Observation-only empty state

[States and components board](../../docs/design/screens/10-states-and-components.webp), observation-only specimen: 'Observation only. Preview a plan to see proposed translations.' Preview plan. The empty state does not claim work has run. Text and icon convey the state.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
