import { checkHealth, healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => healthResponse(await checkHealth());
