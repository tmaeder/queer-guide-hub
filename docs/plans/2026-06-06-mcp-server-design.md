# Queer.Guide MCP Server — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming) → ready to plan/implement
**Goal:** Expose queer.guide as a remote MCP server so any AI client (Claude, ChatGPT, Cursor, …) can search, read, and — when authenticated — write to the platform.

## Decisions

| Dimension | Choice |
|-----------|--------|
| Audience | All — public anonymous + authenticated QG users |
| Capabilities | Search & discovery, entity detail, temporal/contextual, write/actions |
| Transport | Remote MCP on a new Cloudflare Worker, Streamable HTTP |
| Hostname | `mcp.queer.guide` |
| Build order | All-at-once (read + OAuth + write in one milestone) |
| Framework | Cloudflare `agents` `McpAgent` + `@cloudflare/workers-oauth-provider` (Durable Object backed) |
| IdP for writes | Supabase Auth (upstream) |

## Why this is mostly assembly, not greenfield

Every backend primitive already exists:

- **RPC wrapper pattern** — `workers/assistant/src/tools.ts` (`rpc()` helper, bge-m3 `embedQuery`, fail-soft).
- **JWT verify (JWKS + jose)** — `workers/submit/src/auth.ts` (`verifySupabaseJwt`, `extractBearer`).
- **Authenticated write path** — `workers/submit/` writes to `ingestion_staging` with RLS authorized by passing the **user** JWT (not the service key) on the insert.
- **Knowledge/RAG** — AutoRAG instance `queerguide` (web crawl of the site).
- **Discovery RPCs** — `search_hybrid`, `search_autocomplete`, `get_recommendations`, `related_entities`, `events_in_window`, `personalities_on_this_day`, `find_duplicate_clusters`.

The MCP worker re-wraps these behind the protocol; it adds almost no new business logic.

## Architecture

```
AI client (Claude/Cursor/ChatGPT)
        │  Streamable HTTP (MCP)
        ▼
mcp.queer.guide  ── CF Worker (workers/mcp/)
   ├─ workers-oauth-provider   ← OAuth 2.1 (Supabase upstream)
   ├─ McpAgent (Durable Object) ← session + tool registry
   │     ├─ public tools  → Supabase RPCs via SERVICE key
   │     └─ write tools   → Supabase REST via USER jwt (RLS)
   ├─ AI binding → bge-m3 embeddings + AutoRAG `queerguide`
   └─ secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET
```

Public tools run unauthenticated (service key, read-only RPCs). Write/personal tools require a Bearer token minted by the OAuth flow; the worker forwards that **user** JWT to Supabase so Row-Level Security authorizes the write exactly as the submit worker does today.

## Tools

### Public (no auth)

| Tool | Backed by | Args |
|------|-----------|------|
| `search` | `search_hybrid` (+ bge-m3 embed, RRF) | `query`, `types[]`, `city`, `lat/lng/radius_km`, `limit` |
| `autocomplete` | `search_autocomplete` | `prefix`, `types[]`, `limit` |
| `get_entity` | REST select / detail RPC | `type`, `id` or `slug` → full public record incl. `trust_score`, `liveness_status`, geo, sources |
| `find_related` | `related_entities` | `entity_type`, `entity_id`, `limit` |
| `recommendations` | `get_recommendations` | `types[]`, `city`, `limit` |
| `events_in_window` | `events_in_window` | `from`, `to`, `lat/lng/radius_km`, `limit` |
| `on_this_day` | `personalities_on_this_day` | `month`, `day` |
| `knowledge` | AutoRAG `queerguide` | `query` → passages + citable source URLs |

### Authenticated (Supabase JWT via OAuth)

| Tool | Backed by | Notes |
|------|-----------|-------|
| `submit_place` | `ingestion_staging` (user JWT, RLS) | mirrors submit worker; `source_type='user_submission'` → existing normalize→dedupe→…→commit pipeline |
| `submit_event` | `ingestion_staging` (user JWT) | same pipeline |
| `plan_trip` / `add_to_trip` | trip tables | create/append itinerary |
| `save_favorite` / `list_favorites` | favorites table | per-user saves |

### Resources (optional, low cost)

- `queerguide://city/{slug}`, `queerguide://country/{slug}` — guide pages a client can pin as destination context.

## Safety & security

- Service key never leaves the worker; only public read RPCs use it.
- Writes use the user's JWT → RLS is the authorization boundary (no privilege escalation through MCP).
- Surface `trust_score` / `liveness_status` in `get_entity` + `search` so the AI can warn on stale/dead/closed/risky entries.
- Exclude `duplicate_of_id IS NOT NULL` (parity with site search).
- Personality free-text (`lgbti_connection`) is already public on-site, but is uncontrolled and carries outing/mis-ID risk (see audit `docs/audits/2026-06-05-trust-safety-audit.md`). Return it as-is (no new exposure) but do **not** add any tool that infers/derives orientation.
- CF rate limiting on public tools; per-token limits on write tools.
- DB is disk-constrained — write tools must not enable bulk inserts; one entity per call, pipeline handles the rest.

## Deploy

1. Scaffold `workers/mcp/` (wrangler, `agents` + `workers-oauth-provider`, Durable Object binding, AI binding).
2. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`.
3. OAuth: register the worker as a Supabase Auth client; map MCP OAuth flow → Supabase session.
4. CF route + DNS `mcp.queer.guide`.
5. `wrangler deploy` from `workers/mcp/`.
6. Verify on a real client (add `https://mcp.queer.guide/mcp` in Claude/Cursor); test a public search + an authenticated submit end-to-end.
7. List in the public MCP registry.

## Out of scope (YAGNI for v1)

- Admin/pipeline-management tools (triage, dedup, workflow control) — internal, defer.
- Marketplace write/checkout.
- Streaming/long-running tool results.
