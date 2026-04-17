# Deprecation plan: `scraper_*` entity tables

## Status
**Proposed — not yet started.** Code still writes to these tables. This document is the migration roadmap.

## Motivation

`scraper_venues`, `scraper_events`, `scraper_places`, `scraper_stays` exist as a local staging/dedup workspace before data ships to Supabase `ingestion_staging`. In practice they duplicate a substantial fraction of what ends up in Supabase canonical tables AND the dedup logic running against them diverges from the authoritative Supabase pipeline (trigram + phone/email/domain RPCs).

Observed costs:
- **Storage duplication** — every canonical venue lives both locally and in Supabase.
- **Dedup divergence** — scraper uses Levenshtein + geo-proximity; Supabase uses trigram + phone_e164 / website_domain / email_lower matching. Results differ on the edge.
- **Stale rows** — local tables have no cleanup story; orphan detection only added in migration 005.

## Target architecture

Local persistence retains *audit-only* tables:
- `scraper_snapshots` (already bytea-compressed after 004; archived to R2 after 30d per 007)
- `scraper_ingest_runs` + `scraper_ingest_coverage`
- `scraper_entity_map` (source→canonical tracking)
- `scraper_normalize_rejections`
- `scraper_dedupe_decisions`

Write path collapses to: `discover → fetch → normalize → stage-publish (unnest batch) → Supabase pipeline`.

Dedup becomes the Supabase pipeline's job entirely. Local dedup becomes a short-circuit optimization (bloom filter keyed on `(source_name, source_id)` for duplicate source rows within a single run) — not a semantic merge.

## Migration plan

1. **Phase 1 (done)** — harmonize thresholds and field-merge semantics so scraper behavior doesn't contradict Supabase. Hardens the bridge so either source of truth is internally consistent.

2. **Phase 2 — Read path shift**
   - `getEntitiesForDedupe` switches to query `ingestion_staging` + Supabase canonical tables (venues / events / etc.) via a read-only connection.
   - Keep writing to local tables for one release cycle to allow rollback.

3. **Phase 3 — Write path removal**
   - Gate writes to `scraper_*` entity tables behind `SCRAPER_LOCAL_PERSIST=true` (default: true).
   - Flip default to `false` in a minor release.
   - Monitor for one week.

4. **Phase 4 — Cleanup**
   - Drop writes entirely; keep tables for historical audit.
   - Eventually archive tables via `pg_dump` to R2 and drop. One final migration.

## Rollback

Each phase is reversible by env-var flip (Phase 3) or migration revert (Phase 4). The `scraper_entity_map` table is the only piece of local state that must survive — it's the only place recording the source→canonical relationship before the incoming item reaches the Supabase pipeline.

## Open questions

- Do we need a read-through cache between scraper and Supabase for dedup lookups? At volume, hitting Supabase for every candidate may strain the pool; a Redis LRU could bridge.
- Orphan sweep (migration 005) runs against `scraper_entity_map + scraper_*` today. After Phase 3 it needs to check against Supabase canonical — different connection, different RLS.

## Not this refactor

- Meilisearch sync (already rewritten; tombstone reconcile added).
- The snapshot tables (they stay; they're the audit trail).
- `workflow_runs` / `ingestion_staging` / canonical tables (Supabase side — unchanged).
