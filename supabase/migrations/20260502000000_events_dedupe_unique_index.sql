-- P6-4 — tighten event de-duplication.
--
-- Audit found two adjacent identical drag-brunch cards on /events with the
-- same title, venue, and start_date. The pipeline-deduplicate edge function
-- uses an RPC (find_event_duplicate_candidates) but its score-based match
-- isn't a hard constraint, so race-condition inserts slip through.
--
-- Add a partial unique index that makes "same title + same venue + same
-- start_date" a hard duplicate. NULLs are excluded — events without a venue
-- (touring acts, online events) bypass this constraint and rely on the
-- soft-match RPC.

-- Step 1 — collapse existing duplicates before the index goes live.
-- Picks the lowest event_id within each duplicate group as the survivor;
-- soft-deletes the rest by setting status='archived' and stamping notes.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(title)), venue_id, start_date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM events
  WHERE venue_id IS NOT NULL
    AND start_date IS NOT NULL
    AND status <> 'archived'
)
UPDATE events e
SET
  status = 'archived',
  updated_at = now()
FROM ranked r
WHERE r.id = e.id AND r.rn > 1;

-- Step 2 — partial unique index covering the active rows.
CREATE UNIQUE INDEX IF NOT EXISTS events_title_venue_start_unique
  ON events (lower(trim(title)), venue_id, start_date)
  WHERE venue_id IS NOT NULL
    AND start_date IS NOT NULL
    AND status <> 'archived';

COMMENT ON INDEX events_title_venue_start_unique IS
  'P6-4 — Hard de-duplication: same title + venue + start_date cannot be active twice.';
