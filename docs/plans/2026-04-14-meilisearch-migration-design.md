# Meilisearch Migration Design

**Date:** 2026-04-14
**Status:** Approved
**Goal:** Replace PostgreSQL FTS with self-hosted Meilisearch for full-text + semantic hybrid search across all content types.

## Problem

Current PostgreSQL FTS (`universal_search()`) lacks:
- Typo tolerance (misspelled names return zero results)
- Semantic understanding (natural language queries like "best clubs near me" fail)
- Good relevance ranking across 11 content types
- Efficient faceted search with counts

## Solution: Self-Hosted Meilisearch

Full migration from Postgres FTS to Meilisearch with hybrid search (keyword + semantic via OpenAI embeddings).

## Architecture

```
React Frontend
    ↓
Cloudflare Worker (search-proxy)
    ↓
Self-hosted Meilisearch (Docker on Hetzner, EU)
    ↑
Supabase Edge Function (meilisearch-sync) ← DB Webhooks + Daily Cron
    ↑
PostgreSQL (source of truth)
```

### Infrastructure

- **Server:** Hetzner CPX31 (4 vCPU, 8GB RAM, ~EUR 15/mo), EU region
- **Meilisearch:** Docker container behind Caddy reverse proxy with HTTPS
- **API Keys:** Master key (admin), search-only key (CF Worker)
- **Search Proxy:** Cloudflare Worker `search-proxy` — holds API key, CORS, rate limiting

## Index Structure

11 indexes, one per content type:

| Index | Searchable Attributes (priority) | Filterable | Geo |
|-------|----------------------------------|-----------|-----|
| `venues` | name, description, address, city, tags | city, country, category, featured, price_range, rating, accessibility | yes |
| `events` | title, description, location, tags | city, country, event_type, date, featured, accessibility | yes |
| `cities` | name, country_name, description | country, continent | yes |
| `countries` | name, description | continent | no |
| `news` | title, content, source | category, is_featured, published_at | no |
| `marketplace` | title, description, tags | category, price, condition | no |
| `personalities` | name, profession, lgbti_connection | profession, nationality | no |
| `tags` | name, description, category | category | no |
| `hotels` | name, description, city | city, country, price_range, rating | yes |
| `queer_villages` | name, description, city | city, country | yes |
| `festivals` | name, description, location | city, country, date | yes |

All geo-enabled indexes include `_geo: { lat, lng }` field.

## Hybrid Search Configuration

- **Embedder:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Semantic ratio:** 0.5 default (50% keyword, 50% semantic)
- **Prompt template:** Content-type aware ("This is an LGBTQ+ venue: {title} — {description}")
- **Short queries (<3 words):** Pure keyword search
- **Long queries:** Hybrid (keyword + semantic)

## Data Sync

### Initial Sync
- New Supabase edge function `meilisearch-sync` (based on existing `algolia-sync` blueprint)
- Queries all records per content type, transforms, batch upserts to Meilisearch

### Incremental Sync
- Supabase Database Webhooks on INSERT/UPDATE/DELETE for each content table
- Calls `meilisearch-sync` with `{ action: 'upsert'|'delete', type, id }`
- Near real-time (<5s lag)

### Full Reconciliation
- Daily cron full sync to catch drift (GitHub Actions or Supabase scheduled function)

## Frontend Changes

| File | Change |
|------|--------|
| `useSearch.tsx` | Replace `invokeWithRetry('search', ...)` with CF Worker call. Map Meilisearch response to `SearchResult` interface. |
| `useSearchSuggestions.tsx` | Replace parallel `ilike` queries with Meilisearch multi-index prefix search. |
| `UniversalSearchBar.tsx` | Consume facet data from Meilisearch for filter counts. |
| `SearchResults.tsx` | Use Meilisearch `facetDistribution` for tab counts. |
| `SearchFiltersPanel.tsx` | Wire facet counts into filter badges. |

## Migration Sequence

1. Deploy Meilisearch server (Docker + Caddy on Hetzner)
2. Build `meilisearch-sync` edge function, run initial full sync
3. Build CF Worker `search-proxy`
4. Update frontend hooks + components
5. Set up incremental sync via DB webhooks
6. Enable hybrid search (embeddings configuration)
7. Deprecate `search` edge function + `universal_search()` RPC
8. Remove `algolia-sync` dead code

## Cost

- VPS: ~EUR 15-30/mo (Hetzner CPX31)
- Embeddings: ~$15 initial, pennies/day ongoing
- CF Worker: Free tier
- Total: ~$20-40/mo

## Key Files

- `/web/supabase/functions/search/index.ts` — current search endpoint (to be deprecated)
- `/web/supabase/functions/algolia-sync/index.ts` — sync blueprint to clone
- `/web/src/hooks/useSearch.tsx` — search hook
- `/web/src/hooks/useSearchSuggestions.tsx` — autocomplete hook
- `/web/src/components/search/UniversalSearchBar.tsx` — search UI (722 lines)
- `/web/src/pages/SearchResults.tsx` — results page
- `/web/src/components/search/SearchFiltersPanel.tsx` — filter panel
