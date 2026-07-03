# queer-guide-search-proxy

Personalized hybrid search served entirely from Postgres: the `search_hybrid` /
`search_facets` / `search_autocomplete` RPCs fuse keyword (FTS + trigram) and
vector (pgvector) legs with RRF in SQL; the Worker layers query embedding
(Workers AI `@cf/baai/bge-m3` via AI Gateway), personalization
(`personalizedRank`), the optional reranker, and safety gating (JWT-verified
`include_gated`) on top. Meilisearch was decommissioned in 2026-06; there is no
backend flag — Postgres is the only path.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/search` | Hybrid + personalized results |
| POST | `/autocomplete` | Prefix + trigram suggestions |
| POST | `/track` | Record user event (click / save / book / dismiss / view) |
| POST | `/onboarding` | Persist user prefs at signup |
| POST | `/similar` | "More like this" via vector |
| POST | `/recommendations` | Personalized recommendations |
| POST | `/trending` | Trending entities |
| POST | `/feedback` | Search feedback |
| GET | `/go` | Affiliate link redirect (Awin / Amazon wrap) |
| GET | `/admin/analytics` | Search analytics (ADMIN_TOKEN gated) |
| GET | `/health` | Ping |

### `/search` request

```json
{
  "query": "cruisy bar berlin",
  "filters": { "types": ["venues"], "city": "berlin", "lat": 52.5, "lng": 13.4, "radius": 5 },
  "hitsPerPage": 20,
  "user_id": "uuid | null",
  "session_id": "client-generated",
  "lang": "en|de|es|fr",
  "debug": false
}
```

### `/track` request

```json
{
  "user_id": "uuid | null",
  "session_id": "abc",
  "event_type": "click|view|save|favorite|book|attend|dismiss",
  "entity_type": "venue|event|city|personality|news|tag",
  "entity_id": "uuid",
  "metadata": { "city": "berlin", "tags": ["cruisy","bar"] }
}
```

## Deploy

```bash
cd workers/search-proxy
npm i
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SUPABASE_JWT_SECRET   # optional — offline HS256 JWT verify (else GoTrue check)
wrangler secret put SESSION_SIGNING_KEY   # optional — signed session-id cookies
wrangler deploy
```

### AI Gateway

Create a gateway named `qg-search` in the Cloudflare dashboard (AI > AI Gateway). It caches embed + rerank calls.

## Env bindings

| Name | Kind | Source |
|---|---|---|
| `AI` | Workers AI | platform |
| `EMBED_CACHE` | KV | wrangler.toml |
| `SESSION_CACHE` | KV | wrangler.toml |
| `SUPABASE_URL` | secret | `wrangler secret put` |
| `SUPABASE_SERVICE_KEY` | secret | `wrangler secret put` |
| `SUPABASE_JWT_SECRET` | secret | optional, offline JWT verification for safety gating |
| `SESSION_SIGNING_KEY` | secret | optional, HMAC-signed session ids |
| `ALLOWED_ORIGINS` | var | wrangler.toml |
| `AI_GATEWAY_ACCOUNT_ID` | var | wrangler.toml |
| `AI_GATEWAY_NAME` | var | wrangler.toml |
| `EMBED_MODEL` | var | `@cf/baai/bge-m3` (1024-dim, multilingual) |
| `ENABLE_RERANKER` | var | `"1"` to enable the reranker on top-20 |
| `AWIN_AFFILIATE_ID` / `AWIN_MERCHANT_MIDS` / `AMAZON_ASSOCIATES_TAG` | var | affiliate `/go` wrapping |
| `ADMIN_TOKEN` | secret | gates `/admin/analytics` |

## Caveats

1. **Reranker latency.** Adds ~80ms; enabled via `ENABLE_RERANKER=1`.
2. **Personalization cold start.** New users with no events → bias vector null,
   falls back to pure query + interests/home_city nudges via `/onboarding`.
3. **Session id generation.** Client is responsible. UUID v4 in localStorage,
   merged into the user record on signup.
4. **Safety gating.** Gated (high-risk-country) rows are excluded unless the
   caller presents a valid Supabase JWT; verification is fail-closed. See the
   safety-layer notes in the repo CLAUDE.md.
