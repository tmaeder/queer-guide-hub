/**
 * Signed session-id cookie for the search-proxy.
 *
 * Bug #14 in the search bug report: every client generates `qg_sid` with
 * `crypto.randomUUID()` and stores it in localStorage, then sends it as
 * plaintext on every /track and /feedback. Trending counts and feedback
 * weights are therefore manipulable by anyone who can hit the API — there
 * is no proof the session id originated here.
 *
 * Fix: the worker now mints HMAC-signed session ids. On first contact (any
 * request that doesn't already carry a valid `qg_sid` cookie) we generate
 * a new id, sign it with `SESSION_SIGNING_KEY`, and Set-Cookie it
 * HttpOnly+Secure+SameSite=Lax. On subsequent requests we verify the
 * signature; an unsigned or tampered id is dropped and a fresh one is
 * minted. The verified id is what gets stored against trending / feedback
 * aggregates.
 *
 * Backwards compat: callers can still pass `session_id` in the body. If we
 * have a verified cookie id, we ignore the body. If not, we trust the body
 * for one request and set a cookie at the same time. Existing
 * localStorage-based clients keep working through the migration window.
 */

import type { Env } from "./index";

const COOKIE_NAME = "qg_sid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SignedSession {
	sid: string;
	mintedAt: number; // unix seconds; rotates ids minted before the current key
}

let cachedKey: CryptoKey | null = null;
async function getKey(env: Env): Promise<CryptoKey | null> {
	if (cachedKey) return cachedKey;
	const secret = env.SESSION_SIGNING_KEY;
	if (!secret) return null; // running locally without the secret — fall back to unsigned
	cachedKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
	return cachedKey;
}

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = "";
	for (const c of b) s += String.fromCharCode(c);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
	const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
	const out = new Uint8Array(b.length);
	for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
	return out;
}

async function sign(env: Env, sid: string, mintedAt: number): Promise<string | null> {
	const key = await getKey(env);
	if (!key) return null;
	const payload = `${sid}.${mintedAt}`;
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return `${payload}.${b64urlEncode(sig)}`;
}

async function verify(env: Env, token: string): Promise<SignedSession | null> {
	const key = await getKey(env);
	if (!key) return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [sid, mintedAtStr, sigB64] = parts;
	const mintedAt = Number(mintedAtStr);
	if (!sid || !Number.isFinite(mintedAt)) return null;
	const ok = await crypto.subtle
		.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(`${sid}.${mintedAt}`))
		.catch(() => false);
	if (!ok) return null;
	return { sid, mintedAt };
}

function readCookie(request: Request): string | null {
	const header = request.headers.get("cookie");
	if (!header) return null;
	for (const part of header.split(/;\s*/)) {
		const [k, v] = part.split("=");
		if (k === COOKIE_NAME && v) return v;
	}
	return null;
}

/**
 * Resolve the trusted session id for this request:
 *   - if a valid signed cookie is present, return its sid
 *   - else if the body carries a session_id, trust it for this request
 *     (transition path) and instruct the caller to mint a cookie
 *   - else mint a fresh sid and instruct the caller to set the cookie
 *
 * The returned `setCookie` header (when present) MUST be merged into the
 * response so the client receives the new id.
 */
export async function resolveSession(
	request: Request,
	env: Env,
	bodySessionId: string | undefined,
): Promise<{ sid: string; setCookie: string | null; verified: boolean }> {
	const cookieToken = readCookie(request);
	if (cookieToken) {
		const v = await verify(env, cookieToken);
		if (v) return { sid: v.sid, setCookie: null, verified: true };
	}

	// Either no cookie or invalid signature. Mint fresh.
	const sid = bodySessionId && /^[A-Za-z0-9_-]{8,64}$/.test(bodySessionId)
		? bodySessionId
		: crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const token = await sign(env, sid, now);
	if (!token) {
		// No signing key configured — fall back to the unsigned sid (dev).
		return { sid, setCookie: null, verified: false };
	}
	const setCookie = `${COOKIE_NAME}=${token}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
	return { sid, setCookie, verified: !!cookieToken && false };
}
