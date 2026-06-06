# queer-guide-mcp

Remote [Model Context Protocol](https://modelcontextprotocol.io) server for queer.guide. Lets any MCP client (Claude, ChatGPT, Cursor, …) search, read, and — when signed in — write to the platform.

Built on Cloudflare's `agents` `McpAgent` + `@cloudflare/workers-oauth-provider`. It re-wraps the same Postgres RPCs the in-app assistant and search proxy use; it adds almost no new business logic.

## Endpoints

| Path | Auth | Tools |
|------|------|-------|
| `https://mcp.queer.guide/mcp` (Streamable HTTP) | none | read tools |
| `https://mcp.queer.guide/sse` (SSE fallback) | none | read tools |
| `https://mcp.queer.guide/authed` | OAuth 2.1 | read + write tools |
| `/authorize` `/token` `/register` `/.well-known/oauth-*` | — | OAuth flow |

Write tools are registered on both mounts; on the public mount they return an auth hint instead of running.

## Tools

**Read (public):** `search`, `autocomplete`, `get_entity`, `find_related`, `recommendations`, `events_in_window`, `on_this_day`, `knowledge` (AutoRAG over published guides — safety/advice with citable sources).

**Write (authenticated):** `submit_place`, `submit_event` (→ moderation/dedupe pipeline, not published immediately), `save_favorite`, `list_favorites`, `create_trip`, `list_my_trips`, `add_to_trip`.

**Resources:** `queerguide://city/{slug}` and `queerguide://country/{slug}` — pin a destination as context; resolves to the full record. `resources/list` surfaces a discoverable set of cities/countries; any valid slug works via the template.

## Auth model

- Read tools call Supabase RPCs with the **anon key** — every discovery RPC is granted to `anon`, so no service-role key sits in this public worker.
- Write tools forward the **user's Supabase JWT** (held in the OAuth grant props) so the platform's existing **RLS** policies authorize every write — no privilege escalation through MCP.
- Login is email one-time-code against Supabase GoTrue (works for password / passkey / magic-link accounts — same email identity). The OAuth provider issues its own access token mapped to the user's Supabase session.

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in keys
npm run dev                      # wrangler dev on :8787
npm run typecheck
npm test
```

## Deploy

```bash
# one-time: create the OAuth KV namespace, paste its id into wrangler.toml
wrangler kv namespace create OAUTH_KV

# secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY

wrangler deploy
# add the mcp.queer.guide custom domain in the CF dashboard (or via routes)
```

Requires the `get_entity_detail` RPC (migration `20260606120000_get_entity_detail_rpc.sql`) and the AutoRAG instance `queerguide`.

## Verify

Add `https://mcp.queer.guide/mcp` to an MCP client and call `search`. For writes, add `https://mcp.queer.guide/authed`, complete the email-code sign-in, then call `list_my_trips` / `submit_place`.

## Not in v1 (follow-ups)

- Admin/pipeline tools (triage, dedup, workflow control).
- Marketplace checkout.
- Refreshed access tokens are not yet persisted back to the OAuth grant (refreshed in-memory per session).
- Public MCP registry listing — artifact + steps ready in [`server.json`](./server.json) + [`PUBLISHING.md`](./PUBLISHING.md); one human-gated auth step remains.
