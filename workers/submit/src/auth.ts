/**
 * Supabase user-JWT verification — shared jose-based implementation in
 * ../../_shared/supabase-jwt-jose.ts (JWKS ES256/RS256 first, HS256 legacy
 * fallback). This adapter binds the worker's own `jose` import and keeps the
 * call signature index.ts already uses.
 */
import * as jose from "jose";
import {
  createSupabaseJwtVerifier,
  extractBearer,
  type AuthedUser,
} from "../../_shared/supabase-jwt-jose";

export type { AuthedUser };
export { extractBearer };

const verify = createSupabaseJwtVerifier(jose);

export async function verifySupabaseJwt(
  token: string,
  secret: string,
  supabaseUrl?: string,
): Promise<AuthedUser> {
  return verify(token, { supabaseUrl, jwtSecret: secret });
}
