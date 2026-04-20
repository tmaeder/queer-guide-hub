-- Queer Guide Scraper: logo_url columns
-- Adds per-entity logo_url columns used by the normalizer (see
-- scraper/src/normalize/normalize.ts — venues and events populate
-- logo_url via buildLogoDevUrl()). Without these columns the ingest
-- INSERT fails with "column logo_url of relation ... does not exist".

ALTER TABLE scraper_venues ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE scraper_events ADD COLUMN IF NOT EXISTS logo_url TEXT;
