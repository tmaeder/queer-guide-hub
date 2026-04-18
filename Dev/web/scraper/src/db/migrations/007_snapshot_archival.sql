-- Queer Guide Scraper: Snapshot archival
-- Snapshots older than 30 days get moved to R2 and the body replaced with
-- an r2_key pointer. A tiny metadata row stays in Postgres so audit queries
-- keep working, while storage cost flips from Postgres ($$) to R2 ($).

ALTER TABLE scraper_snapshots
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS r2_key TEXT;

CREATE INDEX IF NOT EXISTS idx_scraper_snapshots_unarchived_old
  ON scraper_snapshots (fetched_at)
  WHERE archived_at IS NULL;

-- Eligible-for-archive view: consumed by the snapshot-archiver Worker (or a
-- Supabase edge function) that streams content_gz to R2 and updates the row.
CREATE OR REPLACE VIEW scraper_snapshots_archive_candidates AS
SELECT id, source_name, url, content_type, content_hash, fetched_at,
       OCTET_LENGTH(content_gz) AS gz_bytes
FROM scraper_snapshots
WHERE archived_at IS NULL
  AND fetched_at < now() - interval '30 days'
  AND content_gz IS NOT NULL
ORDER BY fetched_at ASC
LIMIT 1000;

COMMENT ON VIEW scraper_snapshots_archive_candidates IS
  'Snapshots older than 30 days that still hold their body in Postgres. Worker reads this, streams to R2, then calls scraper_mark_snapshot_archived(id, r2_key) and nulls out content_gz.';

-- Helper: mark a snapshot as archived. Worker calls this after R2 upload.
CREATE OR REPLACE FUNCTION scraper_mark_snapshot_archived(
  p_id UUID,
  p_r2_key TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE scraper_snapshots
  SET archived_at = now(),
      r2_key = p_r2_key,
      content = NULL,
      content_gz = NULL
  WHERE id = p_id AND archived_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Helper: return a snapshot's gzipped body as base64 over PostgREST.
-- The snapshot-archiver Worker calls this to retrieve the payload before
-- uploading it to R2. Scoped to individual rows to keep memory bounded.
CREATE OR REPLACE FUNCTION scraper_snapshot_body(p_id UUID)
RETURNS TEXT AS $$
  SELECT encode(content_gz, 'base64')::text
  FROM scraper_snapshots WHERE id = p_id;
$$ LANGUAGE SQL STABLE;
