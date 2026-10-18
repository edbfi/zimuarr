---
version: 1
slug: "route-quarantine-case"
primary_target: "route:/quarantine/[case]"
related_targets: ["route:/quarantine/case-312"]
---

# Zimuarr Quarantine comparison and validation

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/quarantine/case-312`.

## Purpose and composition

Wide aligned subtitle source/candidate comparison table with cue numbers, timestamp columns, validation rail and actions below.

## Visual reference

[Detailed mockup](../../docs/design/screens/05-quarantine-review.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Incomplete translation'. Rejected badge. '311 of 312 cues returned'. Source English row 003 'Meet me at the station.' Candidate Swedish row 003 blank and Missing. Checks Cue count Failed, Structure Passed, Timing Passed, Protected file unchanged. 'Discard result', 'Re-attempt'.

## Acceptance criteria

Missing-cue check red failure, never green. No approve-success action for incomplete output. No replacement of protected subtitle.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-operator.webp), right view.

Three mobile web views at 390px share one board: classified dashboard, global pause dialog and quarantine details. Compact app header, nav drawer closed; persistent Pause control within reach. Do not squeeze the full desktop table into phone width. States stack; primary controls retain labels. No consumer navigation.

Required content: quarantine detail 311/312 cues returned, Cue count Failed, Re-attempt.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Quarantine mobile helper copy must be: 'Rejected output stays quarantined. Re-attempt the translation or discard the result.' Omit the incidental 'Discard only when complete' raster sentence.
- Use only configured translation providers. The quarantine raster's incidental provider name is not a new integration; use fictional Demo Translate in fixtures.
- Do not offer approval or release for incomplete output. The final mobile board removes that action; enforce the same invariant on every layout.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
