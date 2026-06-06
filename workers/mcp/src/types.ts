/** Shared types for the queer-guide-mcp worker. */

export interface Env {
	/** DO namespace backing MCP sessions. */
	MCP_OBJECT: DurableObjectNamespace;
	/** workers-oauth-provider storage. */
	OAUTH_KV: KVNamespace;
	/** Workers AI — query embeddings + AutoRAG. */
	AI: Ai;
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
	AI_GATEWAY_NAME?: string;
}

/**
 * Per-session auth context. Set by the OAuth flow (auth-app.ts →
 * completeAuthorization) and surfaced as `this.props` inside the McpAgent.
 * Empty on the public (unauthenticated) mount — write tools detect that and
 * return an auth-required hint.
 */
export interface Props extends Record<string, unknown> {
	userId?: string;
	email?: string;
	supabaseAccessToken?: string;
	supabaseRefreshToken?: string;
}

export const ENTITY_TYPES = [
	"venue",
	"event",
	"city",
	"country",
	"news",
	"marketplace",
	"personality",
	"tag",
	"queer_village",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
