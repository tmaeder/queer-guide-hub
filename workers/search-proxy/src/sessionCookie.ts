/** Signed, server-generated identifiers for anonymous search engagement. */
import type { Env } from "./index";

// Legacy cookies could be minted for caller-chosen IDs. Start a new namespace.
const COOKIE_NAME = "qg_sid_v2";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SignedSession {
	sid: string;
	mintedAt: number; // unix seconds; rotates ids minted before the current key
}

let cachedKey: { secret: string; key: CryptoKey } | null = null;
async function getKey(env: Env): Promise<CryptoKey | null> {
	const secret = env.SESSION_SIGNING_KEY;
	if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
	if (!secret) return null; // running locally without the secret — fall back to unsigned
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
	cachedKey = { secret, key };
	return key;
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
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${COOKIE_NAME}:${payload}`));
	return `${payload}.${b64urlEncode(sig)}`;
}

async function verify(env: Env, token: string): Promise<SignedSession | null> {
	const key = await getKey(env);
	if (!key) return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [sid, mintedAtStr, sigB64] = parts;
	const mintedAt = Number(mintedAtStr);
	const age = Math.floor(Date.now() / 1000) - mintedAt;
	if (!sid || !Number.isInteger(mintedAt) || age < 0 || age >= COOKIE_MAX_AGE) return null;
	const ok = await crypto.subtle
		.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(`${COOKIE_NAME}:${sid}.${mintedAt}`))
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

export async function verifiedSessionId(request: Request, env: Env): Promise<string | undefined> {
	const token = readCookie(request);
	if (!token) return undefined;
	return (await verify(env, token).catch(() => null))?.sid;
}

export async function resolveSession(
	request: Request,
	env: Env,
): Promise<{ sid: string; setCookie: string | null; verified: boolean }> {
	const existing = await verifiedSessionId(request, env);
	if (existing) return { sid: existing, setCookie: null, verified: true };

	const sid = crypto.randomUUID();
	const token = await sign(env, sid, Math.floor(Date.now() / 1000));
	const setCookie = token
		? `${COOKIE_NAME}=${token}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
		: null;
	return { sid, setCookie, verified: false };
}
