/**
 * Supabase token verification for the safety layer — implementation shared
 * across workers in ../../_shared/supabase-jwt.ts (HS256 offline first,
 * GoTrue fallback, fail-closed). This adapter passes the worker's KV
 * namespace so positive GoTrue results are cached 60s, keeping
 * per-keystroke autocomplete fast.
 */
import { authenticatedUserId as sharedAuthenticatedUserId } from "../../_shared/supabase-jwt";
import type { Env } from "./index";

export function authenticatedUserId(request: Request, env: Env): Promise<string | null> {
	return sharedAuthenticatedUserId(request, env, env.SESSION_CACHE);
}

export async function isAuthenticatedRequest(request: Request, env: Env): Promise<boolean> {
	return (await authenticatedUserId(request, env)) !== null;
}
