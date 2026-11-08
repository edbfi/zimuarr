import { intlLocale } from "./format.ts";

/**
 * A subtitle language's name in the current language, from a BCP 47 tag such as D20's `sv` or
 * `pt-BR` ("Swedish", "brasiliansk portugisisk"). The name is `Intl.DisplayNames`' own, unchanged:
 * Danish names are lower-case, so a screen that starts a line with one upper-cases it there. A tag
 * that `Intl` refuses or doesn't know comes back exactly as given (SPEC-i18n.md, "Subtitle-language
 * names").
 */
export function languageName(code: string): string {
	try {
		const names = new Intl.DisplayNames([intlLocale()], { type: "language", fallback: "none" });
		return names.of(code) ?? code;
	} catch {
		// A tag that isn't well-formed: `of()` throws a RangeError.
		return code;
	}
}
