# queer.guide Search System

> **Status (2026-07):** The search engine is **Postgres + Cloudflare**. The Meilisearch-based
> "v2" design that this file used to document was **decommissioned code-side in 2026-06** and is
> no longer accurate. This file is kept only as a pointer to the current sources of truth.

## Current architecture (authoritative docs)

- **`workers/search-proxy/README.md`** — the live read path: the `search-proxy` Cloudflare Worker
  serving `/search` + `/autocomplete` from Postgres RPCs, layering bge-m3 embeddings (via AI
  Gateway), personalization, optional reranker, and safety gating.
- **`CLAUDE.md` → Infrastructure → Search** — the canonical summary: denormalized
  `search_documents` table (weighted tsvector + `vector(1024)` HNSW embedding + PostGIS `geog` +
  facets/trust/liveness/price/temporal), the `search_hybrid` / `search_facets` /
  `search_autocomplete` RPCs, and the entity/`content_embeddings` trigger sync that keeps
  `search_documents` fresh.

## Historical record

- **`docs/search-intelligence/meili-to-postgres-migration-plan.md`** — the migration plan that
  moved search off Meilisearch onto Postgres. Retained deliberately as the historical record;
  the other `docs/search-intelligence/*.md` analysis docs predate the migration and describe the
  Meilisearch-era design.

The former Meilisearch nodes, ingest worker, `configure-meili.sh` / `backfill.sh` scripts, and
the `worker/` + `worker-ingest/` directories referenced by the old version of this doc no longer
exist. `INDEX_MAP` / `ALL_INDEXES` in `workers/search-proxy/src/entityIndex.ts` are active
Postgres-side entity-type normalization despite the Meili-flavored names — keep them.
