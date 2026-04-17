-- Queer Guide Scraper: Data Quality migration
-- Follow-up to 001_initial_schema.sql. Non-destructive: adds columns,
-- indexes, and one new table. Safe to run on existing installations.

-- ─── Track incoming source identity on dedupe decisions ────────────
-- Previously `saveDedupeDecision` had to pass the same canonical UUID for
-- both entity_a_id and entity_b_id when a dedupe-skip happened before the
-- incoming item was persisted. That erased the candidate identity from the
-- audit trail. With these columns we can record the (source_name, source_id)
-- of the incoming item even when no canonical row is created.
ALTER TABLE scraper_dedupe_decisions
  ADD COLUMN IF NOT EXISTS incoming_source_name TEXT,
  ADD COLUMN IF NOT EXISTS incoming_source_id   TEXT;

-- entity_b_id is now nullable for the same reason (merge-skip never inserts
-- a second canonical row).
ALTER TABLE scraper_dedupe_decisions
  ALTER COLUMN entity_b_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scraper_dedupe_decisions_incoming
  ON scraper_dedupe_decisions (incoming_source_name, incoming_source_id);

CREATE INDEX IF NOT EXISTS idx_scraper_dedupe_decisions_pending
  ON scraper_dedupe_decisions (created_at DESC)
  WHERE decision = 'pending';

-- ─── Functional lower(city) indexes ─────────────────────────────────
-- Orchestrator's per-batch dedup lookup filters by `lower(city) = ANY(...)`.
-- Without functional indexes that's a sequential scan on popular cities.
CREATE INDEX IF NOT EXISTS idx_scraper_venues_city_lower
  ON scraper_venues (lower(city));
CREATE INDEX IF NOT EXISTS idx_scraper_events_city_lower
  ON scraper_events (lower(city));
CREATE INDEX IF NOT EXISTS idx_scraper_places_city_lower
  ON scraper_places (lower(city));
CREATE INDEX IF NOT EXISTS idx_scraper_stays_city_lower
  ON scraper_stays (lower(city));

-- ─── Geo index to accelerate future proximity dedup ─────────────────
-- Not a spatial index yet (no PostGIS dependency) — simple btree on
-- (lat, lng) lets us cheaply bound-box before Haversine.
CREATE INDEX IF NOT EXISTS idx_scraper_venues_geo
  ON scraper_venues (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scraper_stays_geo
  ON scraper_stays (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scraper_events_geo
  ON scraper_events (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ─── Normalize rejections (data-quality observability) ──────────────
-- Emits structured reasons whenever normalizeEntity() drops an item so we
-- can see WHERE data is bleeding — missing name, missing city, unparseable
-- date, etc. Lightweight: rows can be pruned on a retention policy.
CREATE TABLE IF NOT EXISTS scraper_normalize_rejections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  reject_reason TEXT NOT NULL,
  raw_sample JSONB,
  rejected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_normalize_rejections_source
  ON scraper_normalize_rejections (source_name, rejected_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalize_rejections_reason
  ON scraper_normalize_rejections (reject_reason, rejected_at DESC);

-- ─── Relax venue/stay country NOT NULL ──────────────────────────────
-- Previous code wrote empty strings to bypass NOT NULL when country was
-- genuinely unknown. That's worst-of-both-worlds (can't distinguish
-- "unknown" from "actually empty"). Honour the NULL instead.
ALTER TABLE scraper_venues ALTER COLUMN country DROP NOT NULL;
ALTER TABLE scraper_stays  ALTER COLUMN country DROP NOT NULL;
-- Historical rows with empty-string country get normalized to NULL.
UPDATE scraper_venues SET country = NULL WHERE country = '';
UPDATE scraper_stays  SET country = NULL WHERE country = '';
