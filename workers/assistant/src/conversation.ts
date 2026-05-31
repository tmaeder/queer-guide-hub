/**
 * Per-conversation Durable Object: holds message history and runs the
 * tool-calling agent loop (plan §6). Memory is the DO's own storage, so each
 * conversation keeps context across turns without a shared store.
 */

import type { Env, ClaudeMessage, Card, TextBlock, ToolUseBlock, ToolResultBlock } from "./types";
import { callClaude } from "./claude";
import { TOOLS, executeTool } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import { validateGrounding, type GroundingReport } from "./grounding";

const MAX_TOOL_STEPS = 4; // bound the agent loop
const MAX_HISTORY = 24; // cap stored turns to bound tokens/storage

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
		const history = ((await this.ctx.storage.get<ClaudeMessage[]>("history")) ?? []).slice();
		history.push({ role: "user", content: message });

		const model = this.env.ROUTER_MODEL || "claude-haiku-4-5-20251001";
		const system = who.userId || who.sessionId ? `${SYSTEM_PROMPT}\n\n(The user is signed in; you may call get_recommendations for personalized suggestions.)` : SYSTEM_PROMPT;

		const cards: Card[] = [];
		let finalText = "";

		for (let step = 0; step < MAX_TOOL_STEPS; step++) {
			const resp = await callClaude(this.env, { model, system, messages: history, tools: TOOLS });
			history.push({ role: "assistant", content: resp.content });

			if (resp.stop_reason === "tool_use") {
				const toolResults: ToolResultBlock[] = [];
				for (const block of resp.content) {
					if (block.type !== "tool_use") continue;
					const tu = block as ToolUseBlock;
					const outcome = await executeTool(this.env, tu.name, tu.input);
					cards.push(...outcome.cards);
					toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: outcome.content });
				}
				history.push({ role: "user", content: toolResults });
				continue;
			}

			finalText = resp.content
				.filter((b): b is TextBlock => b.type === "text")
				.map((b) => b.text)
				.join("\n")
				.trim();
			break;
		}

		if (!finalText) finalText = "I couldn't pull that together just now. Want me to try a different search?";

		// Persist a bounded history window.
		await this.ctx.storage.put("history", history.slice(-MAX_HISTORY));

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
