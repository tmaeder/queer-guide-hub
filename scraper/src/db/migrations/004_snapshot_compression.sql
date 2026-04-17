-- Queer Guide Scraper: Compressed snapshot storage
-- HTML snapshots are 50-500 KB of mostly boilerplate. Storing as TEXT with
-- 3-deep retention across ~10k URLs is projected to grow to 30 GB. Moving
-- to BYTEA + application-level gzip typically cuts size 5-10×.
--
-- Non-destructive: adds a new column; code writes to it; old TEXT column is
-- kept for backfill / rollback and dropped in a later migration.

ALTER TABLE scraper_snapshots
  ADD COLUMN IF NOT EXISTS content_gz BYTEA,
  ADD COLUMN IF NOT EXISTS content_encoding TEXT;

COMMENT ON COLUMN scraper_snapshots.content_gz IS
  'gzip-compressed snapshot body. Decompress in app layer. Canonical after migration 004.';
COMMENT ON COLUMN scraper_snapshots.content_encoding IS
  'Compression scheme — "gzip" for new rows, NULL for pre-migration rows stored in `content` TEXT.';

-- Backfill pointer: pre-migration rows have `content` populated and
-- `content_gz` NULL. Code reads either.

-- Enforce that at least one representation exists.
ALTER TABLE scraper_snapshots
  ADD CONSTRAINT scraper_snapshots_body_present
  CHECK (content IS NOT NULL OR content_gz IS NOT NULL) NOT VALID;
