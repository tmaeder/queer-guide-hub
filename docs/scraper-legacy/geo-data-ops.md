# Geo Data Ops — Cities & Countries Pipeline

Complete reference for the bulletproof geo ingestion system.
Paired migrations: `20260415130000`, `20260415140000`, `20260415180000`, `20260415190000`.

## Architecture

```
ANY SOURCE (source-*, resolve-or-create-city, import-country-data, admin CRUD)
  ↓ ingestion_staging (idempotency: source_entity_id + payload_hash)
  ↓ pipeline-normalize    → normalized_data
  ↓ pipeline-validate     → ai_validation_status ∈ {approved, rejected, needs_review}
  ↓ pipeline-deduplicate  → dedup_status ∈ {unique, duplicate, merge_candidate}
  ↓ pipeline-quality-score
  ↓ pipeline-review-gate  → review_queue (if needs human)
  ↓ pipeline-commit       → commit_{city,country}_staging_batch RPC
  ↓ cities / countries    → DB floor: CHECK + partial UNIQUE
```

## Admin UX

Open `/admin/pipelines`:

- **Builder** — pick "Country Ingestion" or "City Ingestion" from dropdown. Full DAG renders visually with 9 nodes. Click any node to edit config. Hit **Save** or **Dry Run** / **Run**.
- **Monitor** — per-source ingest stats for events, cities, countries (last 14 days).
- **Geo Review** — merge-candidate resolution queue (click Merge or Keep Separate).
- **Health** — Geo Health card with 6 live counters (duplicates, no-coords, no-country, no-ISO, merge-candidates pending).

## DB guarantees

- **CHECK constraints** — ISO regex (`^[A-Z]{2,3}$`), coords in bounds, no null-island cities, non-negative population/area, non-empty name.
- **Partial UNIQUE** (scoped to active rows, `duplicate_of_id IS NULL`):
  - `countries(code)`
  - `countries(name_normalized)`
  - `cities(country_id, name_normalized)`
- **Advisory locks** in every commit RPC prevent parallel insertion races.
- **COALESCE semantics** — updates never overwrite existing non-null values (preserves LGBTI, Wolfram, image data across re-runs).

## Provenance & audit

Every mutation attributable via:
- `geo_sources` — one row per (entity, source). `UNIQUE(source_slug, source_entity_id)` ensures idempotent re-ingest.
- `ingestion_events` — every pipeline stage + every admin CRUD edit.
- `review_queue` — human decisions on merge candidates.
- `scraper_dedupe_decisions` — machine + human dedup history.

## Deploy

```bash
cd Dev/web
supabase db push
supabase gen types typescript --linked > src/integrations/supabase/types.ts
supabase functions deploy \
  pipeline-normalize pipeline-validate pipeline-deduplicate pipeline-commit \
  resolve-or-create-city fetch-city-images fetch-country-images enrich-wolfram \
  import-country-data source-geonames
```

## Rollback

Each migration is paired with a reversible strategy. Rollback is **never destructive to user data** (only re-opens duplicates, removes constraints, drops views/RPCs).

### `20260415190000_geo_pipeline_visual_definitions`
```sql
-- Remove the visual pipeline definitions (node types can stay — harmless, used by future pipelines)
DELETE FROM public.pipeline_definitions WHERE name IN ('country-ingestion', 'city-ingestion');
-- Optional: also remove geo-specific node types
DELETE FROM public.pipeline_node_types WHERE slug IN (
  'source-rest-countries','source-csv-geo','source-import-city-data','source-import-country-data',
  'enricher-city-images','enricher-country-images','enricher-wolfram-geo','enricher-geo-resolver'
);
```

### `20260415180000_geo_cron_and_merge_rpc`
```sql
DROP VIEW IF EXISTS public.geo_merge_candidates;
DROP FUNCTION IF EXISTS public.resolve_geo_merge_candidate(UUID, TEXT, TEXT);
UPDATE public.workflow_definitions SET is_enabled = false
 WHERE name IN ('import-rest-countries-daily', 'geo-pipeline-drain');
```

### `20260415140000_geo_commit_rpc_and_dedup_backfill`
```sql
-- Drop RPCs + UNIQUE indexes (DB becomes permissive again)
DROP FUNCTION IF EXISTS public.commit_country_staging_batch(INT);
DROP FUNCTION IF EXISTS public.commit_city_staging_batch(INT);
DROP FUNCTION IF EXISTS public.commit_country_staging_item(UUID, TEXT);
DROP FUNCTION IF EXISTS public.commit_city_staging_item(UUID, TEXT);
DROP INDEX IF EXISTS public.uk_cities_country_name_active;
DROP INDEX IF EXISTS public.uk_countries_name_normalized_active;
DROP INDEX IF EXISTS public.uk_countries_code_active;
-- To re-open duplicate rows (undo the backfill):
UPDATE public.countries SET duplicate_of_id = NULL WHERE duplicate_of_id IS NOT NULL;
UPDATE public.cities    SET duplicate_of_id = NULL WHERE duplicate_of_id IS NOT NULL;
-- Note: FK re-point from duplicates → canonicals is NOT automatically reversed.
--       Records referencing canonicals will stay pointing at canonicals. That's
--       usually the desired behavior. If you need the original pointers back,
--       restore from a DB backup from before the migration.
```

### `20260415130000_geo_data_ops_foundation`
```sql
DROP VIEW IF EXISTS public.country_ingest_stats;
DROP VIEW IF EXISTS public.city_ingest_stats;
DROP FUNCTION IF EXISTS public.find_city_duplicate_candidates(TEXT, UUID, NUMERIC, NUMERIC, INT);
DROP FUNCTION IF EXISTS public.find_country_duplicate_candidates(TEXT, TEXT, INT);
DROP TRIGGER IF EXISTS trg_cities_normalized    ON public.cities;
DROP TRIGGER IF EXISTS trg_countries_normalized ON public.countries;
DROP FUNCTION IF EXISTS public.cities_maintain_normalized();
DROP FUNCTION IF EXISTS public.countries_maintain_normalized();
-- CHECK constraints
ALTER TABLE public.cities    DROP CONSTRAINT IF EXISTS cities_area_nonneg_check;
ALTER TABLE public.cities    DROP CONSTRAINT IF EXISTS cities_population_nonneg_check;
ALTER TABLE public.cities    DROP CONSTRAINT IF EXISTS cities_latlng_bounds_check;
ALTER TABLE public.cities    DROP CONSTRAINT IF EXISTS cities_name_nonempty_check;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_area_nonneg_check;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_population_nonneg_check;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_latlng_bounds_check;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_name_nonempty_check;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_code_iso_check;
-- Provenance columns + geo_sources table can stay (non-breaking)
-- To fully remove:
DROP TABLE IF EXISTS public.geo_sources;
ALTER TABLE public.cities
  DROP COLUMN IF EXISTS name_normalized,
  DROP COLUMN IF EXISTS duplicate_of_id,
  DROP COLUMN IF EXISTS last_refreshed_at,
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS last_synced_at;
ALTER TABLE public.countries
  DROP COLUMN IF EXISTS name_normalized,
  DROP COLUMN IF EXISTS duplicate_of_id,
  DROP COLUMN IF EXISTS last_refreshed_at,
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS last_synced_at;
```

## Monitoring queries

```sql
-- Pipeline throughput last 7 days
SELECT * FROM city_ingest_stats    WHERE day > now() - interval '7d' ORDER BY day DESC;
SELECT * FROM country_ingest_stats WHERE day > now() - interval '7d' ORDER BY day DESC;

-- Merge candidates awaiting review (what the /admin UI shows)
SELECT * FROM geo_merge_candidates;

-- Full audit trail for a single city
SELECT stage, actor, new_status, payload, created_at
  FROM ingestion_events
 WHERE city_id = '...'
 ORDER BY created_at DESC;

-- Cities that need human attention
SELECT id, name, country_id FROM cities
 WHERE (latitude IS NULL OR country_id IS NULL) AND duplicate_of_id IS NULL;
```
