/**
 * Verification of Supabase access tokens (safety layer).
 *
 * The search-proxy talks to Supabase with the SERVICE key, so RLS never sees the
 * end user and `auth.uid()` is useless inside the search RPCs. To decide whether
 * a request may see safety-gated content (venues/events/orgs in high-risk
 * countries), we need a TRUSTED "is this a real, logged-in user?" signal — the
 * client-supplied `user_id` in the request body is spoofable and must NOT be used.
 *
 * Two verification paths, tried in order, both fail-CLOSED (any error returns
 * false, so gated content stays hidden rather than leaking):
 *
 *   1. Local HS256 — if SUPABASE_JWT_SECRET is set, verify the token signature
 *      offline (this project signs JWTs with HS256; confirmed via the anon key
 *      header). Zero network latency. Preferred.
 *   2. GoTrue check — otherwise call {SUPABASE_URL}/auth/v1/user with the token
 *      and the service key the Worker already has. Needs no extra secret, so the
 *      safety layer works out of the box. Positive results are cached in KV for
 *      60s (keyed by a token hash) to keep per-keystroke autocomplete fast.
 */

import type { Env } from "./index";

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

function extractBearer(request: Request): string | null {
	const header = request.headers.get("Authorization") || request.headers.get("authorization");
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match ? match[1].trim() : null;
}

/** Offline HS256 signature + claim check. */
async function verifyHs256(token: string, secret: string): Promise<boolean> {
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
 * Network check against GoTrue, used when no JWT secret is configured. Validates
 * the token (GoTrue verifies the signature + expiry server-side) and confirms a
 * real user. Positive results cached 60s in KV; revocations are honoured on the
 * next minute, which is acceptable for a read-gating decision.
 */
async function verifyViaAuthApi(token: string, env: Env): Promise<boolean> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;

	const cacheKey = await tokenCacheKey(token);
	try {
		if ((await env.SESSION_CACHE?.get(cacheKey)) === "1") return true;
	} catch {
		/* KV miss/error — fall through to the network check */
	}

	try {
		const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
			headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return false;
		const user = (await res.json().catch(() => null)) as { id?: string } | null;
		if (!user?.id) return false;
		try {
			await env.SESSION_CACHE?.put(cacheKey, "1", { expirationTtl: 60 });
		} catch {
			/* cache write is best-effort */
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns true only for a request bearing a valid, unexpired Supabase user
 * token. Used to set `include_gated` on the search RPCs. Fail-closed.
 */
export async function isAuthenticatedRequest(request: Request, env: Env): Promise<boolean> {
	try {
		const token = extractBearer(request);
		if (!token) return false;
		if (env.SUPABASE_JWT_SECRET) return await verifyHs256(token, env.SUPABASE_JWT_SECRET);
		return await verifyViaAuthApi(token, env);
	} catch {
		return false;
	}
}
