import { describe, it, expect } from "vitest";
import { isAuthenticatedRequest } from "../src/jwt";
import type { Env } from "../src/index";

const SECRET = "test-jwt-secret-please-ignore";

function b64url(bytes: Uint8Array | string): string {
	const arr = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
	let bin = "";
	for (const b of arr) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signHs256(payload: Record<string, unknown>, secret = SECRET): Promise<string> {
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64url(JSON.stringify(payload));
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
	return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
}

function req(token?: string): Request {
	return new Request("https://search.queer.guide/search", {
		method: "POST",
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}

const env = { SUPABASE_JWT_SECRET: SECRET } as unknown as Env;
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe("isAuthenticatedRequest", () => {
	it("accepts a valid unexpired authenticated token", async () => {
		const t = await signHs256({ sub: "user-1", role: "authenticated", exp: future });
		expect(await isAuthenticatedRequest(req(t), env)).toBe(true);
	});

	it("rejects an expired token", async () => {
		const t = await signHs256({ sub: "user-1", role: "authenticated", exp: past });
		expect(await isAuthenticatedRequest(req(t), env)).toBe(false);
	});

	it("rejects a token signed with the wrong secret (forgery)", async () => {
		const t = await signHs256({ sub: "user-1", role: "authenticated", exp: future }, "wrong-secret");
		expect(await isAuthenticatedRequest(req(t), env)).toBe(false);
	});

	it("rejects a token with no subject", async () => {
		const t = await signHs256({ role: "authenticated", exp: future });
		expect(await isAuthenticatedRequest(req(t), env)).toBe(false);
	});

	it("rejects the anon role", async () => {
		const t = await signHs256({ sub: "anon", role: "anon", exp: future });
		expect(await isAuthenticatedRequest(req(t), env)).toBe(false);
	});

	it("rejects when no Authorization header is present", async () => {
		expect(await isAuthenticatedRequest(req(), env)).toBe(false);
	});

	it("fails closed when the secret is unset", async () => {
		const t = await signHs256({ sub: "user-1", role: "authenticated", exp: future });
		expect(await isAuthenticatedRequest(req(t), {} as Env)).toBe(false);
	});

	it("rejects a malformed token", async () => {
		expect(await isAuthenticatedRequest(req("not.a.jwt"), env)).toBe(false);
	});
});
