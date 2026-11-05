import { answerCallback } from "#lib/server/services/translation/callback-work.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ request }) => answerCallback(request);
