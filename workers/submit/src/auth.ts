import { jwtVerify } from "jose";

export interface AuthedUser {
  sub: string; // auth.users.id
  email?: string;
  role?: string;
}

/**
 * Verify a Supabase user JWT (HS256 signed with the project's JWT secret).
 * Throws on invalid/expired tokens. Returns minimal claims used by /submit.
 */
export async function verifySupabaseJwt(token: string, secret: string): Promise<AuthedUser> {
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
