import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { logUnexpectedError } from "#lib/server/logging/unexpected-error.ts";
import { startUp } from "#lib/server/services/setup/startup.ts";
import { building, dev } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env, { dev });
};

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);

/**
 * Every error a load, action or endpoint throws goes through the logger, redacted, instead of
 * SvelteKit's default `console.error`; returning nothing keeps SvelteKit's own message.
 */
export const handleError: HandleServerError = ({ kind, error, event }) =>
	logUnexpectedError({ kind, error, url: event.url });
