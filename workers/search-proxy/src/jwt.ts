/**
 * Offline verification of Supabase access tokens (safety layer).
 *
 * The search-proxy talks to Supabase with the SERVICE key, so RLS never sees the
 * end user and `auth.uid()` is useless inside the search RPCs. To decide whether
 * a request may see safety-gated content (venues/events/orgs in high-risk
 * countries), we need a TRUSTED "is this a real, logged-in user?" signal — the
 * client-supplied `user_id` in the request body is spoofable and must NOT be used.
 *
 * This project signs JWTs with HS256 + the project JWT secret (confirmed via the
 * anon key header `{"alg":"HS256"}`), so we verify the access token's signature
 * locally with `SUPABASE_JWT_SECRET` — no network hop, no per-request latency.
 *
 * Fail-CLOSED: any missing secret / header, malformed token, bad signature, wrong
 * algorithm, expiry, or unexpected role returns false, so gated content stays
 * hidden rather than leaking to an unverified caller.
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

/**
 * Returns true only for a request bearing a valid, unexpired, HS256-signed
 * Supabase user token. Used to set `include_gated` on the search RPCs.
 */
export async function isAuthenticatedRequest(request: Request, env: Env): Promise<boolean> {
	try {
		const secret = env.SUPABASE_JWT_SECRET;
		if (!secret) return false;

		const header = request.headers.get("Authorization") || request.headers.get("authorization");
		if (!header) return false;
		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		if (!match) return false;

		const token = match[1].trim();
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
		// Expiry (exp is seconds since epoch).
		if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
		// A genuine user session carries a subject and the authenticated role.
		if (!payload.sub) return false;
		if (typeof payload.role === "string" && payload.role !== "authenticated") return false;

		return true;
	} catch {
		return false;
	}
}
