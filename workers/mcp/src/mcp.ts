/**
 * QueerGuideMCP — the MCP server, backed by a Durable Object (one per session).
 *
 * The same class is mounted twice by index.ts:
 *   - public, unauthenticated  → `this.props` is empty; read tools work, write
 *     tools return an auth hint.
 *   - behind OAuthProvider     → `this.props` carries the user's Supabase
 *     session; write tools authorize via RLS.
 *
 * Tool handlers read `this.props` live (not a snapshot), so a token refreshed
 * mid-session is picked up by later calls.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, Props } from "./types";
import { registerTools, type Agent } from "./tools";
import { registerResources } from "./resources";

export class QueerGuideMCP extends McpAgent<Env, unknown, Props> {
	server = new McpServer({
		name: "queer.guide",
		version: "0.1.0",
	});

	async init(): Promise<void> {
		registerTools(this as unknown as Agent);
		registerResources(this as unknown as Agent);
	}
}
