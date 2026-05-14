-- Deduplicate venues: merge rows with the same lower(name) + city_id.
--
-- Strategy:
--   1. Create venue_redirects table for slug redirects.
--   2. For each duplicate group, pick the canonical venue (most reviews,
--      then oldest created_at) and mark others with duplicate_of_id.
--   3. Repoint FK references (venue_favorites, venue_reviews, trip_places,
--      events, venue_checkins, venue_tag_assignments) from duplicate → canonical.
--   4. Insert slug redirects so old URLs still work.
--   5. Soft-delete duplicates by setting duplicate_of_id (no row deletion).
--
-- ⚠️  DO NOT APPLY without review. Run in a transaction on a branch first.
-- Reversible: see DOWN section at bottom.

BEGIN;

-- ── 1. Create redirect table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug_from text NOT NULL UNIQUE,
  slug_to text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_redirects_from ON venue_redirects (slug_from);

-- ── 2. Identify duplicate groups and pick canonical ─────────────────────────

CREATE TEMP TABLE _dedup_map AS
WITH groups AS (
  SELECT
    lower(name) AS lname,
    city_id,
    array_agg(id ORDER BY
      -- prefer venues with more content
      (CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN images IS NOT NULL AND array_length(images, 1) > 0 THEN 1 ELSE 0 END
       + CASE WHEN address IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) DESC,
      created_at ASC
    ) AS ids
  FROM venues
  WHERE (data_source IS NULL OR data_source != 'refuge_restrooms')
    AND name IS NOT NULL
    AND duplicate_of_id IS NULL
  GROUP BY lower(name), city_id
  HAVING count(*) > 1
)
SELECT
  ids[1] AS canonical_id,
  unnest(ids[2:]) AS duplicate_id
FROM groups;

-- ── 3. Insert slug redirects ────────────────────────────────────────────────

INSERT INTO venue_redirects (slug_from, slug_to)
SELECT d.slug, c.slug
FROM _dedup_map m
JOIN venues d ON d.id = m.duplicate_id
JOIN venues c ON c.id = m.canonical_id
WHERE d.slug IS NOT NULL
  AND c.slug IS NOT NULL
  AND d.slug != c.slug
ON CONFLICT (slug_from) DO NOTHING;

-- ── 4. Repoint FK references ────────────────────────────────────────────────

-- venue_favorites: move to canonical, skip if already exists
INSERT INTO venue_favorites (user_id, venue_id, created_at)
SELECT vf.user_id, m.canonical_id, vf.created_at
FROM venue_favorites vf
JOIN _dedup_map m ON vf.venue_id = m.duplicate_id
ON CONFLICT DO NOTHING;

DELETE FROM venue_favorites vf
USING _dedup_map m
WHERE vf.venue_id = m.duplicate_id;

-- venue_reviews: repoint
UPDATE venue_reviews vr
SET venue_id = m.canonical_id
FROM _dedup_map m
WHERE vr.venue_id = m.duplicate_id;

-- trip_places: repoint
UPDATE trip_places tp
SET venue_id = m.canonical_id
FROM _dedup_map m
WHERE tp.venue_id = m.duplicate_id;

-- events: repoint
UPDATE events e
SET venue_id = m.canonical_id
FROM _dedup_map m
WHERE e.venue_id = m.duplicate_id;

-- venue_checkins: repoint
UPDATE venue_checkins vc
SET venue_id = m.canonical_id
FROM _dedup_map m
WHERE vc.venue_id = m.duplicate_id;

-- venue_tag_assignments: repoint, skip conflicts
INSERT INTO venue_tag_assignments (venue_id, tag_id, created_at)
SELECT m.canonical_id, vta.tag_id, vta.created_at
FROM venue_tag_assignments vta
JOIN _dedup_map m ON vta.venue_id = m.duplicate_id
ON CONFLICT DO NOTHING;

DELETE FROM venue_tag_assignments vta
USING _dedup_map m
WHERE vta.venue_id = m.duplicate_id;

-- ── 5. Mark duplicates ──────────────────────────────────────────────────────

UPDATE venues v
SET duplicate_of_id = m.canonical_id,
    updated_at = now()
FROM _dedup_map m
WHERE v.id = m.duplicate_id;

DROP TABLE _dedup_map;

COMMIT;

-- ── DOWN (rollback) ─────────────────────────────────────────────────────────
-- To reverse:
--
-- BEGIN;
-- -- Unmark duplicates
-- UPDATE venues SET duplicate_of_id = NULL, updated_at = now()
--   WHERE duplicate_of_id IS NOT NULL
--     AND updated_at >= '2026-05-05T11:00:00Z';
--
-- -- Remove redirects
-- DELETE FROM venue_redirects
--   WHERE created_at >= '2026-05-05T11:00:00Z';
--
-- -- Note: FK repoints (reviews, events, etc.) are NOT reversible without
-- -- a full backup. Take a pg_dump before running the UP migration.
-- COMMIT;
