/**
 * Workers AI text-generation client with traditional function calling, run
 * through the qg-search AI Gateway (caching / rate-limit / observability).
 * Replaces the previous Anthropic client — no external key, uses the AI binding.
 */

import type { Env, AiMessage, ToolDef, ModelResult, ToolCall } from "./types";
import { TOOLS } from "./tools";

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

	// Quantized Llama sometimes writes tool calls into the prose instead of (or on
	// top of) the structured tool_calls field. Pull them out so they never leak
	// into a user-visible reply, and promote them to real calls when the
	// structured field came back empty.
	const { text, calls: textCalls } = extractTextToolCalls((out.response ?? "").trim());
	const seen = new Set(toolCalls.map((tc) => `${tc.name}:${JSON.stringify(tc.arguments)}`));
	for (const tc of textCalls) {
		const k = `${tc.name}:${JSON.stringify(tc.arguments)}`;
		if (!seen.has(k)) {
			seen.add(k);
			toolCalls.push(tc);
		}
	}

	return { text, toolCalls };
}

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));
const MAX_TEXT_CALL_BLOCKS = 3;

/**
 * Find JSON blobs in model prose that are really tool calls (single object,
 * array of objects, or the {type:"function",function:{...}} wrapper), remove
 * them from the text, and return them as normalized ToolCalls. Call-shaped
 * blobs are stripped even when the model hallucinated an unregistered tool
 * name (they'd otherwise leak to the user), but only registered names are
 * promoted to executable calls. JSON that isn't call-shaped stays in the text.
 */
export function extractTextToolCalls(raw: string): { text: string; calls: ToolCall[] } {
	const calls: ToolCall[] = [];
	let text = raw;
	for (let n = 0; n < MAX_TEXT_CALL_BLOCKS; n++) {
		const block = findJsonBlock(text);
		if (!block) break;
		let parsed: unknown;
		try {
			parsed = JSON.parse(block.json);
		} catch {
			break; // not valid JSON — leave the text alone
		}
		const found = asToolCalls(parsed);
		if (found === null) break; // valid JSON but not call-shaped — leave it
		calls.push(...found);
		text = (text.slice(0, block.start) + " " + text.slice(block.end)).replace(/\s+/g, " ").trim();
	}
	return { text, calls };
}

/** Locate the first balanced top-level {...} or [...] block in the string. */
function findJsonBlock(text: string): { start: number; end: number; json: string } | null {
	const start = text.search(/[[{]/);
	if (start === -1) return null;
	const open = text[start];
	const close = open === "[" ? "]" : "}";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return { start, end: i + 1, json: text.slice(start, i + 1) };
		}
	}
	return null;
}

/**
 * Normalize a parsed JSON value into tool calls, if that's what it is. Returns
 * null when the blob is not call-shaped (leave it in the text); otherwise the
 * executable subset (registered tool names only — hallucinated names are
 * stripped from the text but never executed).
 */
function asToolCalls(parsed: unknown): ToolCall[] | null {
	const items = Array.isArray(parsed) ? parsed : [parsed];
	if (!items.length) return null;
	const out: ToolCall[] = [];
	for (const item of items) {
		if (!item || typeof item !== "object") return null;
		const o = item as Record<string, unknown>;
		// {type:"function", function:{name, arguments}} wrapper
		const fn = o.function && typeof o.function === "object" ? (o.function as Record<string, unknown>) : undefined;
		const name = typeof o.name === "string" ? o.name : fn && typeof fn.name === "string" ? (fn.name as string) : undefined;
		const args = fn ? (fn.arguments ?? fn.parameters) : (o.arguments ?? o.parameters);
		// Call-shaped = has a name AND an arguments-ish member. Anything else
		// disqualifies the whole blob.
		if (!name || args === undefined) return null;
		if (TOOL_NAMES.has(name)) out.push({ name, arguments: normalizeArgs(args) });
	}
	return out;
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
