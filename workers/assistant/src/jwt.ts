/**
 * Verification of Supabase access tokens (safety layer, assistant side).
 *
 * The assistant retrieves entity data through search_hybrid / get_recommendations
 * / related_entities using the SERVICE key (RLS bypassed), so those RPCs only
 * surface safety-gated (high-risk-country) content when explicitly asked via
 * include_gated. We pass include_gated=true ONLY for a verified-logged-in user —
 * the request-body user_id is spoofable and must NOT be used for this.
 *
 * Two fail-CLOSED paths (any error → false → gated content stays hidden):
 *   1. Local HS256 with SUPABASE_JWT_SECRET (offline, zero latency) when set.
 *   2. Otherwise a GoTrue {SUPABASE_URL}/auth/v1/user check using the service key
 *      the worker already has — so no extra secret is required.
 * (No KV cache here — assistant turns are low-frequency, unlike per-keystroke
 *  autocomplete, so a per-turn verify is fine.)
 */

import type { Env } from "./types";

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
	const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
	if (!valid) return false;
	const payload = decodeJson(p);
	if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
	if (!payload.sub) return false;
	if (typeof payload.role === "string" && payload.role !== "authenticated") return false;
	return true;
}

async function verifyViaAuthApi(token: string, env: Env): Promise<boolean> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;
	try {
		const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
			headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return false;
		const user = (await res.json().catch(() => null)) as { id?: string } | null;
		return Boolean(user?.id);
	} catch {
		return false;
	}
}

/** True only for a request bearing a valid, unexpired Supabase user token. */
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
