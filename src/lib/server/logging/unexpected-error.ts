import { createLogger } from "./logger.ts";

const log = createLogger("request");

/** What SvelteKit's server `handleError` hands over, cut down to what is logged. */
export type CaughtError = {
	/** SvelteKit's category: `unknown` for an error the app's code threw, or its own kinds. */
	readonly kind: string;
	readonly error: unknown;
	readonly url: URL;
};

/**
 * Logs an error from a page load, form action or endpoint through the logger, so it is redacted
 * and one JSON line, never SvelteKit's default `console.error` of the stack (SPEC-setup.md,
 * "Logging"). An unknown error, or one with a status of 500 or more, is an error entry; the rest,
 * such as a scanner's 404 or the app's own `error(404)`, a debug entry. Only the path is logged,
 * never the query. It returns nothing, so the browser gets SvelteKit's own message, which for an
 * unknown error is the generic "Internal Error", never the error's text.
 */
export function logUnexpectedError({ kind, error, url }: CaughtError): void {
	// An unknown error is SvelteKit's 500, whatever fields it carries; its own errors have a status.
	const status = kind === "unknown" ? 500 : statusOf(error);
	const metadata = { kind, status, path: url.pathname, error };
	if (status === undefined || status < 500) log.debug("unexpected error", metadata);
	else log.error("unexpected error", metadata);
}

/** The status SvelteKit gave its own errors, when it gave one. */
function statusOf(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
	return typeof error.status === "number" ? error.status : undefined;
}
