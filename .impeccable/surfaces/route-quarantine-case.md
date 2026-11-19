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

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Incomplete translation'. Rejected badge. '311 of 312 cues returned'. Source English row 003 'Meet me at the station.' Candidate Swedish row 003 blank and Missing. Checks Cue count Failed, Structure Passed, Timing Passed, Protected file unchanged. 'Discard result', 'Re-attempt'.

## Acceptance criteria

Missing-cue check red failure, never green. No approval, release or approve-success action for incomplete output, on any layout. No replacement of protected subtitle.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use only configured translation providers; the fixtures use the fictional Demo Translate.
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

Quarantine details at 390px (the classified dashboard and the pause dialog are in the [dashboard brief](route-dashboard.md)). Compact app header, nav drawer closed; persistent Pause control within reach. Do not squeeze the full desktop table into phone width. States stack; primary controls retain labels. No consumer navigation.

Required content: quarantine detail 311/312 cues returned, Cue count Failed, Re-attempt. Helper copy: 'Rejected output stays quarantined. Re-attempt the translation or discard the result.'

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
