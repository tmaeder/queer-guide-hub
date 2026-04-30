import type { Env } from "./index";

export function getCorsHeaders(request: Request, env: Env): HeadersInit {
	const origin = request.headers.get("Origin") || "";
	const allowed = new Set((env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean));
	return {
		"Access-Control-Allow-Origin": allowed.has(origin) ? origin : allowed.size === 0 ? "*" : "",
		"Access-Control-Allow-Headers": "content-type, authorization",
		"Access-Control-Allow-Methods": "POST, OPTIONS, GET",
		"Access-Control-Max-Age": "86400",
	};
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...headers, "Content-Type": "application/json" },
	});
}

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
	const text = await request.text();
	if (!text.trim()) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

export async function sha256(text: string): Promise<string> {
	const buf = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
