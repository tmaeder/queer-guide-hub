/** Anthropic Messages API client, proxied through the qg-search AI Gateway. */

import type { Env, ClaudeMessage, ClaudeResponse, ToolDef } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;
const TIMEOUT_MS = 20000;

function gatewayUrl(env: Env): string {
	// AI Gateway gives caching, rate-limit, fallback, and unified observability.
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/anthropic/v1/messages`;
}

export async function callClaude(
	env: Env,
	args: {
		model: string;
		system: string;
		messages: ClaudeMessage[];
		tools?: ToolDef[];
		maxTokens?: number;
	},
): Promise<ClaudeResponse> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("claude-timeout"), TIMEOUT_MS);
	try {
		const res = await fetch(gatewayUrl(env), {
			method: "POST",
			headers: {
				"x-api-key": env.ANTHROPIC_API_KEY,
				"anthropic-version": ANTHROPIC_VERSION,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: args.model,
				max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
				system: args.system,
				messages: args.messages,
				...(args.tools && args.tools.length ? { tools: args.tools } : {}),
			}),
			signal: controller.signal,
		});
		if (!res.ok) {
			throw new Error(`anthropic ${res.status}: ${await res.text()}`);
		}
		return (await res.json()) as ClaudeResponse;
	} finally {
		clearTimeout(timer);
	}
}
