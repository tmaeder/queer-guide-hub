/**
 * Workers AI text-generation client with traditional function calling, run
 * through the qg-search AI Gateway (caching / rate-limit / observability).
 * Replaces the previous Anthropic client — no external key, uses the AI binding.
 */

import type { Env, AiMessage, ToolDef, ModelResult, ToolCall } from "./types";

// Bound worst-case 70B output cost per turn (cost control, invoice IN-72568830).
// A concierge reply + tool args fit comfortably in 512.
const MAX_TOKENS = 512;

// The @cloudflare/workers-types Ai.run overloads don't cover dynamic model ids +
// the tools input cleanly, so call through a minimal structural type.
interface AiRunner {
	run(
		model: string,
		input: { messages: AiMessage[]; tools?: ToolDef[]; max_tokens?: number },
		opts?: { gateway?: { id: string } },
	): Promise<{ response?: string; tool_calls?: Array<{ name?: string; arguments?: unknown }> }>;
}

export async function runModel(
	env: Env,
	args: { model: string; messages: AiMessage[]; tools?: ToolDef[] },
): Promise<ModelResult> {
	const ai = env.AI as unknown as AiRunner;
	const out = await ai.run(
		args.model,
		{ messages: args.messages, tools: args.tools, max_tokens: MAX_TOKENS },
		env.AI_GATEWAY_NAME ? { gateway: { id: env.AI_GATEWAY_NAME } } : undefined,
	);

	const toolCalls: ToolCall[] = (out.tool_calls ?? [])
		.filter((tc): tc is { name: string; arguments?: unknown } => typeof tc?.name === "string")
		.map((tc) => ({ name: tc.name, arguments: normalizeArgs(tc.arguments) }));

	return { text: (out.response ?? "").trim(), toolCalls };
}

/** Some models return arguments as an object, others as a JSON string. */
function normalizeArgs(raw: unknown): Record<string, unknown> {
	if (raw && typeof raw === "object") return raw as Record<string, unknown>;
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
		} catch {
			return {};
		}
	}
	return {};
}
