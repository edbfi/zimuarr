---
version: alpha
name: "Zimuarr Polar Control"
description: "Deep polar blue, seafoam actions, ice-blue information and flat panels."
colors:
  background: "#102B3B"
  surface: "#1F4053"
  raised: "#2B5064"
  border: "#52778A"
  control-border: "#86A0AD"
  primary: "#B4DFC8"
  secondary: "#93CDE6"
  text: "#F0F7FB"
  muted: "#B9CDDA"
  success: "#B4DFC8"
  warning: "#F0CC83"
  danger: "#FFACB5"
typography:
  display:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  h1:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  table:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  number:
    fontFamily: "Roboto Mono Variable, monospace"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  code:
    fontFamily: "Roboto Mono Variable, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  control: "8px"
  panel: "12px"
  dialog: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  section: "48px"
  hero: "64px"
  mobileGutter: "16px"
  tabletGutter: "24px"
  desktopGutter: "32px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "32px"
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  primary-button-disabled:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
  text-field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  segmented-choice:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  segmented-choice-current:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
---

# Design System: Zimuarr Polar Control

## Overview

**Creative North Star: "Polar Control"**

A control room at the edge of the ice: deep polar blue, seafoam for the actions that move work
forward, ice blue for information and focus. Zimuarr is a dense desktop tool with clear subtitle
classifications and budget rulers. Typography is clean, panels are flat, and there is no
decorative photography or cinematic gradient. It is dark-first: dark is the only colour mode.

The tokens live in [`panda.config.ts`](panda.config.ts), and components use them only through
Panda, with `strictTokens` refusing raw values. This file describes how they are used. The
frontmatter mirrors the Panda config; when the two disagree, the config wins and this file is
refreshed. The claim page at `/setup` is the first built surface. The guidance for components not
built yet (navigation, tables, dialogs, badges, toasts) is the direction their surfaces build to.

[Product context](PRODUCT.md) and the [surface briefs](.impeccable/surfaces/) define behaviour. The
mockups in [docs/design](docs/design/) guide composition and visual character; each brief records
the raster corrections for its board's incidental text. Generated raster pixels are visual guidance:
they never override named tokens or product requirements.

**Key Characteristics:**

- Flat `surface` panels on the `background` page, separated by 1px borders, not shadows.
- One solid seafoam action per task area; ice blue only for information, links and focus.
- Fields recessed into the page colour, bounded by a brighter control border.
- Public Sans for everything read, Roboto Mono for codes and operational numbers.
- Quiet operational screens; motion only as feedback.

## Colors

A cold, low-saturation blue ladder with two pale accents and three fixed semantic colours.

### Primary

- **Seafoam** (`primary`, #B4DFC8): solid fills of primary actions, text selection and the text
  caret. Text on it is `background` (10:1).

### Secondary

- **Ice Blue** (`secondary`, #93CDE6): information, links and the keyboard focus ring.

### Neutral

- **Polar Night** (`background`, #102B3B): the page, the text on Seafoam fills, and the well of
  every field.
- **Deep Water** (`surface`, #1F4053): panels.
- **Shelf Ice** (`raised`, #2B5064): a layer above a panel, the current choice in a segmented
  control, and a disabled primary button.
- **Floe Line** (`border`, #52778A): decorative separation of panels and sections.
- **Pack Line** (`control-border`, #86A0AD): the boundary of fields and controls, 3.99:1 on
  `surface` and 5.3:1 on `background`.
- **Snow** (`text`, #F0F7FB): body text and headings.
- **Frost** (`muted`, #B9CDDA): secondary text, helpers, inactive controls; 6.7:1 on `surface`.

### Semantic

- **Verified Seafoam** (`success`, #B4DFC8): success, the same value as Seafoam, always with an
  icon and a word.
- **Amber Light** (`warning`, #F0CC83): warnings and deferred work.
- **Coral Flag** (`danger`, #FFACB5): failures, field errors and destructive action.

Success, warning and danger keep these roles everywhere. Badges use subdued tinted backgrounds with
readable semantic text. Chart series get text labels and markers. No imagery goes behind data, text
fields or tables.

**The Ice-Blue Signal Rule.** `secondary` marks information, links and keyboard focus. A primary
button keeps its Seafoam fill on hover rather than turning ice blue.

**The No Colour Alone Rule.** A state is never told by colour alone: errors, statuses and badges
always carry a word, and badges an icon too.

## Typography

**Display and body font:** Public Sans Variable (with system-ui, sans-serif)
**Mono font:** Roboto Mono Variable (with monospace)

**Character:** a plain, neutral sans for everything read, with a mono face that echoes the
console and keeps numbers in columns.

Both faces are bundled from fontsource (`src/routes/+layout.svelte`); no page requests a remote
font.

### Hierarchy

- **Display** (650, 56px, 1.08, -0.03em): expressive welcome moments only.
- **H1** (600, 32px, 1.2, -0.02em): a page's title.
- **H2** (600, 24px, 1.3): section titles.
- **H3** (600, 20px, 1.4): panel titles; the text wordmark.
- **Body** (400, 16px, 1.6): prose and field text. Keep prose below 70 characters per line.
- **Label** (600, 14px, 1.4): field labels and small controls.
- **Table** (400, 14px, 1.45): table cells.
- **Caption** (400, 12px, 1.5): helpers and field errors (errors at 600).
- **Number** (Roboto Mono, 500, 32px, 1.2, tabular figures): operational figures.
- **Code** (Roboto Mono, 400, 13px, 1.5): codes and identifiers in running text.

Titles use sentence case; capitals are kept for proper names and short codes. Operational numbers
use tabular mono glyphs.

**The 16px Field Rule.** Text inside a field is never smaller than body size (16px), since iOS zooms
in on smaller input text. A field that echoes a code, such as the setup token, uses the mono face at
body size, not the 13px `code` style.

## Layout

Mobile first, with two breakpoints: `tablet` from 768px and `desktop` from 1024px.

- **Desktop:** a 12-column content grid with 24px gaps and 32px outer gutters (`desktopGutter`).
  Navigation is a 224px sidebar under a 64px top bar.
- **Below 1024px,** navigation collapses to a rail; **below 768px,** it becomes an accessible
  drawer. Gutters are 24px on tablets (`tabletGutter`) and 16px on phones (`mobileGutter`).
- **Widths:** forms at most 672px (`formMax`), reading and wizard content 680px (`readingMax`),
  operational pages up to 1440px (`contentMax`). A detail drawer is 400px on desktop and full width
  on mobile.
- **Rhythm:** the spacing tokens, 4 to 64px. Group labels with their fields (8px), put 24px between
  form groups and 48px between major sections.

Keep one dominant action per task area. Composite boards show alternatives or sequential routes side
by side for review; never combine them into one implementation screen.

## Elevation & Depth

Flat by default. Hierarchy comes from the tonal ladder (`background`, `surface`, `raised`) and 1px
borders. A broad soft shadow and a 48% dark scrim are reserved for a modal or a floating detail
sheet; neither is built yet. Public imagery may sit under a dark readability overlay; operational
surfaces stay opaque.

**The Flat Panel Rule.** No repeated card drop shadows and no glowing status dots: a panel is a
`surface` fill with a 1px `border`.

Motion is feedback, never decoration: 100ms (`press`) for press feedback, 160ms (`feedback`) for
status changes, 200ms (`panel`) for sheets. Transitions are written inside `_motionSafe`, so reduced
motion gets none: no transform, reveal, count-up or persistent animation, and the final content is
shown at once. Operational metrics never scale or count up.

## Shapes

Gently rounded and consistent: controls 8px (`control`), panels 12px (`panel`), dialogs 16px
(`dialog`). The pill radius (`full`) is only for small statuses and segmented choices.

Icons come from Lucide (`@lucide/svelte`): one 20px line family at a 1.75px stroke (1.5 to 2px).
The header shows the text wordmark "Zimuarr" until there is a logo in this palette. Never reproduce
generated connector logos; use approved real integration marks or labelled generic icons.

## Components

Quiet and precise: fills carry meaning, borders carry structure.

### Buttons

- **Shape:** 8px corners, at least 44px high.
- **Primary:** a solid Seafoam fill with Polar Night text in the label weight at body size (600,
  16px), 24px side padding. It keeps its fill on hover (the Ice-Blue Signal Rule).
- **Disabled and pending:** Shelf Ice with Frost text, still labelled, with the disabled state
  exposed. While working it says what it does ("Claiming…", "Saving…") and can't be pressed twice.
  Success is never announced before the server has durably completed the work.
- **Secondary, ghost and danger** (not built yet): a bordered secondary button, a ghost navigation
  action, and a danger button for destructive confirmation.
- **Icon buttons** always have an accessible name.

### Inputs / Fields

- **Style:** a Polar Night well inside the panel, a 1px Pack Line border, 8px corners, at least
  44px high, 12px side padding, Snow text and a Seafoam caret.
- **Hover:** the border brightens to Frost.
- **Focus:** the global ring (below).
- **Labels and help:** every field has a visible label above it (label style), and its helper below
  (caption, Frost), linked with `aria-describedby`, the error first.
- **Error:** the border turns Coral Flag, `aria-invalid` is set, and the message sits beside the
  field (caption, semibold, Coral Flag).
- **Password with reveal:** one bordered group holds the field and a labelled Show/Hide button
  with the eye icon; the focus ring goes round the group. It reveals only what was just typed, and
  is absent without JavaScript. A stored service secret is never revealed: it shows a
  noninteractive stored-state receipt and a blank replacement field.

**The Recessed Field Rule.** A field is a `background` well inside its `surface` panel, so its fill
and its `control-border` both mark it out; no field shares its panel's fill.

### Focus

One global rule draws every control's keyboard focus: a 2px Ice Blue outline 2px outside the
element. A control inside a bordered group moves the ring to the group, or insets it.

### Error summary

After a failed submit, the first thing in the form (D28):
- **Box:** Deep Water with an even 2px Coral Flag border, 8px corners and 16px padding; no
  coloured stripe on one side.
- **Content:** the heading in the H3 style, then the problems in Coral Flag, semibold at body
  size. A field's problem is an underlined link to its field, Coral Flag rather than Ice Blue, as
  the pattern's links are; a page-level problem is text.
- **Focus:** script moves focus here after each failure, so its ring (the global one) is drawn on
  `:focus`, not only `:focus-visible`. A linked field keeps 32px above it when scrolled to, so its
  label stays in view.

### Panels

- **Background:** Deep Water, with a 1px Floe Line border and 12px corners.
- **Padding:** 16px on phones, 32px from tablets up.
- **Shadow:** none (Elevation & Depth).

### Segmented choice

The language switcher: a labelled `fieldset` of buttons, 44px high, label style in Frost. The
current choice is Shelf Ice with Snow text and `aria-current`; the others turn Snow on hover.

### Navigation (not built yet)

A 224px sidebar of icon-and-text links under a 64px top bar, a rail below 1024px and a drawer
below 768px (Layout).

### Dialogs, badges, toasts and tables (not built yet)

- **Dialogs** trap focus, close on Escape when that is safe, and return focus to the control that
  opened them.
- **Status badges** always combine an icon and text.
- **Toasts** stay out of the pointer path; copy and save results are announced through a polite
  live region.
- **Tables** use 44px rows (36px only for dense desktop work), 14px labels and monospaced numeric
  cells. Sort, filter, search and page state survive navigation. On mobile, records become labelled
  stacked rows, and details open as a full-width route or sheet.
- **A fixed primary action** never covers content or a focused field.

## Do's and Don'ts

### Do:

- **Do** use only the Panda tokens; `strictTokens` refuses raw values, and DESIGN.md is refreshed
  from the config, never the other way round.
- **Do** keep welcome and experience screens expressive and operational screens quiet.
- **Do** treat permissions, status transitions and budget arithmetic as behaviour the server
  supplies.
- **Do** use the [demo fixtures](tests/fixtures/demo-fixtures.json) for stable visual tests, then
  substitute real server data.
- **Do** follow each surface brief's raster corrections instead of copying a board's accidental
  labels or extra actions.
- **Do** build on Panda CSS and Ark UI, without adding a competing component library.

### Don't:

- **Don't** blend the edbfi apps into one theme: this palette and type hierarchy are zimuarr's, on
  every route.
- **Don't** add drop shadows to panels or cards, or glows to status dots.
- **Don't** put imagery behind data, text fields or tables.
