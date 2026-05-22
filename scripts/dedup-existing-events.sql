-- D2 backfill — link existing event near-duplicates.
--
-- Run AFTER `20260522000000_events_dedupe_language_variants.sql` is applied.
-- This script walks every non-archived event without a duplicate_of_id, calls
-- find_event_duplicate_candidates() for it, and (in the second pass) sets
-- duplicate_of_id on the newer of any high-confidence match.
--
-- Run in two passes so you can review the candidates before mutating data:
--   1. SELECT-only preview (run as-is below).
--   2. Comment out the preview, uncomment the UPDATE block, run again.
--
-- All operations are idempotent. Always run on a branch (`supabase branches create`)
-- first if you want a sandbox.
--
-- Usage via Supabase MCP:
--   mcp__supabase__execute_sql(query=<this-file>)
-- Or via psql:
--   psql "$DATABASE_URL" -f scripts/dedup-existing-events.sql

-- ============================================================
-- PASS 1: preview candidates (no writes)
-- ============================================================

WITH targets AS (
  SELECT id, title, start_date, venue_id, city, latitude, longitude, created_at
  FROM public.events
  WHERE duplicate_of_id IS NULL
    AND status <> 'archived'
    -- Limit the scan window to keep the query bounded; widen if needed.
    AND start_date > now() - interval '180 days'
),
matches AS (
  SELECT
    t.id            AS source_id,
    t.title         AS source_title,
    t.start_date    AS source_start,
    c.event_id      AS match_id,
    c.match_type,
    c.score
  FROM targets t,
       LATERAL public.find_event_duplicate_candidates(
         t.title, t.start_date, t.venue_id, t.city, t.latitude, t.longitude, NULL, 5
       ) c
  WHERE c.event_id <> t.id
    AND c.score >= 0.85
)
SELECT m.source_id, m.source_title, m.source_start,
       m.match_id, e2.title AS match_title, e2.start_date AS match_start,
       m.match_type, m.score
FROM matches m
JOIN public.events e2 ON e2.id = m.match_id
ORDER BY m.score DESC, m.source_id
LIMIT 500;

-- ============================================================
-- PASS 2: apply links — uncomment when you've reviewed the preview
-- ============================================================
--
-- WITH targets AS (
--   SELECT id, title, start_date, venue_id, city, latitude, longitude, created_at
--   FROM public.events
--   WHERE duplicate_of_id IS NULL
--     AND status <> 'archived'
--     AND start_date > now() - interval '180 days'
-- ),
-- matches AS (
--   SELECT
--     t.id          AS source_id,
--     t.created_at  AS source_created,
--     c.event_id    AS match_id,
--     c.score
--   FROM targets t,
--        LATERAL public.find_event_duplicate_candidates(
--          t.title, t.start_date, t.venue_id, t.city, t.latitude, t.longitude, NULL, 5
--        ) c
--   WHERE c.event_id <> t.id
--     AND c.score >= 0.88
-- ),
-- paired AS (
--   -- For each pair, pick the canonical (older created_at) and the duplicate (newer).
--   SELECT
--     m.source_id, m.match_id, e2.created_at AS match_created, m.source_created, m.score
--   FROM matches m
--   JOIN public.events e2 ON e2.id = m.match_id
-- ),
-- links AS (
--   SELECT
--     CASE WHEN p.source_created > p.match_created THEN p.source_id ELSE p.match_id END AS dup_id,
--     CASE WHEN p.source_created > p.match_created THEN p.match_id  ELSE p.source_id END AS canonical_id,
--     p.score
--   FROM paired p
-- ),
-- best_link AS (
--   SELECT DISTINCT ON (dup_id) dup_id, canonical_id, score
--   FROM links
--   WHERE canonical_id <> dup_id
--   ORDER BY dup_id, score DESC
-- )
-- UPDATE public.events e
-- SET duplicate_of_id = b.canonical_id
-- FROM best_link b
-- WHERE e.id = b.dup_id
--   AND e.duplicate_of_id IS NULL;
