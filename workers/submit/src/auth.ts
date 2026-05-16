import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthedUser {
  sub: string; // auth.users.id
  email?: string;
  role?: string;
}

// JWKS cache lives as long as the worker isolate. createRemoteJWKSet does
// its own internal caching with a sensible default cooldown.
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function getJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  if (jwksCache && jwksUrl === url) return jwksCache;
  jwksUrl = url;
  jwksCache = createRemoteJWKSet(new URL(url));
  return jwksCache;
}

/**
 * Verify a Supabase user JWT.
 *
 * Modern Supabase projects use asymmetric signing (ES256/RS256) via JWKS,
 * which means the worker only needs the public URL — never the signing key.
 * Legacy projects still use HS256 with a symmetric secret shared between
 * Supabase and any verifier. We try JWKS first, falling back to HS256 so
 * the worker keeps working during the migration window.
 *
 * Once the project has rotated entirely to asymmetric keys, drop the HS256
 * branch and remove SUPABASE_JWT_SECRET from worker env.
 */
export async function verifySupabaseJwt(
  token: string,
  secret: string,
  supabaseUrl?: string,
): Promise<AuthedUser> {
  // Try JWKS first (preferred path).
  if (supabaseUrl) {
    try {
      const jwks = getJwks(supabaseUrl);
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ["ES256", "RS256"],
      });
      if (!payload.sub || typeof payload.sub !== "string") {
        throw new Error("token missing sub");
      }
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        role: typeof payload.role === "string" ? payload.role : undefined,
      };
    } catch (err) {
      // JWKS failed — could be: project hasn't enabled asymmetric signing
      // yet, OR token is genuinely invalid. Fall through to HS256 to find
      // out which.
      if (!secret) throw err;
    }
  }

  // HS256 fallback.
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
  });
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("token missing sub");
  }
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
  };
}

export function extractBearer(request: Request): string | null {
  const h = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? (m[1] ?? null) : null;
}
