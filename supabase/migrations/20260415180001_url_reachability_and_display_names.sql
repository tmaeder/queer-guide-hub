-- ============================================================
-- URL reachability tracking + pipeline display_name fixes
-- ============================================================

-- 1. Fix null display_names on system pipeline definitions
UPDATE pipeline_definitions
SET display_name = 'Venue Ingestion (Unified, Bulletproof)'
WHERE name = 'venue-ingestion-unified' AND display_name IS NULL;

UPDATE pipeline_definitions
SET display_name = 'Event Ingestion (Unified, Bulletproof)'
WHERE name = 'event-ingestion-unified' AND display_name IS NULL;

-- 2. Add URL reachability columns to venues
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS url_status        varchar(20)  DEFAULT NULL
    CHECK (url_status IN ('ok','broken','redirect','timeout','unknown')),
  ADD COLUMN IF NOT EXISTS url_checked_at    timestamptz  DEFAULT NULL;

COMMENT ON COLUMN venues.url_status IS 'Last HTTP check result: ok|broken|redirect|timeout|unknown';
COMMENT ON COLUMN venues.url_checked_at IS 'When url_status was last updated';

-- Index for the checker to quickly find stale / unchecked venues
CREATE INDEX IF NOT EXISTS idx_venues_url_check
  ON venues (url_checked_at NULLS FIRST)
  WHERE website IS NOT NULL;

-- 3. Add pg_cron job for weekly URL check (Sundays 03:15 UTC)
SELECT cron.schedule(
  'venue-url-checker',
  '15 3 * * 0',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/venue-url-checker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{"batch_size":200,"stale_days":30}'::jsonb
    )
  $$
);
