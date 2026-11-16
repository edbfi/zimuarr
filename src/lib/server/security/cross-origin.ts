/** The parts of a request the cross-origin check reads. */
export type CrossOriginRequest = {
	readonly method: string;
	/** The request's path, without its query, as SvelteKit's `event.url.pathname` gives it. */
	readonly path: string;
	readonly headers: Headers;
	/** An internal `event.fetch` subrequest, which never came from a browser. */
	readonly isSubRequest: boolean;
};

/** Methods that change nothing, which the check lets through. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The routes a machine calls with neither `Origin` nor `Sec-Fetch-Site`, each with credentials of
 * its own that its route checks (SPEC-setup.md, "The cross-origin check"): Bazarr's callback,
 * with its `X-Api-Key` (D20, D25). `api-keys` adds the versioned JSON API. The setup gate lets
 * their paths through too.
 */
export const MACHINE_ROUTES: readonly { readonly method: string; readonly path: string }[] = [
	{ method: "POST", path: "/bazarr/api/translate/content" },
];

/** Whether `method` and `path` are one of the machine routes, matched exactly. */
function isMachineRoute(method: string, path: string): boolean {
	return MACHINE_ROUTES.some((route) => route.method === method && route.path === path);
}

/** `Sec-Fetch-Site` values that mean the request came from the app itself, or the user. */
const OWN_SITE = new Set(["same-origin", "none"]);

/**
 * Whether a request may go on (SPEC-setup.md, "The cross-origin check"). It asks the browser, so
 * the app needn't know its own address; `origin` is `ORIGIN`, parsed, when it is set.
 * - GET, HEAD, OPTIONS and internal subrequests pass; every other method is checked, whatever its
 *   content type.
 * - A present `Origin` must be one bare http or https origin, on every branch.
 * - With `ORIGIN` set, a present `Origin` must equal it; without `Origin`, `Sec-Fetch-Site` must
 *   be `same-origin` or `none`.
 * - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`;
 *   otherwise `Origin`'s host and port must equal `Host`, with default ports normalised.
 * - A request with neither header doesn't come from a browser: it passes only on a machine route,
 *   on to that route's own key check, and is refused everywhere else. This comes before the
 *   `ORIGIN` branches, which would refuse it on their own (SPEC-setup.md).
 */
export function crossOriginAllowed(
	request: CrossOriginRequest,
	origin: string | undefined,
): boolean {
	if (SAFE_METHODS.has(request.method.toUpperCase()) || request.isSubRequest) return true;
	const originHeader = request.headers.get("origin");
	const site = request.headers.get("sec-fetch-site");
	if (originHeader === null && site === null) {
		return isMachineRoute(request.method.toUpperCase(), request.path);
	}
	const sent = originHeader === null ? undefined : parseOrigin(originHeader);
	if (sent === null) return false;

	if (origin !== undefined) {
		if (sent !== undefined) return sent.origin === origin;
		return site !== null && OWN_SITE.has(site);
	}
	if (site !== null) return OWN_SITE.has(site);
	if (sent === undefined) return false;
	return sameHost(sent, request.headers.get("host"));
}

/**
 * One bare origin as browsers send it: `http://` or `https://`, a host (a bracketed IPv6 address
 * or a name with no separators), and an optional port. The URL parser repairs `https:host`,
 * backslashes and a bare trailing colon, so the raw text is checked first.
 */
const BARE_ORIGIN = /^https?:\/\/(\[[0-9a-f:.]+\]|[^/\\?#@,:\s[\]]+)(:\d+)?$/i;

/**
 * An `Origin` header as a URL, or null when it isn't one bare http or https origin: `null`, a
 * malformed value, several values (joined with commas), credentials, or anything after the host.
 */
function parseOrigin(value: string): URL | null {
	if (!BARE_ORIGIN.test(value)) return null;
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

/** Whether `Host` names `origin`'s host and port, read with `origin`'s default port. */
function sameHost(origin: URL, host: string | null): boolean {
	if (host === null || host === "") return false;
	try {
		return new URL(`${origin.protocol}//${host}`).host === origin.host;
	} catch {
		return false;
	}
}
