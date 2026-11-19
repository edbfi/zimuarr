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

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Translation provider'. Name Demo Translate, endpoint https://translate.example, API key Stored •••• 4821, New key blank, Test connection. Model Standard. Capabilities Streaming, Structured output displayed as supported/not supported. Pricing revision Oct 2025, cost per million input/output tokens shown separately. 'Save provider'.

## Acceptance criteria

Do not invent raw provider template editor. Secrets stay hidden. Price is example, stored with revision; no current provider-price claims.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Field anatomy

Every input has a visible label, which stays in view while the input has focus.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Polar Control. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
