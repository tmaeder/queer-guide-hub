/**
 * Per-conversation Durable Object: holds message history and runs the Workers AI
 * tool-calling agent loop (plan §6). Memory is the DO's own storage, so each
 * conversation keeps context across turns without a shared store.
 *
 * Stored history is just the clean user/assistant text turns; the in-turn tool
 * scaffolding (assistant tool-intent + role:"tool" results) lives only in the
 * working `messages` for that turn.
 */

import type { Env, AiMessage, Card } from "./types";
import { runModel } from "./model";
import { TOOLS, executeTool } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import { validateGrounding, type GroundingReport } from "./grounding";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_TOOL_STEPS = 4; // bound the agent loop
const MAX_HISTORY = 16; // cap stored user/assistant turns

interface TurnResult {
	reply: string;
	cards: Card[];
	grounding: GroundingReport;
}

export class Conversation {
	private ctx: DurableObjectState;
	private env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
		let body: { message?: unknown; user_id?: unknown; session_id?: unknown };
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "invalid_json" }, 400);
		}
		const message = typeof body.message === "string" ? body.message.trim() : "";
		if (!message) return json({ error: "empty_message" }, 400);
		if (message.length > 2000) return json({ error: "message_too_long" }, 400);

		try {
			const result = await this.runTurn(message, {
				userId: typeof body.user_id === "string" ? body.user_id : undefined,
				sessionId: typeof body.session_id === "string" ? body.session_id : undefined,
			});
			return json({
				reply: result.reply,
				cards: result.cards,
				grounding_ok: result.grounding.ok,
				...(result.grounding.unknownRefs.length ? { unverified_refs: result.grounding.unknownRefs } : {}),
			});
		} catch (e) {
			console.error("conversation.runTurn", (e as Error).message);
			return json({ error: "assistant_error" }, 502);
		}
	}

	private async runTurn(message: string, who: { userId?: string; sessionId?: string }): Promise<TurnResult> {
		const history = (await this.ctx.storage.get<AiMessage[]>("history")) ?? [];
		const model = this.env.ROUTER_MODEL || DEFAULT_MODEL;
		const system =
			who.userId || who.sessionId
				? `${SYSTEM_PROMPT}\n\n(The user is signed in; you may call get_recommendations for personalized suggestions.)`
				: SYSTEM_PROMPT;

		// Working transcript for this turn (system + prior turns + new user message);
		// tool scaffolding is appended here but never persisted.
		const messages: AiMessage[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];

		const cards: Card[] = [];
		let finalText = "";
		let toolsUsed = false;

		for (let step = 0; step < MAX_TOOL_STEPS; step++) {
			// Offer tools only until one gathering round has run. This quantized Llama
			// re-calls tools indefinitely when they stay in context, so the synthesis
			// turn omits them to force a grounded prose answer from the tool results.
			const { text, toolCalls } = await runModel(this.env, { model, messages, tools: toolsUsed ? undefined : TOOLS });

			if (!toolsUsed && toolCalls.length > 0) {
				toolsUsed = true;
				// Assistant turn must carry the structured tool_calls; each tool result
				// links back via tool_call_id (Workers AI chat round-trip format).
				messages.push({
					role: "assistant",
					content: text || "",
					tool_calls: toolCalls.map((tc, i) => ({
						id: `call_${i}`,
						type: "function",
						function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
					})),
				});
				for (let i = 0; i < toolCalls.length; i++) {
					const tc = toolCalls[i];
					const outcome = await executeTool(this.env, tc.name, tc.arguments);
					cards.push(...outcome.cards);
					messages.push({ role: "tool", tool_call_id: `call_${i}`, name: tc.name, content: outcome.content });
				}
				continue;
			}

			finalText = text;
			break;
		}

		if (!finalText) finalText = "I couldn't pull that together just now. Want me to try a different search?";

		// Persist only the clean user/assistant turns, bounded.
		const turns: AiMessage[] = [
			...history,
			{ role: "user", content: message },
			{ role: "assistant", content: finalText },
		];
		await this.ctx.storage.put("history", turns.slice(-MAX_HISTORY));

		const deduped = dedupeCards(cards);
		return { reply: finalText, cards: deduped, grounding: validateGrounding(finalText, deduped) };
	}
}

function dedupeCards(cards: Card[]): Card[] {
	const seen = new Set<string>();
	const out: Card[] = [];
	for (const c of cards) {
		const k = `${c.type}:${c.objectID}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(c);
	}
	return out;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
