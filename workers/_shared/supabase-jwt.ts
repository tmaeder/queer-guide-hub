/**
 * Shared verification of Supabase access tokens for Cloudflare Workers
 * (dependency-free — WebCrypto only).
 *
 * Consumers talk to Supabase with the SERVICE key, so RLS never sees the end
 * user and request-body user ids are spoofable. This module provides the
 * TRUSTED "is this a real, logged-in user?" signal. Two paths, both
 * fail-CLOSED (any error → false, gated content stays hidden):
 *
 *   1. Local HS256 — when a SUPABASE_JWT_SECRET is available, verify the token
 *      signature offline (this project signs JWTs with HS256). Zero-latency;
 *      preferred.
 *   2. GoTrue check — otherwise call {SUPABASE_URL}/auth/v1/user with the API
 *      key the worker already has (service or anon). Positive results can be
 *      cached in a caller-supplied KV namespace (keyed by token hash).
 *
 * Used by: search-proxy (with KV cache) and assistant (without). The submit
 * and image-cdn workers need asymmetric JWKS verification and use the jose-
 * based sibling module `supabase-jwt-jose.ts` instead.
 */

export interface SupabaseJwtEnv {
	SUPABASE_URL?: string;
	SUPABASE_SERVICE_KEY?: string;
	SUPABASE_JWT_SECRET?: string;
}

/** Minimal KV surface so callers can pass a KVNamespace without type coupling. */
export interface TokenCache {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

function base64UrlToBytes(s: string): Uint8Array {
	let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const pad = b64.length % 4;
	if (pad) b64 += "=".repeat(4 - pad);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function decodeJson(part: string): Record<string, unknown> {
	return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

export function extractBearer(request: Request): string | null {
	const header = request.headers.get("Authorization") || request.headers.get("authorization");
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match ? match[1].trim() : null;
}

/** Offline HS256 signature + claim check. */
export async function verifyHs256(token: string, secret: string): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const [h, p, sig] = parts;

	const head = decodeJson(h);
	if (head.alg !== "HS256") return false;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		base64UrlToBytes(sig),
		new TextEncoder().encode(`${h}.${p}`),
	);
	if (!valid) return false;

	const payload = decodeJson(p);
	if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
	if (!payload.sub) return false;
	if (typeof payload.role === "string" && payload.role !== "authenticated") return false;
	return true;
}

async function tokenCacheKey(token: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return "authok:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Network check against GoTrue, used when no JWT secret is configured. GoTrue
 * verifies signature + expiry server-side and confirms a real user. Positive
 * results are cached 60s when a cache is supplied; revocations are honoured on
 * the next minute, which is acceptable for a read-gating decision.
 */
async function verifyViaAuthApi(
	token: string,
	env: SupabaseJwtEnv,
	cache?: TokenCache,
): Promise<boolean> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;

	const cacheKey = cache ? await tokenCacheKey(token) : null;
	if (cache && cacheKey) {
		try {
			if ((await cache.get(cacheKey)) === "1") return true;
		} catch {
			/* KV miss/error — fall through to the network check */
		}
	}

	try {
		const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
			headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return false;
		const user = (await res.json().catch(() => null)) as { id?: string } | null;
		if (!user?.id) return false;
		if (cache && cacheKey) {
			try {
				await cache.put(cacheKey, "1", { expirationTtl: 60 });
			} catch {
				/* cache write is best-effort */
			}
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns true only for a request bearing a valid, unexpired Supabase user
 * token. Fail-closed.
 */
export async function isAuthenticatedRequest(
	request: Request,
	env: SupabaseJwtEnv,
	cache?: TokenCache,
): Promise<boolean> {
	try {
		const token = extractBearer(request);
		if (!token) return false;
		if (env.SUPABASE_JWT_SECRET) return await verifyHs256(token, env.SUPABASE_JWT_SECRET);
		return await verifyViaAuthApi(token, env, cache);
	} catch {
		return false;
	}
}
