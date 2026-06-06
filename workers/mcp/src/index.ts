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
import { refreshSession } from "./supabase";
import type { Env, Props } from "./types";

export { QueerGuideMCP };

const SERVE_OPTS = { binding: "MCP_OBJECT" } as const;

const publicStreamable = QueerGuideMCP.serve("/mcp", SERVE_OPTS);
const publicSSE = QueerGuideMCP.serveSSE("/sse", SERVE_OPTS);

// The token-exchange callback runs inside a request but isn't handed `env`, so
// stash the current request's env for it to read.
let currentEnv: Env | undefined;

// Keep our access-token TTL under Supabase's ~1h so the MCP client refreshes
// (which refreshes the upstream Supabase session below) before it can expire.
const ACCESS_TOKEN_TTL = 3000;

const oauth = new OAuthProvider({
	apiRoute: "/authed",
	apiHandler: QueerGuideMCP.serve("/authed", SERVE_OPTS),
	defaultHandler: AuthApp as unknown as ExportedHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
	// On every OAuth token refresh, refresh the upstream Supabase session and
	// persist it into the grant — so write tools keep working across reconnects.
	tokenExchangeCallback: async ({ grantType, props }) => {
		const p = props as Props;
		if (grantType === "refresh_token" && p?.supabaseRefreshToken && currentEnv) {
			const s = await refreshSession(currentEnv, p.supabaseRefreshToken);
			if (s) {
				return {
					newProps: { ...p, supabaseAccessToken: s.access_token, supabaseRefreshToken: s.refresh_token },
					accessTokenTTL: ACCESS_TOKEN_TTL,
				};
			}
		}
		return { accessTokenTTL: ACCESS_TOKEN_TTL };
	},
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

const isMcpTraffic = (p: string): boolean =>
	p === "/mcp" || p.startsWith("/mcp/") || p === "/sse" || p.startsWith("/sse/") || p === "/authed" || p.startsWith("/authed/");

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		currentEnv = env;
		const url = new URL(request.url);
		const { pathname, origin } = url;
		const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;

		if (pathname === "/" ) return new Response(LANDING, { headers: { "content-type": "text/html; charset=utf-8" } });
		if (pathname === "/health") return Response.json({ ok: true, ts: Date.now() });

		// RFC 9728 protected-resource metadata for the /authed mount. The OAuth
		// provider (v0.0.5) doesn't emit this; MCP clients fetch it (optionally
		// path-suffixed) to discover the authorization server.
		if (pathname === "/.well-known/oauth-protected-resource" || pathname.startsWith("/.well-known/oauth-protected-resource/")) {
			return Response.json(
				{ resource: `${origin}/authed`, authorization_servers: [origin] },
				{ headers: { "access-control-allow-origin": "*" } },
			);
		}

		// Per-IP rate limit on MCP traffic (skip CORS preflight). Fail-open: a
		// limiter hiccup must never take the server down.
		if (request.method !== "OPTIONS" && isMcpTraffic(pathname)) {
			const ip = request.headers.get("CF-Connecting-IP") ?? "anon";
			try {
				const { success } = await env.MCP_RL.limit({ key: ip });
				if (!success) {
					return new Response(JSON.stringify({ error: "rate_limited" }), {
						status: 429,
						headers: { "content-type": "application/json", "retry-after": "60" },
					});
				}
			} catch (e) {
				console.warn("rate limit check failed (allowing):", (e as Error).message);
			}
		}

		if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return publicStreamable.fetch(request, env, ctx);
		if (pathname === "/sse" || pathname.startsWith("/sse/")) return publicSSE.fetch(request, env, ctx);

		// Everything else (authed MCP, OAuth endpoints, .well-known) → provider.
		const res = await oauth.fetch(request, env, ctx);

		// Point the 401 challenge at the protected-resource metadata (RFC 9728)
		// so MCP clients can auto-discover the OAuth flow.
		const wa = res.status === 401 ? res.headers.get("www-authenticate") : null;
		if (wa && !wa.includes("resource_metadata")) {
			const headers = new Headers(res.headers);
			headers.set("www-authenticate", `${wa}, resource_metadata="${resourceMetadataUrl}"`);
			return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
		}
		return res;
	},
} satisfies ExportedHandler<Env>;
