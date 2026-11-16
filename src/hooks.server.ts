import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence,
} from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { logUnexpectedError } from "#lib/server/logging/unexpected-error.ts";
import { accessDenied } from "#lib/server/security/access-denied.ts";
import { crossOriginAllowed } from "#lib/server/security/cross-origin.ts";
import { securityHeaders, withSecurityHeaders } from "#lib/server/security/headers.ts";
import { currentOrigin, startUp } from "#lib/server/services/setup/startup.ts";
import { building, dev } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env, { dev });
};

/** Each request's language (SPEC-i18n.md); it refuses nothing. */
const language: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);

/**
 * The security headers on every response from here on, an early return from a later stage too.
 * The response object gets them without its body being read, so Bazarr's held callback keeps
 * streaming (SPEC-setup.md, "Bazarr's callback").
 */
const headers: Handle = async ({ event, resolve }) =>
	withSecurityHeaders(await resolve(event), securityHeaders(event.request, currentOrigin()));

/**
 * The cross-origin check on every state-changing request, which replaces SvelteKit's own form
 * check; a refusal is returned, never thrown, so it keeps the language and the headers. Bazarr's
 * callback, with neither browser header, goes on to its own key check (SPEC-setup.md).
 */
const crossOrigin: Handle = ({ event, resolve }) =>
	crossOriginAllowed(
		{
			method: event.request.method,
			path: event.url.pathname,
			headers: event.request.headers,
			isSubRequest: event.isSubRequest,
		},
		currentOrigin(),
	)
		? resolve(event)
		: accessDenied(event.request);

export const handle = sequence(language, headers, crossOrigin);

/**
 * Every error a load, action or endpoint throws goes through the logger, redacted, instead of
 * SvelteKit's default `console.error`; returning nothing keeps SvelteKit's own message.
 */
export const handleError: HandleServerError = ({ kind, error, event }) =>
	logUnexpectedError({ kind, error, url: event.url });
