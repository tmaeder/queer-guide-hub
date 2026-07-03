/**
 * Shared jose-based verification of Supabase user JWTs for Cloudflare Workers
 * that need asymmetric-signing support (submit, image-cdn). `jose` resolves
 * from the importing worker's own node_modules at bundle time.
 *
 * Verification order:
 *   1. JWKS (ES256/RS256) — modern Supabase asymmetric signing; only needs the
 *      public {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
 *   2. HS256 — legacy symmetric secret, when configured.
 *   3. GoTrue /auth/v1/user — optional network fallback with whatever API key
 *      the worker holds (anon is fine); GoTrue verifies server-side.
 * Throws when no path validates the token. Once the project has rotated
 * entirely to asymmetric keys, drop the HS256 branch and remove
 * SUPABASE_JWT_SECRET from worker env.
 *
 * The dependency-free sibling `supabase-jwt.ts` (HS256 + GoTrue, boolean,
 * fail-closed) serves search-proxy and assistant.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthedUser {
	sub: string; // auth.users.id
	email?: string;
	role?: string;
}

export interface JoseVerifyOptions {
	supabaseUrl?: string;
	/** Symmetric legacy secret (SUPABASE_JWT_SECRET). */
	jwtSecret?: string;
	/** API key for the GoTrue fallback (anon or service). Omit to disable it. */
	authApiKey?: string;
	/** Timeout for the GoTrue fallback, ms. */
	authApiTimeoutMs?: number;
}

// JWKS cache lives as long as the worker isolate. createRemoteJWKSet does its
// own internal caching with a sensible default cooldown.
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function getJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
	const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
	if (jwksCache && jwksUrl === url) return jwksCache;
	jwksUrl = url;
	jwksCache = createRemoteJWKSet(new URL(url));
	return jwksCache;
}

function toAuthedUser(payload: Record<string, unknown>): AuthedUser {
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

/** Verify a Supabase user JWT. Throws when the token fails every configured path. */
export async function verifySupabaseJwt(
	token: string,
	opts: JoseVerifyOptions,
): Promise<AuthedUser> {
	// 1. JWKS (preferred).
	if (opts.supabaseUrl) {
		try {
			const jwks = getJwks(opts.supabaseUrl);
			const { payload } = await jwtVerify(token, jwks, { algorithms: ["ES256", "RS256"] });
			return toAuthedUser(payload as Record<string, unknown>);
		} catch (err) {
			// JWKS failed — either the project hasn't enabled asymmetric signing
			// yet, or the token is genuinely invalid. Fall through to find out.
			if (!opts.jwtSecret && !opts.authApiKey) throw err;
		}
	}

	// 2. HS256 fallback.
	if (opts.jwtSecret) {
		try {
			const key = new TextEncoder().encode(opts.jwtSecret);
			const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
			return toAuthedUser(payload as Record<string, unknown>);
		} catch (err) {
			if (!opts.authApiKey) throw err;
		}
	}

	// 3. GoTrue network fallback.
	if (opts.supabaseUrl && opts.authApiKey) {
		const res = await fetch(`${opts.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
			headers: { apikey: opts.authApiKey, Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(opts.authApiTimeoutMs ?? 8000),
		});
		if (res.ok) {
			const user = (await res.json()) as { id?: string; email?: string; role?: string };
			if (typeof user.id === "string") {
				return { sub: user.id, email: user.email, role: user.role };
			}
		}
		throw new Error("invalid token");
	}

	throw new Error("verifier not configured");
}
