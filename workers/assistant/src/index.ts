/**
 * queer-guide-assistant — conversational concierge (plan §6).
 *
 * POST /assistant  { message, conversation_id?, user_id?, session_id? }
 *   → routes to a per-conversation Durable Object that runs a Claude
 *     tool-calling loop grounded in the search_documents RPCs, and returns
 *     { conversation_id, reply, cards, grounding_ok }.
 * GET  /health
 *
 * Skeleton: non-streaming tool loop (SSE streaming is a follow-up). Requires
 * ANTHROPIC_API_KEY + SUPABASE_* secrets and a deploy to run.
 */

import type { Env } from "./types";
import { isAuthenticatedRequest } from "./jwt";
import { rateLimit } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";
export { Conversation } from "./conversation";

function corsHeaders(request: Request, env: Env): Record<string, string> {
	const origin = request.headers.get("Origin") ?? "";
	const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	const allow = allowed.includes(origin) ? origin : allowed[0] ?? "*";
	return {
		"Access-Control-Allow-Origin": allow,
		"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Allow-Credentials": "true",
		Vary: "Origin",
	};
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...cors },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const cors = corsHeaders(request, env);
		if (request.method === "OPTIONS") return new Response(null, { headers: cors });

		if (url.pathname === "/health") return json({ ok: true, ts: Date.now() }, 200, cors);

		if (url.pathname === "/assistant") {
			if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
			let body: { message?: unknown; conversation_id?: unknown };
			try {
				body = (await request.clone().json()) as typeof body;
			} catch {
				return json({ error: "invalid_json" }, 400, cors);
			}
			if (typeof body.message !== "string" || !body.message.trim()) {
				return json({ error: "message required" }, 400, cors);
			}

			// Kill-switch: instantly halt 70B spend without a redeploy race.
			if (env.AI_DISABLED === "1") {
				return json({ reply: "The assistant is temporarily unavailable. Please try again later.", cards: [], grounding_ok: false }, 503, cors);
			}

			// Anti-abuse for this PUBLIC, unauthenticated 70B endpoint (cost control,
			// invoice IN-72568830). (1) Per-IP rate limit; (2) Turnstile token.
			const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
			if (env.RATE_LIMIT) {
				const perMin = parseInt(env.ASSISTANT_RATE_PER_MIN ?? "10", 10) || 10;
				const rl = await rateLimit(env.RATE_LIMIT, clientIp, perMin);
				if (!rl.ok) {
					return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, {
						...cors,
						"Retry-After": String(rl.retryAfter),
					});
				}
			}
			const turnstileToken = typeof (body as { turnstile_token?: unknown }).turnstile_token === "string"
				? (body as { turnstile_token: string }).turnstile_token
				: request.headers.get("cf-turnstile-response") ?? undefined;
			const ts = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, clientIp);
			if (!ts.ok) {
				return json({ error: "turnstile_failed" }, 403, cors);
			}

			// Safety layer: a verified-logged-in caller may see high-risk-country
			// (gated) content in chat, matching the rest of the product. The body's
			// user_id is spoofable, so trust the signed JWT. Anonymous → gated hidden.
			const authed = await isAuthenticatedRequest(request, env);

			// Route to the conversation's Durable Object (new id if none supplied).
			const conversationId =
				typeof body.conversation_id === "string" && body.conversation_id ? body.conversation_id : crypto.randomUUID();
			const stub = env.CONVERSATION.get(env.CONVERSATION.idFromName(conversationId));

			// Forward the original turn body plus the trusted `authed` flag. (The DO
			// must not re-derive auth — it can't see the Authorization header.)
			const doResp = await stub.fetch("https://do/turn", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...(body as Record<string, unknown>), authed }),
			});
			const payload = (await doResp.json()) as Record<string, unknown>;
			return json({ conversation_id: conversationId, ...payload }, doResp.status, cors);
		}

		return json({ error: "not_found" }, 404, cors);
	},
};
