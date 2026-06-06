/**
 * queer-guide-mcp — remote MCP server for queer.guide.
 *
 * Routing:
 *   /mcp, /sse                      → PUBLIC MCP (no auth). Read tools work;
 *                                     write tools return an auth hint.
 *   /authed                         → AUTHENTICATED MCP behind OAuth. Read +
 *                                     write tools; identity from Supabase.
 *   /authorize /token /register
 *   /.well-known/oauth-*            → OAuth 2.1 endpoints (workers-oauth-provider)
 *   /                /health        → landing + health
 *
 * Same DurableObject class serves both mounts; only the authed mount gets
 * grant props (the user's Supabase session). See mcp.ts.
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { QueerGuideMCP } from "./mcp";
import { AuthApp } from "./auth-app";
import type { Env } from "./types";

export { QueerGuideMCP };

const SERVE_OPTS = { binding: "MCP_OBJECT" } as const;

const publicStreamable = QueerGuideMCP.serve("/mcp", SERVE_OPTS);
const publicSSE = QueerGuideMCP.serveSSE("/sse", SERVE_OPTS);

const oauth = new OAuthProvider({
	apiRoute: "/authed",
	apiHandler: QueerGuideMCP.serve("/authed", SERVE_OPTS),
	defaultHandler: AuthApp as unknown as ExportedHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});

const LANDING = `<!doctype html><meta charset="utf-8">
<title>queer.guide MCP</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:64px auto;padding:0 16px">
<h1>queer.guide MCP server</h1>
<p>Model Context Protocol server for the queer.guide LGBTQ+ travel &amp; community platform.</p>
<h2>Connect</h2>
<ul>
  <li><b>Public (read-only):</b> <code>https://mcp.queer.guide/mcp</code> — search venues, events, cities, people, news; fetch details; LGBTQ+ travel safety knowledge. No sign-in.</li>
  <li><b>Authenticated (read + write):</b> <code>https://mcp.queer.guide/authed</code> — also submit places/events, save favorites, plan trips. Sign in with your queer.guide email.</li>
</ul>
</body>`;

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
		const { pathname } = new URL(request.url);

		if (pathname === "/" ) return new Response(LANDING, { headers: { "content-type": "text/html; charset=utf-8" } });
		if (pathname === "/health") return Response.json({ ok: true, ts: Date.now() });

		if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return publicStreamable.fetch(request, env, ctx);
		if (pathname === "/sse" || pathname.startsWith("/sse/")) return publicSSE.fetch(request, env, ctx);

		// Everything else (/, authed MCP, OAuth endpoints, .well-known) → provider.
		return oauth.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
