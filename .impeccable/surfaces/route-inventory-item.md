---
version: 1
slug: "route-inventory-item"
primary_target: "route:/inventory/[item]"
related_targets: ["route:/inventory/northbound-s02e04"]
---

# Zimuarr Subtitle inventory and provenance

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/inventory/northbound-s02e04`.

## Purpose and composition

Inventory table on left, selected subtitle detail occupying right half with Observed / Desired / Managed tabs and provenance chain.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

Northbound S02E04, Swedish, Verified. Source English, source revision a91c, Prompt v3, Glossary v2, Validation v4, provider Demo Translate, model Standard, settled cost $0.021. Validation '312 of 312 cues complete'. Last observed in Bazarr 2 min ago. Filter language Swedish, classification All.

## Acceptance criteria

Observed and Desired both present for Verified. No streaming player. Example provider/model names clearly fictional. Revision changes determine staleness.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Subtitle states

Each is a state of this route, not one screen.

- Validation failed: 'Incomplete output rejected. 1 cue missing.' Review.
- Verified record: Verified 312/312 cues observed in Bazarr.
- Badges: Missing, Stale, Quarantined, In progress, Verified, each with text and icon.

No time-only stale reasons. No green progress or check icon for failure or in-progress.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
