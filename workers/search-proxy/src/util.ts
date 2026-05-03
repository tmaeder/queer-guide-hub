import type { Env } from "./index";

/**
 * CORS for read endpoints (`/`, `/search`, `/autocomplete`, `/trending`,
 * `/similar`, `/health`). The corpus is public, so we return `ACAO: *`. Use
 * `getCorsHeadersOriginLocked` for write endpoints (`/track`, `/feedback`,
 * `/onboarding`) where we want browser-side origin enforcement.
 */
export function getCorsHeaders(_request: Request, _env: Env): HeadersInit {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "content-type, authorization",
		"Access-Control-Allow-Methods": "POST, OPTIONS, GET",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

export function getCorsHeadersOriginLocked(request: Request, env: Env): HeadersInit {
	const origin = request.headers.get("Origin") || "";
	const allowed = new Set((env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean));
	const isAllowed = origin && allowed.has(origin);
	return {
		// Empty header means the browser blocks the response, which is the desired
		// behaviour for cross-origin write requests from unknown origins.
		"Access-Control-Allow-Origin": isAllowed ? origin : "",
		"Access-Control-Allow-Headers": "content-type, authorization",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...headers, "Content-Type": "application/json" },
	});
}

import type { Err } from "./validation";

export function errorResponse(e: Err, cors: HeadersInit): Response {
	return json(
		{ error: e.error, code: e.code, ...(e.field ? { field: e.field } : {}), ...(e.extra ?? {}) },
		e.status,
		cors,
	);
}

export async function sha256(text: string): Promise<string> {
	const buf = new TextEncoder().encode(text);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
