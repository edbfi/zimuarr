---
version: 1
slug: "route-login"
primary_target: "route:/login"
related_targets: []
---

# Zimuarr Sign-in

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/login`.

## Purpose and composition

Quiet sign-in pane. No product marketing landing or consumer sign-in.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

Zimuarr, 'Sign in', Username, Password, Sign in button.

## Acceptance criteria

Credentials labelled.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Sign-in and the first connection are separate routes; sign-in never displays authenticated navigation.
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
