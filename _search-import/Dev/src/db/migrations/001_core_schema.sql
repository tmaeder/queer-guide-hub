-- ============================================================
-- Migration 001: Core schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Migration tracking (idempotent bootstrap)
CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  name        TEXT        UNIQUE NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Core entity tables
-- ============================================================

-- Gay villages / neighbourhoods / districts
CREATE TABLE IF NOT EXISTS places (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  city            TEXT,
  region          TEXT,
  country         TEXT,
  address         TEXT,
  geo             JSONB,                       -- {lat, lng}
  website         TEXT,
  phone           TEXT,
  images          TEXT[]      NOT NULL DEFAULT '{}',
  place_type      TEXT,                        -- neighbourhood, village, district
  wikipedia_url   TEXT,
  source_url      TEXT        NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LGBTQ+ venues (bars, clubs, cafés, saunas, etc.)
CREATE TABLE IF NOT EXISTS venues (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  city            TEXT,
  region          TEXT,
  country         TEXT,
  address         TEXT,
  geo             JSONB,
  website         TEXT,
  phone           TEXT,
  images          TEXT[]      NOT NULL DEFAULT '{}',
  venue_type      TEXT,                        -- bar, club, cafe, sauna, shop…
  opening_hours   TEXT,
  price_range     TEXT,
  source_url      TEXT        NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events (Pride, parties, festivals, etc.)
CREATE TABLE IF NOT EXISTS events (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  city            TEXT,
  region          TEXT,
  country         TEXT,
  address         TEXT,
  geo             JSONB,
  website         TEXT,
  phone           TEXT,
  images          TEXT[]      NOT NULL DEFAULT '{}',
  start_datetime  TIMESTAMPTZ NOT NULL,
  end_datetime    TIMESTAMPTZ,
  timezone        TEXT,
  venue_id        UUID        REFERENCES venues (id) ON DELETE SET NULL,
  ticket_url      TEXT,
  price_range     TEXT,
  source_url      TEXT        NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stays / BnBs / accommodations
CREATE TABLE IF NOT EXISTS stays (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  city            TEXT,
  region          TEXT,
  country         TEXT,
  address         TEXT,
  geo             JSONB,
  website         TEXT,
  phone           TEXT,
  images          TEXT[]      NOT NULL DEFAULT '{}',
  price_per_night NUMERIC(10,2),
  price_currency  CHAR(3),
  amenities       TEXT[]      NOT NULL DEFAULT '{}',
  rating          NUMERIC(3,2),
  review_count    INTEGER,
  source_url      TEXT        NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Operational tables
-- ============================================================

-- Raw HTML / JSON snapshots for debugging
CREATE TABLE IF NOT EXISTS source_snapshots (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  url           TEXT        NOT NULL,
  source        TEXT        NOT NULL,
  content_type  TEXT        NOT NULL DEFAULT 'html',
  raw_content   TEXT,
  checksum      TEXT        NOT NULL,
  content_size  INTEGER,
  http_status   INTEGER,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links source-specific IDs to canonical entity IDs
CREATE TABLE IF NOT EXISTS source_entity_maps (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source                TEXT        NOT NULL,
  source_id             TEXT        NOT NULL,
  source_url            TEXT        NOT NULL,
  canonical_entity_id   UUID        NOT NULL,
  entity_type           TEXT        NOT NULL,   -- venue | event | stay | place
  confidence            NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  match_method          TEXT        NOT NULL DEFAULT 'strong', -- exact|strong|fuzzy|manual
  verified_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id, entity_type)
);

-- Ingest run log
CREATE TABLE IF NOT EXISTS ingest_runs (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source              TEXT        NOT NULL,
  entity_types        TEXT[]      NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'running', -- running|completed|failed|partial
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  pages_fetched       INTEGER     NOT NULL DEFAULT 0,
  entities_parsed     INTEGER     NOT NULL DEFAULT 0,
  entities_inserted   INTEGER     NOT NULL DEFAULT 0,
  entities_updated    INTEGER     NOT NULL DEFAULT 0,
  entities_deduped    INTEGER     NOT NULL DEFAULT 0,
  entities_blocked    INTEGER     NOT NULL DEFAULT 0,
  entities_failed     INTEGER     NOT NULL DEFAULT 0,
  errors              JSONB       NOT NULL DEFAULT '[]',
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe decision log (for traceability)
CREATE TABLE IF NOT EXISTS dedupe_decisions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id_a         UUID        NOT NULL,
  entity_id_b         UUID        NOT NULL,
  entity_type         TEXT        NOT NULL,
  confidence          NUMERIC(4,3) NOT NULL,
  match_method        TEXT        NOT NULL,
  kept_entity_id      UUID        NOT NULL,
  decision            TEXT        NOT NULL DEFAULT 'merge', -- merge|keep_separate|pending_review
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Failed request log
CREATE TABLE IF NOT EXISTS failed_requests (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingest_run_id   UUID        REFERENCES ingest_runs (id) ON DELETE SET NULL,
  source          TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  http_status     INTEGER,
  error_message   TEXT,
  error_stack     TEXT,
  attempt_count   INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_venues_city_country     ON venues  (city, country);
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm        ON venues  USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_last_seen        ON venues  (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_events_start            ON events  (start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_city_country     ON events  (city, country);
CREATE INDEX IF NOT EXISTS idx_events_last_seen        ON events  (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_places_city_country     ON places  (city, country);
CREATE INDEX IF NOT EXISTS idx_stays_city_country      ON stays   (city, country);

CREATE INDEX IF NOT EXISTS idx_snapshots_url_fetched   ON source_snapshots  (url, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_checksum      ON source_snapshots  (checksum);

CREATE INDEX IF NOT EXISTS idx_entity_map_canonical    ON source_entity_maps (canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_map_source       ON source_entity_maps (source, entity_type);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_source      ON ingest_runs (source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_status      ON ingest_runs (status);

-- ============================================================
-- updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_stays_updated_at
    BEFORE UPDATE ON stays
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_entity_map_updated_at
    BEFORE UPDATE ON source_entity_maps
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
