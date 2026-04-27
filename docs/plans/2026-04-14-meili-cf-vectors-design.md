# queer.guide — Meilisearch + Cloudflare AI/Vectorize Design

Date: 2026-04-14
Status: Approved (Approach C — Hybrid orchestrated)

## Context

- Unified catalog: venues, events, cities, editorial, people (~100k–1M docs, growing).
- Languages: EN, DE, ES, FR.
- Users: authed + anonymous.
- Pains addressed: semantic relevance, personalization, facets, multilingual drift, cold start, cost/latency.

## Architecture

Meilisearch = source of truth for lexical + facets + filters + geo.
Cloudflare Vectorize = semantic ANN layer.
Cloudflare Worker = orchestrator (parallel fan-out, RRF fusion, personalization, rerank).
Cloudflare Workers AI `@cf/baai/bge-m3` (1024d, multilingual) = embeddings.
Cloudflare AI Gateway = embed cache.
Cloudflare D1 = user profiles, vibe centroids.
Cloudflare KV = session events, bias vectors.
Cloudflare Queue = ingest pipeline.

```
Ingest:  Source → Queue → Worker → bge-m3 embed → {Meili upsert, Vectorize upsert} (same id)
                                 ↘ AI Gateway caches

Query:   Worker ─┬─ Meili (keyword + facets + filters)
                 ├─ Vectorize (ANN top-100)
                 └─ D1/KV (profile + bias vector)
                 ↓ RRF fuse → personalization nudges → optional bge-reranker-base on top-20
                 ↓ hydrate via Meili
                 ↓ return with facet distribution
```

## 1. Data Model

### Canonical doc envelope (all entity types)

```json
{
  "id": "ven_berlin_sxl_001",
  "type": "venue|event|city|editorial|person",
  "slug": "schwuz-berlin",
  "title":   { "en": "...", "de": "...", "es": "...", "fr": "..." },
  "body":    { "en": "...", "de": "...", "es": "...", "fr": "..." },
  "summary": { "en": "...", "de": "...", "es": "...", "fr": "..." },
  "vibes": ["cruisy","artsy","mixed"],
  "categories": ["club","bar"],
  "city": "berlin",
  "country": "de",
  "_geo": { "lat": 52.49, "lng": 13.41 },
  "price_level": 2,
  "rating": 4.6,
  "popularity": 0.73,
  "opens_at": "2024-01-01",
  "closes_at": null,
  "tags": ["bdsm-friendly","wheelchair"],
  "media": { "hero": "..." },
  "updated_at": "2026-04-14T..."
}
```

### Meilisearch index `content`

- filterableAttributes: `type, city, country, vibes, categories, price_level, tags, opens_at, closes_at, _geo`
- sortableAttributes: `rating, popularity, opens_at, _geoPoint`
- searchableAttributes: `title.*, summary.*, body.*, tags`
- No vector store in Meili (Vectorize owns vectors).
- Synonyms per language file (e.g., `schwul ↔ gay ↔ queer`).

### Vectorize index `qg-content`

- Dim: 1024, metric: cosine.
- Metadata fields for pre-filter: `id, type, city, country, popularity, opens_at, closes_at`.
- Single index; filter via metadata (simpler than namespaces for cross-type federated search).

### Embedding text composer

```
{title.{lang}}. {summary.{lang}}. Vibes: {vibes}. In {city}, {country}. Type: {categories}.
```

Compose with all four languages concatenated → one multilingual vector per doc serves all query languages.

## 2. Ingest Pipeline

- Producer writes to Queue `ingest` on CMS/D1 change.
- Worker consumer (batch=100, concurrency=5):
  1. Compose embed text (all langs).
  2. Call bge-m3 via AI Gateway (cache key = sha256(text)).
  3. Upsert Meili by `id`.
  4. Upsert Vectorize by `id` with metadata subset.
- Idempotent: same `id` in both stores.
- Deletion: tombstone queue fans out to both.
- Backfill: cursor row in D1 `ingest_state`, resumable after failure.

## 3. Query Orchestration

Single endpoint `POST /search`:

```
Input:  { q, filters{}, facets[], user_id|device_id, lang, page, size }

1. Embed q via bge-m3 (AI Gateway cached).
2. Load user bias_vec from KV.
3. q_vec' = L2_norm(0.7*q_vec + 0.3*bias_vec).
4. Parallel:
   - Meili: q, filters, facets, localesHint=[lang], limit=100.
   - Vectorize: q_vec', metadata filter from `filters`, topK=100.
5. RRF fuse: score(d) = Σ 1/(60 + rank_i(d)).
6. Pre-rerank pool: top 20.
7. If |q| > 2 tokens AND user opted in: @cf/baai/bge-reranker-base on top-20.
8. Personalization nudges (additive, bounded):
   - +0.05 per matched user vibe
   - +0.10 if in user saved/home city
   - -0.15 if seen in last 24h (from KV)
9. Slice page, hydrate from Meili.
10. Return results + facetDistribution (from step 4 Meili side).
```

### Latency budget (edge, warm)

| Step | ms |
|---|---|
| embed (cached) | 5 |
| Meili + Vectorize parallel | 45 |
| RRF + nudges | 2 |
| reranker (when on) | 80 |
| hydrate | 10 |
| **p50 no rerank** | **~140** |
| **p50 with rerank** | **~220** |

### Cold-start fallbacks

- Zero lexical hits → semantic-only, relax filters; UI badge "broadened search".
- Zero total → city/country fallback → popularity top-N.

## 4. Personalization

### D1 `user_profiles`

```sql
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  langs TEXT,
  vibes TEXT,
  categories TEXT,
  home_city TEXT,
  travel_cities TEXT,
  onboarded INTEGER DEFAULT 0,
  updated_at INTEGER
);
```

### KV `sessions/{user_id|device_id}`

```json
{
  "events": [
    { "id":"ven_...", "action":"click", "ts": 1712300000, "dwell": 8.2 },
    { "id":"evt_...", "action":"save",  "ts": 1712301000 }
  ],
  "bias_vec": [ 0.12, -0.03, /* 1024 floats */ ],
  "bias_ts": 1712301500
}
```

Rolling 30-event window. Recompute bias when ≥N new events OR ≥15min stale.

### Bias vector math

```
weights: click=1, save=3, book=5, dismiss=-1
w_i = weight(action_i) * exp(-Δt / 14d)
bias = Σ w_i * Vectorize.getById(event.id).values
bias = L2_normalize(bias)
```

### Onboarding (20s, optional)

- Pick 3 vibes, home city, languages.
- Initial bias = mean of vibe **centroid vectors** stored in D1 (centroid = mean vector of top-50 items tagged with vibe, precomputed nightly).

### Anonymous → authed merge

On signup, combine device bias and user bias via weighted sum then normalize.

## 5. Faceted Search + Multilingual

- Meili `facetDistribution` on every query.
- Worker reorders facet **values** per user (user vibes first, then by count).
- Dynamic facet surface:
  - result set > 500 → show `vibes`, `categories`
  - result set < 50 → show `price_level`, `tags`
- Multilingual:
  - bge-m3 shared space → cross-language recall handled by vector side.
  - Meili lexical: one index with localized fields (`title.de`, etc.), `localesHint` at query time.
  - Return `title[user_lang] || title.en`.

## 6. Cost Model (500k docs, 500k q/mo, 1M ingest/mo)

| Item | Est. cost/mo |
|---|---|
| Vectorize storage (500k × 1024d) | $2.56 |
| Vectorize queries | ~$5 |
| Workers AI bge-m3 (50% cache hit) | ~$25 |
| Reranker (20% of queries) | ~$15 |
| AI Gateway | $0 |
| Workers requests | $0 (under free tier) |
| KV ops | ~$1 |
| D1 | $0 |
| Meilisearch (Cloud Build tier or VPS) | $15–$30 |
| **Total** | **~$65–$80** |

Scales linearly; Vectorize max 5M vectors/index and Meili ~5M docs/node remain comfortable.

## 7. Open Decisions

- Meili hosting: Cloud vs self-host on Hetzner (ops vs cost).
- Reranker default on/off (quality vs latency).
- Whether to add `@cf/baai/bge-m3` colbert-style multi-vector later for even higher recall.
- Event freshness boost curve (time-decay shape for events).

## 8. Milestones

1. Schema + ingest Worker + Queue wired; backfill all 5 entity types.
2. `/search` Worker with RRF, no personalization. Benchmark p50.
3. Personalization: D1 schema, KV session writer, bias vector, onboarding.
4. Facet reordering + dynamic facet surface.
5. Reranker feature-flagged, A/B vs no rerank.
6. Vibe centroids nightly job; cold-start seeding.
7. Cost/latency dashboards (AI Gateway + Workers analytics).
