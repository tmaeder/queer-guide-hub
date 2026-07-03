/**
 * Supabase token verification (safety layer) — shared implementation in
 * ../../_shared/supabase-jwt.ts. No KV cache here: assistant turns are
 * low-frequency, a per-turn verify is fine.
 */
export { isAuthenticatedRequest } from "../../_shared/supabase-jwt";
