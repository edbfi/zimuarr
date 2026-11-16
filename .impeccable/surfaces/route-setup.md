---
version: 1
slug: "route-setup"
primary_target: "route:/setup"
related_targets: ["route:/login"]
---

# Zimuarr First-run claim

## Status

Approved by the owner with `setup`'s spec (2026-11-16), with no mockup of its own; the header keeps the text wordmark until there is a logo in Polar Control's palette. Mode: **operate**. Audience: **the person installing Zimuarr**, who can read the server console. Route: `/setup`. Module: `setup` ([docs/SPEC-setup.md](../../docs/SPEC-setup.md)).

## Purpose and composition

One quiet, centred form within the 672px form width: the first screen a fresh install shows, before anyone is signed in. No sidebar, operator navigation or Pause translations control; the header has only the "Zimuarr" wordmark as text (no logo yet, ground-floor choice 4) and the language switcher (`LanguageSwitcher.svelte`). Operational, not expressive. It is the sign-in pane's sibling: the same panel, field and button treatment, with one field more.

## Visual reference

[Entry board](../../docs/design/screens/01-entry-and-onboarding.webp), left pane (sign-in), for the panel, the labelled fields, the eye control at the end of the password field and the full-width primary button. Use the shared [design system](../../DESIGN.md): flat `surface` panel with a 1px `border` and `panel` radius, `h1` heading, `text-field` controls on `control-border`, one solid `primary` button, `danger` text for errors, the `secondary` focus ring.

## Required content

Heading 'Claim this Zimuarr'. One line: 'Enter the setup token printed in the server console, then create the owner account.' Fields: 'Setup token' (helper: 'Shown as xxxx-xxxx-xxxx. A new one is printed every 15 minutes.'), 'Username', 'Password' (helper: 'At least 15 characters.', with a Show/Hide control that shows what was typed). Primary action 'Claim and create owner'. While submitting: 'Claiming…', and the button can't be pressed twice.

## Acceptance criteria

- The token field uses the `code` style (Roboto Mono): the one input that echoes the console line it came from. It takes the token with or without dashes and in any case, inserts the dashes as it is typed when JavaScript runs, and is not a password field, so the person can check what they typed.
- Errors sit beside their field with helper/error IDs and `aria-invalid`; a wrong or expired token gets one message that names the console, never which of the two it was. A server failure says to try again.
- After a failed submit, the username is kept; the token and password are not, and focus moves to the first field with an error, or to the token field.
- The Show/Hide control is a labelled button with the eye icon, reveals only what was just typed, and is absent without JavaScript; the form works without JavaScript.
- No Bazarr, provider or translation detail appears.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish. Translated text wraps without hiding the primary action, which is above the fold at 360px.
- Read reduced-motion preference before animating; nothing on this page needs motion.
- States: initial, field errors, token refused, server failure, submitting. After success the browser leaves the page.

## Raster corrections

- Entry board 01 shows sign-in beside Connect Bazarr, with the operator shell around them. The claim has neither: no navigation, no avatar, no Pause control and no "Polar Control" subtitle, which is the design direction's name, not the product's.
- The board's snowflake mark is generated; the header shows the text wordmark until the owner provides a logo.
- The board's icons inside the username and password fields are decorative; only the eye control is kept.

## Handoff prompt

> Implement only this surface in Zimuarr's existing application. Read PRODUCT.md, DESIGN.md, docs/SPEC-setup.md and this brief first. Reuse existing Panda CSS tokens; build native accessible form controls. Keep it quiet: this is an operational screen.
