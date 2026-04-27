-- Queer Guide Scraper: Initial Schema
-- Creates all core tables for the scraping pipeline

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Places (gay villages / neighborhoods) ─────────────────────
CREATE TABLE IF NOT EXISTS scraper_places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  city TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  wikipedia_url TEXT,
  source_url TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Venues ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  city TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  website TEXT,
  phone TEXT,
  opening_hours TEXT,
  price_range TEXT,
  images TEXT[] DEFAULT '{}',
  source_url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  city TEXT,
  region TEXT,
  country TEXT,
  address TEXT,
  venue_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  timezone TEXT DEFAULT 'UTC',
  ticket_url TEXT,
  website TEXT,
  price_range TEXT,
  images TEXT[] DEFAULT '{}',
  source_url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Stays (BnBs) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_stays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  city TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  website TEXT,
  phone TEXT,
  price_range TEXT,
  images TEXT[] DEFAULT '{}',
  source_url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Source Snapshots (raw HTML/JSON for debugging) ─────────────
CREATE TABLE IF NOT EXISTS scraper_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('html', 'json', 'xml')),
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Source Entity Map (cross-reference source→canonical) ───────
CREATE TABLE IF NOT EXISTS scraper_entity_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  canonical_entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('venue', 'event', 'place', 'stay')),
  confidence DOUBLE PRECISION DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_name, source_id, entity_type)
);

-- ─── Ingest Runs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_ingest_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name TEXT NOT NULL,
  entity_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages_fetched INT DEFAULT 0,
  entities_parsed INT DEFAULT 0,
  entities_inserted INT DEFAULT 0,
  entities_updated INT DEFAULT 0,
  entities_deduped INT DEFAULT 0,
  blocked_by_robots INT DEFAULT 0,
  failed_requests INT DEFAULT 0,
  errors JSONB DEFAULT '[]'
);

-- ─── Dedupe Decisions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_dedupe_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('venue', 'event', 'place', 'stay')),
  entity_a_id UUID NOT NULL,
  entity_b_id UUID NOT NULL,
  match_method TEXT NOT NULL CHECK (match_method IN ('name_city_website', 'name_address', 'fuzzy')),
  confidence DOUBLE PRECISION NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('merge', 'skip', 'pending')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scraper_venues_city ON scraper_venues (city);
CREATE INDEX IF NOT EXISTS idx_scraper_venues_country ON scraper_venues (country);
CREATE INDEX IF NOT EXISTS idx_scraper_venues_name_trgm ON scraper_venues USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scraper_events_city ON scraper_events (city);
CREATE INDEX IF NOT EXISTS idx_scraper_events_start ON scraper_events (start_datetime);
CREATE INDEX IF NOT EXISTS idx_scraper_events_name_trgm ON scraper_events USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scraper_places_city ON scraper_places (city);
CREATE INDEX IF NOT EXISTS idx_scraper_places_country ON scraper_places (country);

CREATE INDEX IF NOT EXISTS idx_scraper_stays_city ON scraper_stays (city);
CREATE INDEX IF NOT EXISTS idx_scraper_stays_country ON scraper_stays (country);

CREATE INDEX IF NOT EXISTS idx_scraper_snapshots_url ON scraper_snapshots (url);
CREATE INDEX IF NOT EXISTS idx_scraper_snapshots_source ON scraper_snapshots (source_name, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_scraper_entity_map_source ON scraper_entity_map (source_name, source_id);
CREATE INDEX IF NOT EXISTS idx_scraper_entity_map_canonical ON scraper_entity_map (canonical_entity_id);

CREATE INDEX IF NOT EXISTS idx_scraper_ingest_runs_source ON scraper_ingest_runs (source_name, started_at DESC);

-- ─── Updated_at trigger function ────────────────────────────────
CREATE OR REPLACE FUNCTION scraper_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON scraper_places
    FOR EACH ROW EXECUTE FUNCTION scraper_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON scraper_venues
    FOR EACH ROW EXECUTE FUNCTION scraper_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON scraper_events
    FOR EACH ROW EXECUTE FUNCTION scraper_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON scraper_stays
    FOR EACH ROW EXECUTE FUNCTION scraper_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
