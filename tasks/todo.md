# Tasks: `i18n`

The spec is [docs/SPEC-i18n.md](../docs/SPEC-i18n.md), and the plan is [plan.md](plan.md). Each
task is one PR and writes its tests first. Each one adds its files to AGENTS.md's structure, ticks
off its items in `tasks/`, names the sibling apps in its PR body (AGENTS.md, Shared groundwork), and
runs `bun run --bun check`, `bun run --bun test`, `bun run --bun lint` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/` are
shortened to `lib/`.

## Task 1: Paraglide compiles the messages, and the message check guards them

**Description:** Add the two packages and the inlang project, and compile the messages in
`prepare`, `check`, dev, build (the contract scripts' build included) and both Vitest projects. The
message files hold the placeholder page's text in English and Danish, which the page starts using
in task 2. Add the message check, `lib/shared/i18n/messages.test.ts`, ported from obzorarr's #301
with its broken in-memory files. Run the Weblate round trip. (obzorarr's #297 and #301.)

**Acceptance criteria:**
- [ ] `@inlang/paraglide-js` and `@inlang/plugin-i18next` are exact-pinned dev dependencies at their
  newest stable releases (D27; 3.2.1 and 6.5.3 on 2026-11-08).
  `project.inlang/settings.json` and `project.inlang/paraglide.config.ts` are as the spec gives
  them, and the Vite plugin is added with nothing else; the `unit` and `contract` projects stay as
  they are and inherit it.
- [ ] `prepare` and `check` compile the messages after `svelte-kit sync` and before Panda's
  codegen, calling the CLI as `bun --bun <bin>`, so a fresh clone's `bun ci` compiles them, and
  `check` then type-checks `project.inlang/*.ts`. Everything passes with no Node on `PATH` (CI's
  shims). Running `check` while `dev` is up doesn't rewrite the output under the dev server.
- [ ] A call to a message that doesn't exist fails `check`, shown with a probe that isn't
  committed, its output in the PR body.
- [ ] `src/lib/paraglide/` and `project.inlang/cache/` are gitignored, Panda's `exclude` skips the
  output, and `lint` and prek pass with it present.
- [ ] The message files are flat and Biome-formatted, their names fit the spec's rule
  (`placeholder_title`, `placeholder_status`), and they leave out the name Zimuarr:
  `placeholder_title` takes it as `{{name}}`.
- [ ] The message check is written test first: after the toolchain compiles, `checkMessages`
  stubbed to return `[]` makes every broken case fail (the real files and the valid pair pass),
  shown in the PR body. With the check, every rule in the spec's list, each clause on its own, has
  an in-memory file that breaks only it and is reported with the exact list of problems, the prose
  cases pass, and a file with several problems reports them all. It passes on `messages/*.json`
  and runs in the existing `tests` hook.
- [ ] The Weblate round trip passes all four of the spec's conditions, with the script and its
  output in the PR body; neither the script nor its temporary message is committed. It is run
  here, not cited from obzorarr's #297, because zimuarr's Vite and Biome differ from `7368cff`'s;
  the PR body lists the versions it compared.
- [ ] The placeholder page's text is unchanged in this PR.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek; CI's `checks`,
`smoke`, `contract` and `ci-ok`.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `project.inlang/settings.json`,
`project.inlang/paraglide.config.ts`, `messages/en.json`, `messages/da.json`,
`lib/shared/i18n/messages.test.ts`, `vite.config.ts`, `tsconfig.json`, `panda.config.ts`,
`.gitignore`, `AGENTS.md`, `docs/SPEC.md` (the tech-stack table, the setup fact, the Commands rows
for `bun ci` and `check`, and the testing section). Most gain a line or two.

**Size:** M.

## Task 2: each request gets the viewer's language, the browser keeps it, the switcher changes it

**Description:** Run every request through `paraglideMiddleware` in `handle`, write the language
into `<html lang>`, and keep the page's language in the browser. The placeholder page renders its
text from the messages, and `LanguageSwitcher.svelte` sits at its top, with the global focus ring.
The held Bazarr callback is now behind the language handle. (obzorarr's #298 and #299.)

**Acceptance criteria:**
- [ ] `tests/e2e/i18n.test.ts`, ported from obzorarr's at `7368cff` with all its assertions,
  against the built server, written first and failing without the code:
  - a `da-DK` browser gets `/` in Danish with `<html lang="da">` and
    `Vary: Cookie, Accept-Language`, and "Dansk" has `lang="da"` and `aria-current="true"`;
  - pressing "English" there reloads `/` in English and writes `PARAGLIDE_LOCALE=en` with path `/`,
    `SameSite=Lax` and without `Secure` over plain HTTP, and the next visit stays in English;
  - a browser whose header says `fr-FR` and whose `navigator.languages` an init script sets to
    `fr-FR`, `da-DK` gets English, the switcher marks English as current after hydration, pressing
    "English" neither reloads the page nor writes a cookie, and no cookie is written at all;
  - none logs a console error, and the smoke test passes unchanged in English.
- [ ] The placeholder renders its messages as text, never with `{@html}`, with `Zimuarr` filled in
  as `{{name}}`, and `<title>Zimuarr</title>` stays as it is.
- [ ] `app.html` has `<html lang="%lang%">` with the Biome suppression just above it, which doesn't
  contain the token. `hooks.server.ts` and `hooks.client.ts` are as the spec's Code style gives
  them, and the `init` hook is unchanged.
- [ ] The switcher is a labelled group of native buttons, the label a message
  (`language_switcher_label`), each button naming its language in that language with `lang` set,
  from `Intl.DisplayNames` with the first letter upper-cased in that language ("English", "Dansk"),
  through a helper private to the component (`ownName`), never a message or a literal. The current
  language's button has `aria-current="true"` and does nothing when pressed; another calls
  `setLocale`. It is styled only with tokens, at the top of `/` before the heading.
- [ ] Keyboard focus is one rule in `panda.config.ts`'s `globalCss`: DESIGN.md's 2px `secondary`
  ring with a 2px offset on every `:focus-visible` element.
- [ ] The concurrency check passes: 200 concurrent requests in both languages against the built
  server, through a temporary route that awaits a random delay in its `load`, each render in their
  own language. The script and its output are in the PR body; neither it nor the route is
  committed. It is run here, not cited from obzorarr's #298.
- [ ] CI's `contract` job passes on the PR's head, its cases unchanged, as the evidence that the
  callback and its held answers didn't change behind the language handle.
- [ ] D15 no longer lists browser interaction with a real component.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek; CI's `checks`,
`smoke`, `contract` and `ci-ok`. Manual check: in `dev`, a browser set to Danish sees the
placeholder in Danish; at 360, 390, 768 and 1440 px, at 200% zoom and with reduced motion, both
buttons are reachable by keyboard, focus is visible, and pressing the current language does nothing.

**Dependencies:** task 1.

**Files:** `src/app.html`, `src/hooks.server.ts`, `src/hooks.client.ts`,
`src/routes/(public)/+page.svelte`, `lib/components/layout/LanguageSwitcher.svelte`,
`messages/en.json`, `messages/da.json`, `panda.config.ts`, `tests/e2e/i18n.test.ts`,
`docs/decisions.md` (D15), `AGENTS.md`, `docs/SPEC.md` (the testing section, the `smoke` Commands
row and the Design tokens note on focus).

**Size:** M.

## Checkpoint: after task 2

- [ ] Everything passes locally and in CI (`checks`, `smoke`, `contract`, `ci-ok`), and the built
  server serves and switches both languages.

## Task 3: formatting, subtitle-language names, and closing the work stream

**Description:** `formatNumber` and `formatDateTime` in `lib/shared/i18n/format.ts`, browser-safe,
in the current language, with the time zone required, and `languageName` in
`lib/shared/i18n/language-name.ts`, which names subtitle languages in the current language. This
task also closes the work stream. (obzorarr's #300, this app's language names, and #301's close.)

**Acceptance criteria:**
- [ ] `format.test.ts` runs both formatters inside `paraglideMiddleware` with a request for each
  language: `da` formats as `da`, and `en` as `en-GB`, with the day first and a 24-hour clock.
- [ ] `formatDateTime` follows the zone it is given, not the machine's, and its type refuses a
  call without `timeZone` (an `@ts-expect-error` case).
- [ ] `language-name.test.ts`, the same way, written first: `sv`, `zh-CN`, `zh-TW` and `pt-BR`
  are named in English and in Danish as `Intl.DisplayNames` names them, through `format.ts`'s
  mapping (`intlLocale()`, `en` as `en-GB`); a malformed code (`""`, `"not a code"`) and an
  unknown one (`"xx-yy"`) come back exactly as given, and nothing throws.
- [ ] The PR body lists every validation in the spec with its evidence or the PR that holds it.
- [ ] The end-of-work-stream cleanup is done:
  - the rest of the spec's "Docs this module changes when built" list, "locale" becoming
    "language" in D18, SPEC.md's capability-map note and row 3, and PRODUCT.md's Language bullet;
  - SPEC.md's status line names `i18n` as built (the map has no built marker), and the `i18n` line
    of "Open decisions each module closes" goes;
  - D19's "Still to validate" paragraph goes, with the outcome in the PR body;
  - AGENTS.md's status names `i18n` as built;
  - `tasks/` is deleted;
  - SPEC-i18n.md is reduced to what code and tests can't say, as obzorarr's #301 cut obzorarr's,
    keeping its opening lines that name obzorarr and what differs, "Where it shows", and, reduced
    the same way, the Subtitle-language names, the Bazarr callback and the focus ring;
  - the PR body maps every removed requirement to a test, a spec or an owner-approved removal.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek; CI's `checks`,
`smoke`, `contract` and `ci-ok`.

**Dependencies:** tasks 1 and 2.

**Files:** `lib/shared/i18n/format.ts`, `format.test.ts`, `lib/shared/i18n/language-name.ts`,
`language-name.test.ts`, `docs/SPEC.md`, `docs/SPEC-i18n.md`, `docs/decisions.md`, `PRODUCT.md`,
`AGENTS.md`, `tasks/`.

**Size:** M.
