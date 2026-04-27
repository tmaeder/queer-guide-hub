# queer-guide-search-proxy v2

Personalized hybrid search: Meilisearch (lexical + Meili-hybrid) + Supabase pgvector (semantic + personalization) + Workers AI (bge-base-en-v1.5 embed, bge-reranker-base).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/search` | Hybrid + personalized results |
| POST | `/track` | Record user event (click / save / book / dismiss / view) |
| POST | `/onboarding` | Persist user prefs at signup |
| POST | `/similar` | "More like this" via vector |
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
cd worker
npm i
wrangler secret put MEILISEARCH_SEARCH_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler deploy
```

### AI Gateway

Create a gateway named `qg-search` in the Cloudflare dashboard (AI > AI Gateway). It caches embed + rerank calls.

## Env bindings

| Name | Kind | Source |
|---|---|---|
| `AI` | Workers AI | platform |
| `EMBED_CACHE` | KV | `f54d40f6d0fa4c5680857dbb21971a02` |
| `MEILISEARCH_URL` | var | wrangler.toml |
| `MEILISEARCH_SEARCH_KEY` | secret | `wrangler secret put` |
| `SUPABASE_URL` | secret | `wrangler secret put` |
| `SUPABASE_SERVICE_KEY` | secret | `wrangler secret put` |
| `ALLOWED_ORIGINS` | var | wrangler.toml |
| `AI_GATEWAY_ACCOUNT_ID` | var | wrangler.toml |
| `AI_GATEWAY_NAME` | var | wrangler.toml |
| `EMBED_MODEL` | var | default `@cf/baai/bge-base-en-v1.5` |
| `ENABLE_RERANKER` | var | `"1"` to enable bge-reranker-base on top-20 |

## Caveats / Follow-ups

1. **Embed model compat.** Existing `content_embeddings` are 768-dim. `@cf/baai/bge-base-en-v1.5` is 768-dim EN. If existing docs were embedded with a different 768-dim model, query/doc drift reduces semantic quality. Verify by spot-check: compare cosine sim between `embed(venue.title)` and row `embedding`. If drift is high, re-embed all docs with bge-base-en-v1.5 (~30min for 13k).
2. **Multilingual (DE/ES/FR).** bge-base-en is EN only. For real multilingual support migrate to `@cf/baai/bge-m3` (1024-dim). Requires: (a) drop HNSW index; (b) `ALTER COLUMN embedding TYPE vector(1024)`; (c) re-embed all 13k+ docs; (d) recreate HNSW; (e) update `EMBED_MODEL` and function signatures.
3. **Meili hybrid embedder.** The worker sets `hybrid: { embedder: "default" }`. Meili must have an embedder named `default` configured that matches the 768-dim model. Check via `GET /indexes/venues/settings`. If missing, set `semanticRatio: 0` or configure embedder in Meili.
4. **Reranker default.** Adds ~80ms. Start with `ENABLE_RERANKER=0`, A/B before enabling permanently.
5. **Personalization cold start.** New users with no events → bias vector null, falls back to pure query + interests/home_city nudges via `/onboarding`.
6. **Session id generation.** Client is responsible. Recommend UUID v4 in localStorage, merged into user record on signup.
