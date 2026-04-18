-- Queer Guide Scraper: Field-coverage metrics
-- Adds per-run data-quality histograms so we can see regressions before they
-- hit users: "what % of venues from source X have geo / phone / images /
-- website?" Non-destructive. Safe to re-run.

-- Per-run field-coverage columns on the ingest log. NULLable so pre-existing
-- rows stay valid. All values are integer counts — compute percentages at read.
ALTER TABLE scraper_ingest_runs
  ADD COLUMN IF NOT EXISTS coverage_geo        INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_phone      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_website    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_images     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_tags       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_address    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_description INT DEFAULT 0;

COMMENT ON COLUMN scraper_ingest_runs.coverage_geo IS
  'Count of entities in this run that had non-null lat AND lng after normalization';
COMMENT ON COLUMN scraper_ingest_runs.coverage_phone IS
  'Count of entities with a non-null phone (applies to venue/stay only)';

-- View: most recent field-coverage per (source, entity_type), as percentages.
-- Consumed by the admin dashboard at /admin/pipelines to spot dips.
CREATE OR REPLACE VIEW scraper_ingest_coverage AS
SELECT
  source_name,
  entity_type,
  started_at,
  entities_parsed,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_geo / entities_parsed, 1) ELSE NULL END AS pct_geo,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_phone / entities_parsed, 1) ELSE NULL END AS pct_phone,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_website / entities_parsed, 1) ELSE NULL END AS pct_website,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_images / entities_parsed, 1) ELSE NULL END AS pct_images,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_tags / entities_parsed, 1) ELSE NULL END AS pct_tags,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_address / entities_parsed, 1) ELSE NULL END AS pct_address,
  CASE WHEN entities_parsed > 0
       THEN ROUND(100.0 * coverage_description / entities_parsed, 1) ELSE NULL END AS pct_description
FROM scraper_ingest_runs
WHERE status IN ('completed', 'partial')
ORDER BY started_at DESC;
