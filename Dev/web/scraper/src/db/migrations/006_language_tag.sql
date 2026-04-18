-- Queer Guide Scraper: Language tag
-- Adds ISO-639-1 language code (from heuristic detection in normalize/language.ts)
-- so downstream enrichment can skip / translate non-English content.
-- Non-destructive: nullable column; older rows are treated as "unknown".

ALTER TABLE scraper_places  ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE scraper_venues  ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE scraper_events  ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE scraper_stays   ADD COLUMN IF NOT EXISTS language TEXT;

-- Partial index: only index rows where language is set. Keeps the index tiny.
CREATE INDEX IF NOT EXISTS idx_scraper_venues_language
  ON scraper_venues (language) WHERE language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scraper_events_language
  ON scraper_events (language) WHERE language IS NOT NULL;
