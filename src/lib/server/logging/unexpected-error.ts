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
 * "Logging"). An unknown error, or one of SvelteKit's own with a status of 500 or more, is an
 * error entry; the rest is a debug entry: a scanner's 404, and the app's own `error(…)`, which
 * reaches the hook without its status, so the module that throws one logs its own cause. Only the
 * path is logged, never the query. It returns nothing, so the browser gets SvelteKit's own message,
 * which for an unknown error is the generic "Internal Error", never the error's text. It never
 * throws: SvelteKit would print the raw error if it did.
 */
export function logUnexpectedError({ kind, error, url }: CaughtError): void {
	try {
		// An unknown error is SvelteKit's 500, whatever fields it carries; its own errors have a
		// status, except the app's `error(…)`, whose body alone reaches the hook.
		const status = kind === "unknown" ? 500 : statusOf(error);
		const metadata = { kind, status, path: url.pathname, error };
		if (status === undefined || status < 500) log.debug("unexpected error", metadata);
		else log.error("unexpected error", metadata);
	} catch {
		// Only fixed text: the error itself is what couldn't be logged safely.
		console.error(`handleError couldn't log an error of kind ${JSON.stringify(kind)}`);
	}
}

/** The status SvelteKit gave its own errors, when it gave one. */
function statusOf(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
	return typeof error.status === "number" ? error.status : undefined;
}
