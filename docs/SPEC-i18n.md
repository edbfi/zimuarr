# Spec: `i18n`

**Status:** awaiting the owner's approval. Module 3 of the capability map ([docs/SPEC.md](SPEC.md)),
after `contract-spike` and `secrets`. D18 and D19 hold the decisions.

**Ported from obzorarr,** the reference app for `i18n`
([Shared groundwork](../AGENTS.md#shared-groundwork)): its spec as approved
(`f41c712:docs/SPEC-i18n.md`), the message rules its #301 added, and its code and tests at
`7368cff`.
What differs here:
- **the placeholder's text:** zimuarr's own heading and paragraph, with the app's name passed in
  ([Messages](#messages));
- **subtitle-language names,** a helper obzorarr doesn't have: `lib/shared/i18n/language-name.ts`
  names the languages the Bazarr boundary produces, in the viewer's language (D18,
  [Subtitle-language names](#subtitle-language-names));
- **time zones:** zimuarr has no instance zone, so each caller of `formatDateTime` passes the zone
  its own module's spec names ([Formatting](#formatting));
- **the Bazarr callback,** which the language handle wraps from the build's second PR on
  ([The Bazarr callback](#the-bazarr-callback));
- **the switcher's place:** at the top of the placeholder `/`, and no brief gains it, because
  zimuarr has no `/` brief; each shell places it when that shell is built;
- **the global focus ring,** which lands with the switcher, zimuarr's first focusable control;
- **what isn't translated:** prompts and glossaries (D18), subtitle-language names and the
  callback's answers join obzorarr's list;
- **the toolchain:** Vitest's separate `unit` and `contract` projects and the contract scripts stay,
  and newer Biome, Vite, Vitest and Panda than obzorarr's mean its evidence is run again
  ([Validation](#validation));
- **the decision numbers:** obzorarr's D21, D22, D16 and D2 are zimuarr's D18, D19, D15 and D2, and
  D27 is the dependencies decision. obzorarr's instance-zone rule (its D24) has no counterpart.

## Objective

Every later module writes its user-facing text as messages in English and Danish, and shows numbers,
dates and subtitle languages for the viewer's language (D18). `i18n` builds that groundwork, and no
product text beyond the placeholder page:
1. **Messages** in `messages/en.json` and `messages/da.json`, which Paraglide JS compiles into typed
   message functions (D19).
2. **Choosing the language:** each request uses the viewer's choice, then the browser's preferred
   languages, then English. The browser keeps the language the server chose for the page.
3. **The language switcher.**
4. **Formatting** numbers, dates and times for the viewer's language, and **naming subtitle
   languages** in it.
5. **The message check:** every message exists in both languages, with the same placeholders and
   the plural forms each language needs.

It also runs the validations D19 lists.

## Versions

`@inlang/paraglide-js` and `@inlang/plugin-i18next`, exact-pinned dev dependencies, at their newest
stable releases when they join (D27): 3.2.1 and 6.5.3 on 2026-11-08, the same as obzorarr's. D19
chose both packages, and the owner's approval of this spec approves adding them (AGENTS.md, "Ask
first"). The owner approved Paraglide JS 3 for obzorarr on 2026-11-06, and D27 asks for the newest
major. Version 3's breaking changes touch nothing here: the `additionalFiles` option and the
middleware's locale splitting are gone, and Vite builds default to a new output layout, which the
config below sets explicitly. TypeScript stays on 6.x (D2): Paraglide 3 writes its declarations
itself and needs no TypeScript.

## Messages

**The files** are i18next JSON v4 (D19): one flat object per language, formatted by Biome like the
rest of the repo.

**Message names** match `^[a-z][a-z0-9]*(_[a-z0-9]+)+$`: snake_case, starting with the module or
surface that owns them (`placeholder_title`, `error_not_found_title`). So each is a JavaScript name,
`m.placeholder_title()`, and Paraglide's escaped names and the `m["a.b"]()` form of nested keys
never appear.
- **Plural forms:** a key that ends in a CLDR plural category (`_zero`, `_one`, `_two`, `_few`,
  `_many`, `_other`) is a plural form of the message named by the rest of the key
  (`inventory_subtitles_one` belongs to `inventory_subtitles`), and no other key ends in one. A
  message is either one key or plural forms, never both.
- **`_ordinal`:** no key contains `_ordinal_`, which the plugin reads as an ordinal plural.
- **Renaming:** once Weblate is connected, keys aren't renamed, because translations are tied to
  them.

**Placeholders** are `{{name}}`.
- A count or quantity is written `{{name, number}}`, which Paraglide formats with
  `Intl.NumberFormat` in the message's language ("1,234 subtitles", "1.234 undertekster"). A bare
  `{{count}}` would print "1234".
- A number that is a name rather than a quantity, such as a year, is a bare `{{year}}`: the
  `number` format would print "2,025".
- No format other than `number` is allowed. In particular, Paraglide compiles
  `{{name, datetime}}` to `Intl.DateTimeFormat` with no time zone, which formats in the zone of
  whatever machine runs it. Dates are formatted with `formatDateTime` (below) and passed in as text.
- A number in a message that states how the app behaves (a limit, a duration, a count) is passed in
  from the constant the logic uses, never written into the text, so the copy can't drift from the
  behaviour.

**Plurals** are `<name>_one` and `<name>_other`, chosen by `count`. English and Danish both have
exactly these two categories (`Intl.PluralRules`). Danish uses `one` for every number below 2 except
0 (0.5 and 1.5 included), so every plural form keeps `{{count, number}}` rather than writing the
number out ("1 time" would misstate 1.5 hours).

**Messages are plain text.** They are rendered as text, never with `{@html}`, so a placeholder
filled with a name can't inject markup.
- **No tags:** the plugin reads anything shaped like a tag (`<address>`, `<br/>`, `</b>`) as markup,
  and Paraglide drops it from the text without a warning: `ORIGIN=<address>` renders as `ORIGIN=`. A
  value to fill in is a placeholder (`ORIGIN={{address}}`).
- **Markup inside a message,** such as a link in a sentence, is left to the first module that needs
  it.

**Not translated through the messages:**
- the name Zimuarr: where a message contains it, it is a placeholder filled with the literal name,
  so the files leave it out and a translator can't change it;
- text the owner writes, such as prompts and glossaries, which is content (D18);
- subtitle-language names, which come from `Intl.DisplayNames`
  ([Subtitle-language names](#subtitle-language-names));
- the Bazarr callback's answers, which Bazarr reads, its `{ "error": … }` strings included.
  Answers meant for people, such as the cross-origin check's refusals, stay messages (`sign-in`);
- log entries and console output, which are for operators and stay in English;
- the switcher's language names (below).

**The placeholder page's messages:** `placeholder_title` is `{{name}} is being rebuilt.` (`{{name}}
bliver bygget om.`), filled with `Zimuarr`, and `placeholder_status` is the paragraph below it.
The English renders exactly as the page reads now, so the smoke test is unchanged.
`<title>Zimuarr</title>` stays as it is.

**Who writes them:** agents write the English and the Danish. The owner may spot-check the Danish
but doesn't approve it, and Weblate corrects it later.

**The inlang project** is `project.inlang/settings.json`:

```json
{
	"$schema": "https://inlang.com/schema/project-settings",
	"baseLocale": "en",
	"locales": ["en", "da"],
	"modules": ["./node_modules/@inlang/plugin-i18next/dist/index.js"],
	"plugin.inlang.i18next": { "pathPattern": "./messages/{locale}.json", "contextValues": [] }
}
```

- **The plugin loads from disk,** so nothing is fetched at build time or in CI.
- `"contextValues": []` turns off the plugin's guess at i18next contexts, which would read a key
  such as `title_short` next to `title` as a variant of `title`.

**Paraglide's options** are in `project.inlang/paraglide.config.ts`, which both the CLI and the Vite
plugin read, so they are kept in one place:

```ts
import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
	outdir: "./src/lib/paraglide",
	strategy: ["cookie", "preferredLanguage", "baseLocale"],
	cookieSameSite: "lax",
	cookieSecure: "auto",
	emitTsDeclarations: true,
	outputStructure: "message-modules",
});
```

- `outputStructure` is set because the CLI and the Vite plugin would otherwise write different
  layouts into the same folder: the Vite plugin's default (`virtual-modules`) is one the CLI can't
  write. Running `check` beside `dev` would then rewrite the folder under the dev server.
- The plugin is added to `vite.config.ts` as `paraglideVitePlugin({ project: "./project.inlang" })`,
  with nothing else. The Vitest projects inherit it (`extends: true`), so both `unit` and
  `contract` compile the messages.
- `tsconfig.json` includes `project.inlang/*.ts`, so `check` type-checks the config.

**Generated files** are gitignored by two root `.gitignore` lines, which Biome also honours:
- `src/lib/paraglide/`, the compiled output;
- `project.inlang/cache/`, where Paraglide 3 keeps its compile cache. It writes no `.gitignore` of
  its own there, and without the line `lint` fails on the cache files.

**The compiled output** compiles in `prepare` and in `check` (the CLI, before `svelte-check`), and
through the Vite plugin in dev, build (the contract scripts' build included) and Vitest. Panda's
`exclude` skips it.
- **`#lib/paraglide/messages.js` and `#lib/paraglide/runtime.js`** are browser-safe.
- **`#lib/paraglide/server.js`,** the middleware, loads `async_hooks` for AsyncLocalStorage. In app
  code only `src/hooks.server.ts` imports it; `format.test.ts` and `language-name.test.ts` use it to
  set each request's language.
- **The import rules:** the output is generated code that imports nothing from the app. It isn't one
  of the app's layers, so `lib/shared/`, components, services and routes import it as they import
  `#styled-system`.
- **A message that doesn't exist** is a type error that `check` reports.

## Choosing the language

**On the server,** `handle` in `src/hooks.server.ts` runs every request through
`paraglideMiddleware`:
- **The order:** the `PARAGLIDE_LOCALE` cookie when it holds `en` or `da`; any other value is
  ignored. Then the best match in `Accept-Language` (`da-DK` gives `da`). Then English. There are no
  URL prefixes.
- **One request, one language:** the language is held in AsyncLocalStorage for that request, so
  concurrent requests can't mix.
- **The request:** the middleware's copy of the request is passed on a copy of the event, because
  `event.request` is read-only in SvelteKit 3. The event is a plain object, so the copy keeps every
  field, and form actions and endpoints read their body from it.
- **`<html lang>`:** `transformPageChunk` writes the language into `src/app.html`'s
  `<html lang="%lang%">`. That attribute needs a Biome suppression comment
  (`lint/a11y/useValidLang`) just above it. The comment must not contain the `%lang%` token itself:
  `replace` swaps only the first occurrence, so the token in the comment would be filled in and the
  attribute left as it was.
- **Caching:** the middleware adds `Vary: Cookie, Accept-Language` to every response. No page is
  prerendered, since a prerendered page would have one language for everyone.
- **First in `handle`:** the language handle refuses nothing and never reads the body. Later modules
  add their stages after it with `sequence`. Errors thrown while rendering a route reach
  `+error.svelte` in the viewer's language.

**A later stage that refuses a request returns its response; it never throws.** An error thrown out
of a `handle` stage, `error(403)` included, leaves the middleware. SvelteKit then renders its
fallback page in English, without `<html lang>` or `Vary`.
A response returned from inside the chain is still in the request's language and gets `Vary`, but it
skips `transformPageChunk`, so a refusal page that a stage builds sets its own `<html lang>`. This
binds `setup`'s gate and `sign-in`'s refusals, the cross-origin check's included.

**In the browser,** `src/hooks.client.ts` reads the page's `<html lang>` once, when the app starts,
and makes Paraglide's `getLocale()` return it, or English if it isn't `en` or `da`. The server's
choice holds for the whole page, until it reloads. It is read once because a browser's page
translation can rewrite `<html lang>` later.
- **Why:** without the hook, Paraglide's browser runtime would choose again from
  `navigator.languages`, which needn't match the `Accept-Language` header the server saw.
- **The unasked cookie:** on its first call, the runtime would also store whatever it chose in the
  cookie. The browser's language would become a stored choice the viewer never made, and a later
  change of browser language would no longer count (D18's order).

**An accepted limit:** a tab keeps its language until it reloads. If the viewer switches language in
another tab, text that a server `load` or action returns to the first tab follows the new cookie
until that tab reloads.

### The Bazarr callback

`POST /bazarr/api/translate/content` (`routes/bazarr/api/translate/content/+server.ts`) holds its
`200` open while the work runs (D25), and from the build's second PR the language handle wraps it
like every other request. Read from `@inlang/paraglide-js` 3.2.1's middleware:
- it passes the endpoint a copy of the request made with `request.clone()`, so the callback reads
  Bazarr's JSON body from the copy, as it reads it now;
- it awaits only the `Response` object, never its body, so the held response streams its spaces and
  its answer as it does now; the work keeps running in the request's AsyncLocalStorage context;
- it adds `Vary: Cookie, Accept-Language` to the held response's headers;
- whatever language the request gets, nothing the callback answers is a message.

The evidence that the callback and its held answers haven't changed is the contract job
(`contract:up`, `contract`, `contract:down`): CI's `contract` job runs every case but C5 on each
build PR that touches code, and the weekly run adds C5.

## The language switcher

`src/lib/components/layout/LanguageSwitcher.svelte` is a labelled group of native buttons, one per
language, styled only with tokens. The group's label is a message. The owner chose buttons over a
`<select>` for obzorarr (2026-11-06): in Chrome and Edge on Windows and Linux, an arrow key on a
closed `<select>` fires `change`, so a keyboard user looking at the options would be switched and
lose focus (WCAG 2.2, 3.2.2 On Input).
- **The buttons:** each names its language in that language ("English", "Dansk"), with `lang` on
  the button. The current language's button has `aria-current="true"`, and pressing it does
  nothing. The names come from `Intl.DisplayNames`, with the first letter upper-cased in that
  language, through a helper private to the component (`ownName`). They are the same in every
  language, so they aren't messages, and a viewer who can't read the current language still finds
  their own. Subtitle-language names are the other helper's (below), which names a language in the
  viewer's language instead.
- **Pressing another language** calls Paraglide's `setLocale`, which writes `PARAGLIDE_LOCALE` and
  reloads the page in the new language. The cookie has path `/`, lasts about 400 days and is
  `SameSite=Lax`. It is `Secure` exactly when the page is on `https` (`cookieSecure: "auto"`), as
  `sign-in`'s cookie rule asks.
- **Who writes the cookie:** only the browser, so it is readable by scripts, and it holds only a
  language. The server only reads it.
- **Sharing the cookie:** it keeps Paraglide's default name. Cookies ignore ports, so every app on
  the same host shares it. A choice made in one edbfi app carries over to the others there. A value
  another app wrote that isn't `en` or `da` is ignored.
- **Without JavaScript** the switcher does nothing, and the browser's preferred languages still
  apply.
- **Keyboard focus** is one global rule in Panda's `globalCss`: DESIGN.md's 2px `secondary` ring
  with a 2px offset on every `:focus-visible` element. The switcher's buttons are zimuarr's first
  focusable controls, no spacing token is 2px (`strictTokens` refuses a raw offset in `css()`), and
  one rule keeps the ring the same on every control from now on.
- **Where it shows:** at the top of the placeholder `/`, on its own row before the heading, so a
  viewer who can't read the current language finds it first. zimuarr has no brief for `/`, so no
  brief gains it in this module: each shell places it when that shell is built (row 3's "the
  language switcher in each shell"), and that shell's brief gains it then. It needs no brief of its
  own.

## Formatting

`src/lib/shared/i18n/format.ts` is browser-safe and formats in the current language
(`getLocale()`), on the server and in the browser alike. The language picks the `Intl` locale, not
the browser's region, so server and browser always agree: `da` formats as `da`, and `en` as `en-GB`
(the owner's choice for obzorarr, 2026-11-06, which ports keep), with the day first and a 24-hour
clock ("05/11/2026, 23:30"). A message's `{{name, number}}` formats as `en`, which groups numbers
the same way.
- `formatNumber(value: number, options?: Intl.NumberFormatOptions)`: `Intl.NumberFormat`.
- `formatDateTime(value: Date, options: Intl.DateTimeFormatOptions & { timeZone: string })`:
  `Intl.DateTimeFormat`.
  - **The zone is required,** so nothing is formatted in the server's or the browser's own zone,
    which differ from each other and from the zone the owner means.
  - zimuarr has no instance zone. Each caller passes the zone its own module's spec names
    (`admission` decides the zone of dispatch windows and daily caps), or `"UTC"` for a calendar
    value such as a month's name. `i18n` sets no default zone.

Counts and quantities inside a message use `{{name, number}}` instead. Other formatters (relative
times, lists) come with the first module that needs one.

## Subtitle-language names

`src/lib/shared/i18n/language-name.ts` is browser-safe and names a subtitle language in the current
language: `languageName(code: string): string`, through
`Intl.DisplayNames([<the Intl locale>], { type: "language", fallback: "none" })`. Its own file,
because it changes for other reasons than the formatters; the language-to-`Intl`-locale mapping
(`en` as `en-GB`) stays in `format.ts`, which exports it as `intlLocale()`, so that fact is kept in
one place.
- **The form it takes** is a BCP 47 language tag, as a `string`. The codes it is built and tested
  for are D20's: a two-letter ISO 639-1 code (`sv`, `da`) or one of the regional tags `zh-CN`,
  `zh-TW` and `pt-BR`. Bazarr's three-letter codes are normalised at the Bazarr boundary
  (`bazarr-provider`, "At the boundary"), which decides its own form; a branded type waits for it.
- **The name** is `Intl.DisplayNames`' own, unchanged: "Swedish" and "svensk", "Brazilian
  Portuguese" and "brasiliansk portugisisk". Danish names are lower-case, so a screen that starts a
  line with one upper-cases it there.
- **Falling back:** a code `Intl.DisplayNames` refuses (it throws a `RangeError` on a tag that isn't
  well-formed) or doesn't know (`of()` returns `undefined` with `fallback: "none"`) comes back
  exactly as given, so a bad code from a later module shows as the code and never breaks the page.
  (`fallback: "code"` would return an unknown tag canonicalised, `xx-yy` as `xx-YY`.)

Forced and hearing-impaired variants aren't part of the name: the screens that show them name them
as messages.

## The message check

`src/lib/shared/i18n/messages.test.ts` holds the check and its tests. It sits in `src/` only because
Vitest's `unit` project runs `src/**`. The check finds every problem in a set of message files, and
the tests run it on `messages/*.json` and on small in-memory files that break each rule once. It
checks that:
- every language the project has (Paraglide's `locales`) has its file, and no file is for another
  language, which Paraglide would ignore without a word;
- each file is one JSON object of messages (not `null`, an array or a single value), and every
  value in it is a non-empty string (a value of only whitespace counts as empty), so the files stay
  flat;
- every message name fits the rule above, no key contains `_ordinal_`, and no message is both one
  key and plural forms;
- English and Danish have the same messages;
- every form of a message, in both languages, has the same placeholders, names and formats;
- no placeholder has a format other than `number`, the whole format compared (so
  `{{year, number, compact}}` is refused, where the plugin would silently keep only `number`);
- each plural message has exactly the forms `Intl.PluralRules(locale)` gives for each language, and
  every form contains `{{count, number}}`;
- no value holds anything shaped like a tag: everything the plugin reads as markup (`<b>`, `</b>`,
  `<br/>`, `<0>`), and any tag with a `name=` attribute anywhere in it, spaces around the `=`
  included. Plain angle brackets in prose (`1 < 2 and 3 > 2`, `I <3 you and > me`, `a<b and c>d`)
  pass, and so does a tag with only bare attributes (`<input disabled>`), which has the same shape
  as such prose and which the plugin shows as text rather than dropping.

Each rule has an in-memory file that breaks only it, the test asserting the exact list of problems,
and a file with several problems reports them all. It runs in the existing `tests` hook and in CI,
so no new hook is needed.

## Validation

The build runs D19's three validations, and a concurrency check, with the pinned versions:
- **The pinned versions with SvelteKit 3, TypeScript 6 and Bun:** `check`, `test`, `build`,
  `smoke` and prek pass with no Node on `PATH`.
- **Building and serving through adapter-bun:** `tests/e2e/i18n.test.ts`, against the built server
  started as the secrets spec requires (`bun --no-env-file ./build`, with the generated key only,
  through `playwright.config.ts`). It also closes D15's "browser interaction with a real
  component". It checks that:
  - a Danish browser (Playwright locale `da-DK`) gets `/` in Danish with `<html lang="da">` and
    `Vary: Cookie, Accept-Language`;
  - pressing "English" in the switcher reloads `/` in English, writes `PARAGLIDE_LOCALE=en` with
    `SameSite=Lax` and without `Secure` over plain HTTP, and the next visit stays in English;
  - a browser with locale `fr-FR`, whose `navigator.languages` an init script sets to `fr-FR`,
    `da-DK`, gets English, the switcher marks English as current after hydration, and no cookie is
    written. Playwright's `locale` sets both the header and `navigator.languages`, so only the
    script can split them;
  - none of these logs a console error.

  The existing smoke test keeps passing in English, Playwright's default locale.
- **The Bazarr callback:** the contract job, as [above](#the-bazarr-callback).
- **A Weblate round trip:** a one-off `uv run --script` with translate-toolkit's `I18NextV4File`.
  It reads `messages/da.json` with a temporary plural message that has `{{count, number}}` and
  another placeholder, changes it, and writes it back with one tab of indentation. Weblate's
  `json_indent: 1` with `json_indent_style: tabs` sets exactly that on the same class
  (`weblate/trans/file_format_params.py`). It passes when:
  - the file parses to the same JSON before the edit;
  - Biome finds nothing to reformat;
  - Paraglide compiles the result;
  - both plural forms render.
- **Concurrency:** it passes when 200 concurrent requests in both languages against the built
  server, through a temporary route that awaits a random delay in its `load`, each render in their
  own language.

**Run again, not cited.** obzorarr's #297 (the round trip and its probes) and #298 (the concurrency
script) ran on Vite 8.3.5 and Biome 2.6.4; zimuarr is on Vite 8.3.6 and Biome 2.6.5, with Vitest
and Panda newer too. So the build runs them itself rather than citing obzorarr's output. The rest
matched `7368cff` on 2026-11-08 and the build checks again: `@inlang/paraglide-js` 3.2.1,
`@inlang/plugin-i18next` 6.5.3, `@sveltejs/kit` 3.1.1, `@sveltejs/adapter-bun` 1.0.0, `typescript`
6.0.3, Bun 1.4.4, and `biome.json`.

The temporary message, route and scripts aren't committed; the scripts and their output go in the
build PR's body.

## Weblate

Connecting Weblate is later work (D18). The round trip fixes what the component needs:
- format `i18nextv4`, monolingual;
- file mask `messages/*.json`, with `messages/en.json` as the base file;
- file format parameters `json_indent: 1` and `json_indent_style: tabs`, with keys left unsorted,
  so its commits pass Biome.

## Project structure

```text
messages/en.json  messages/da.json            the messages (repo root, where Weblate reads them)
project.inlang/settings.json                   locales and the i18next plugin
project.inlang/paraglide.config.ts             Paraglide's options, for the CLI and the Vite plugin
src/app.html                                   <html lang="%lang%">, with the Biome suppression
src/hooks.server.ts                            gains `handle`: the language handle
src/hooks.client.ts                            the browser keeps the page's language
src/lib/shared/i18n/format.ts                  formatNumber, formatDateTime, intlLocale (+ its test)
src/lib/shared/i18n/language-name.ts           languageName (+ language-name.test.ts)
src/lib/shared/i18n/messages.test.ts           the message check
src/lib/components/layout/LanguageSwitcher.svelte
src/routes/(public)/+page.svelte               the placeholder's text as messages, and the switcher
tests/e2e/i18n.test.ts                         serving both languages, the switcher
```

The build also changes:
- `package.json`: the two packages, and the Paraglide compile in `prepare` and `check`, after
  `svelte-kit sync` and before Panda's codegen;
- `vite.config.ts`: the plugin, beside the `unit` and `contract` projects, which stay;
- `tsconfig.json`: `project.inlang/*.ts`;
- `panda.config.ts`: `exclude`, and the focus ring in `globalCss`;
- `.gitignore`: the two generated folders.

## Code style

As in [docs/SPEC.md](SPEC.md#code-style). The hooks stay thin:

```ts
// src/hooks.server.ts (the `init` hook stays as it is)
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);
```

```ts
// src/hooks.client.ts
import { baseLocale, isLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

// The page keeps the language the server chose for it (SPEC-i18n.md, "Choosing the language").
const lang = document.documentElement.lang;
const locale = isLocale(lang) ? lang : baseLocale;
overwriteGetLocale(() => locale);
```

## Testing strategy

- **Unit (Vitest's `unit` project):**
  - the message check;
  - `format.test.ts`, which runs the formatters inside `paraglideMiddleware` with a request for each
    language (the language comes from the request, as in the app), and checks that English dates
    format as `en-GB` and that `formatDateTime` follows the time zone it is given, not the
    machine's, and that its type refuses a call without `timeZone`;
  - `language-name.test.ts`, the same way: each form of code in both languages (`sv`, `zh-CN`,
    `zh-TW`, `pt-BR`), and a malformed and an unknown code coming back exactly as given, without
    throwing.
- **e2e (Playwright, against the built server):** `i18n.test.ts` as listed under
  [Validation](#validation); `smoke.test.ts` unchanged.
- **Contract:** the existing cases, unchanged, against the callback behind the language handle.
- **One-off evidence in the PR body:** the Weblate round trip and the concurrency check.

## Commands

The ground floor's commands ([docs/SPEC.md](SPEC.md#commands)). `prepare` and `check` also compile
the messages, so a fresh clone type-checks without a dev server having run.

## Boundaries

- **Always:** every user-facing string as a message in both languages (titles, labels, alt text and
  accessible names included); counts and quantities in messages as `{{name, number}}`; dates through
  `formatDateTime` with an explicit zone; subtitle languages through `languageName`; messages
  rendered as text; refusals in `handle` returned, never thrown.
- **Ask first:** another language; another message format or Paraglide's URL strategy; markup inside
  messages; any dependency beyond the two packages.
- **Never:** text written into a component or service; `{{name, datetime}}` or a tag in a message;
  a prerendered page with translated text; the server writing the language cookie; connecting
  Weblate in this module.

## Docs this module changes when built

- **`docs/SPEC.md`:**
  - the status line names `i18n` as built (the capability map has no built marker);
  - the `i18n` line of "Open decisions each module closes" goes;
  - the tech-stack table gains both packages;
  - the setup fact on `prepare` and `check` gains the compile;
  - the Commands rows for `bun ci` and `check` gain the compile, and the `smoke` row the language
    tests;
  - the testing section gains the new tests;
  - the Design tokens section gains the focus ring.
- **`docs/decisions.md`:** D19's "Still to validate" paragraph goes, with the outcome in the PR
  body; D15 drops browser interaction with a real component.
- **"The viewer's locale"** becomes "the viewer's language" in D18 (twice), SPEC.md's
  capability-map note and row 3, and "the operator's locale" becomes "the operator's language" in
  PRODUCT.md's Language bullet.
- **PRODUCT.md:** "What does not exist" names `i18n` beside the ground floor, the spike and
  `secrets`.
- **AGENTS.md:** the status and the structure tree.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke`, `contract` and `ci-ok` pass.
2. The built server serves `/` in Danish to a Danish browser and in English otherwise, and the
   switcher changes it. `/healthz` is unchanged, and so are the callback's answers.
3. `languageName` names each form of subtitle-language code in both languages and never throws.
4. The validations have passed, with their evidence in the build PRs' bodies.
5. The docs listed above say what was built.
