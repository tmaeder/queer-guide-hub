/** Shared types for the queer-guide-assistant worker. */

export interface Env {
	CONVERSATION: DurableObjectNamespace;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	AI_GATEWAY_ACCOUNT_ID: string;
	AI_GATEWAY_NAME: string;
	ANTHROPIC_API_KEY: string;
	ROUTER_MODEL?: string;
	SYNTH_MODEL?: string;
	ALLOWED_ORIGINS: string;
}

// ── Anthropic Messages API (minimal subset we use) ─────────────────────────
export interface TextBlock {
	type: "text";
	text: string;
}
export interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}
export interface ToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content: string;
	is_error?: boolean;
}
export type ContentBlock = TextBlock | ToolUseBlock;

export interface ClaudeMessage {
	role: "user" | "assistant";
	content: string | Array<TextBlock | ToolUseBlock | ToolResultBlock>;
}

export interface ClaudeResponse {
	id: string;
	role: "assistant";
	content: ContentBlock[];
	stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | null;
	usage?: { input_tokens: number; output_tokens: number };
}

export interface ToolDef {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
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
