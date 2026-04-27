# queer.guide Search System v2

Personalized, multilingual, hybrid search across all entity types.

## Topology

```
Frontend (web / app)
    │
    │  POST /search /track /similar /onboarding
    ▼
queer-guide-search-proxy (Cloudflare Worker)
    │   ├── AI Gateway (qg-search) ── Workers AI (bge-base-en-v1.5 embed, bge-reranker-base)
    │   ├── Meilisearch (multi-search, hybrid, facets, geo, synonyms)
    │   └── Supabase RPC
    │           ├── personalized_semantic_search (pgvector ANN, HNSW)
    │           ├── get_bias_signal (weighted mean of recent user events)
    │           ├── get_user_signal (interests, recent cities/tags)
    │           └── track_user_event / v_popular_entities (cold-start)

Supabase (source of truth)
    │   INSERT/UPDATE/DELETE on venues, events, cities, ...
    │
    │   DB webhook POST /webhook (X-QG-Token)
    ▼
queer-guide-search-ingest (Cloudflare Worker)
        ├── Workers AI embed (cached in KV)
        ├── upsert content_embeddings (pgvector)
        └── upsert Meilisearch doc
```

## Repos / dirs

| Path | What |
|---|---|
| `worker/` | Search proxy (the read path) |
| `worker-ingest/` | Ingest + backfill (the write path) |
| `client-sdk/qg-search.ts` | Drop-in client SDK (browser + node) |
| `scripts/configure-meili.sh` | One-shot Meili settings (embedder, facets, synonyms) |
| `scripts/setup-webhooks.sql` | Attach DB triggers that POST to ingest worker |
| `scripts/backfill.sh` | Walk all rows of each table and re-index |
| `docs/plans/2026-04-14-meili-cf-vectors-design.md` | Design doc |

## Resources provisioned

- Cloudflare account: `7aa3765cc5f50f2b681b782eb4a8d296` (Queer Guide)
- KV `qg-search-embed-cache` = `f54d40f6d0fa4c5680857dbb21971a02`
- KV `qg-ingest-state` = `a54963b21b5a497aa0ef76e08fc8923c`
- Supabase project: `xqeacpakadqfxjxjcewc`
  - migration `personalization_search_v1` applied
  - HNSW index on `content_embeddings.embedding`
  - RPCs: `track_user_event`, `get_bias_signal`, `personalized_semantic_search`, `get_user_signal`
  - view: `v_popular_entities`
- Worker (existing, to be replaced by v2): `queer-guide-search-proxy`

## Deploy runbook

### 1. Create AI Gateway

Dashboard → AI → AI Gateway → create `qg-search` (enables caching + logs).

### 2. Deploy search proxy

```bash
cd worker
npm i
wrangler secret put MEILISEARCH_SEARCH_KEY
wrangler secret put SUPABASE_URL          # https://xqeacpakadqfxjxjcewc.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY
wrangler deploy
```

### 3. Deploy ingest worker

```bash
cd ../worker-ingest
npm i
wrangler secret put MEILISEARCH_ADMIN_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put INGEST_TOKEN          # random 32+ char token
wrangler deploy
```

### 4. Configure Meilisearch

```bash
MEILI_URL=https://meili.queer.guide \
MEILI_ADMIN_KEY=... \
CF_ACCOUNT=7aa3765cc5f50f2b681b782eb4a8d296 \
CF_TOKEN=...  # Cloudflare API token with Workers AI:Read \
  bash scripts/configure-meili.sh
```

### 5. Attach DB webhooks

```sql
ALTER DATABASE postgres SET app.ingest_token = '<same as INGEST_TOKEN>';
```

Then run `scripts/setup-webhooks.sql` in Supabase SQL editor.

### 6. Backfill

```bash
INGEST_URL=https://queer-guide-search-ingest.workers.dev \
INGEST_TOKEN=... \
  bash scripts/backfill.sh
```

Paces ~100 docs / batch. Full rebuild of 13k takes ~20 min at Workers AI free tier.

### 7. Verify

```bash
curl -X POST https://queer-guide-search-proxy.workers.dev/search \
  -H 'content-type: application/json' \
  -d '{"query":"gay bar berlin","session_id":"t1","debug":true}' | jq
```

Expected `debug` block:
```
{ biasApplied: false, biasEvents: 0, semSize: >0, meiliSize: >0, fusedSize: >0, reranker: true }
```

## Operations

### Reset embeddings / re-index single row

```bash
curl -X POST $INGEST_URL/reembed-one \
  -H "X-QG-Token: $INGEST_TOKEN" \
  -d '{"table":"venues","id":"<uuid>"}'
```

### Switch off reranker (A/B)

```bash
cd worker
wrangler secret put ENABLE_RERANKER --value 0
```

### Cost levers

- Turn off reranker → saves ~$15/mo at 500k q/mo
- Increase embed cache TTL (in `embed()` fn) → saves Workers AI calls
- Meili `semanticRatio: 0` disables per-index vector → saves Meili RAM

## Known follow-ups

1. **Multilingual embed (DE/ES/FR).** Migrate `content_embeddings.embedding` from `vector(768)` → `vector(1024)` and switch `EMBED_MODEL` to `@cf/baai/bge-m3`. Requires full re-embed and HNSW rebuild.
2. **Embedder model mismatch.** Existing 13149 rows were embedded with an unknown 768-dim model. Worker queries use bge-base-en-v1.5. If sim quality is poor, `scripts/backfill.sh` re-embeds everything in-place using bge-base-en-v1.5.
3. **Federated dedup.** Across-type dedup (a "Berlin Pride" row appearing as both event + city mention) can be done via `slug` grouping — not yet implemented.
4. **Seen-recently decay.** Worker currently has placeholder `seenRecently` set; needs KV read from `sessions/<sid>` within `/search`. Add when needed.
5. **RLS for RPCs.** `SECURITY DEFINER` RPCs (`personalized_semantic_search`, `get_bias_signal`, `track_user_event`) are called from the worker via `SUPABASE_SERVICE_KEY` — service role bypasses GRANTs. Inputs sanitized by `search_path` pin. If any of these are ever exposed to the browser, validate `user_id` matches JWT `sub` via an `auth.uid()` wrapper.
