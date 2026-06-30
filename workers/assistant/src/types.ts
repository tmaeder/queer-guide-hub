/** Shared types for the queer-guide-assistant worker (Workers AI backed). */

export interface Env {
	/** Workers AI binding — runs the tool-calling model (through the AI Gateway). */
	AI: Ai;
	CONVERSATION: DurableObjectNamespace;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	/** AI Gateway id for caching/rate-limit/observability on the AI.run calls. */
	AI_GATEWAY_NAME: string;
	/** Tool-capable Workers AI model, e.g. @cf/meta/llama-3.3-70b-instruct-fp8-fast. */
	ROUTER_MODEL?: string;
	ALLOWED_ORIGINS: string;
	/**
	 * Optional Supabase JWT secret (HS256). When set, the safety layer verifies
	 * the caller's access token offline; when unset, it falls back to a GoTrue
	 * check using SUPABASE_SERVICE_KEY. Used to decide whether a logged-in user
	 * may see safety-gated (high-risk-country) content in chat. Missing → fail
	 * closed (treated as anonymous; gated content stays hidden).
	 */
	SUPABASE_JWT_SECRET?: string;
}

// ── Workers AI traditional function-calling shapes ─────────────────────────
// https://developers.cloudflare.com/workers-ai/features/function-calling/traditional/
export interface AiMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	/** Tool name (for role: "tool" result messages). */
	name?: string;
	/** Structured tool calls on an assistant turn (OpenAI/Chat-Completions shape). */
	tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
	/** Links a role:"tool" result back to the assistant tool call that requested it. */
	tool_call_id?: string;
}

/** Flat tool definition Workers AI expects ({ name, description, parameters }). */
export interface ToolDef {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

/** A tool call the model asked for. */
export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

/** Normalized model output from AI.run. */
export interface ModelResult {
	text: string;
	toolCalls: ToolCall[];
}

/** A grounded entity card returned by a tool — the only thing the UI renders. */
export interface Card {
	objectID: string;
	type: string;
	title?: string;
	city?: string;
	country?: string;
	slug?: string;
	imageUrl?: string;
	category?: string;
	[key: string]: unknown;
}
