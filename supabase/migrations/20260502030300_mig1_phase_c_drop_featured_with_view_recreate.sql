-- ADR 0002 MIG-1 Phase C: drop the legacy `featured` column on venues + events.
-- Per user direction, applied without the recommended 2-week observation
-- window; pre-conditions verified manually before applying.
-- Already applied to prod via Supabase MCP on 2026-05-02.
--
-- Pre-conditions (verified before applying):
-- - Frontend src/ has 0 venue.featured / event.featured references
--   (PRs #299, #301)
-- - Edge functions migrated (this PR's preceding TS commits)
-- - All DB functions referencing venues.featured / events.featured updated:
--     * universal_search (20260502030100)
--     * search_events + get_tag_linked_content (20260502030200)
-- - View v_popular_entities depends on these columns; recreated below
--   using is_featured BEFORE the DROP COLUMN.
-- - Sync trigger function `sync_featured_columns()` reads NEW.featured
--   so dropped FIRST.

-- 1. Recreate v_popular_entities to use is_featured (was depending on
--    venues.featured + events.featured)
CREATE OR REPLACE VIEW public.v_popular_entities AS
  SELECT 'venue'::text AS content_type,
    (venues.id)::text AS content_id,
    ((COALESCE((venues.quality_score)::integer, 0) +
        CASE WHEN venues.is_featured THEN 20 ELSE 0 END))::real AS score
  FROM venues
UNION ALL
  SELECT 'event'::text AS content_type,
    (events.id)::text AS content_id,
    (((CASE WHEN events.is_featured THEN 20 ELSE 0 END)::numeric
        + GREATEST((0)::numeric, ((30)::numeric - (EXTRACT(epoch FROM (events.start_date - now())) / 86400.0)))))::real AS score
  FROM events
  WHERE (events.start_date > (now() - '1 day'::interval))
UNION ALL
  SELECT 'city'::text AS content_type,
    (cities.id)::text AS content_id,
    (10)::real AS score
  FROM cities
UNION ALL
  SELECT 'personality'::text AS content_type,
    (personalities.id)::text AS content_id,
    (5)::real AS score
  FROM personalities;

-- 2. Drop the sync triggers (function reads NEW.featured)
DROP TRIGGER IF EXISTS venues_sync_featured ON public.venues;
DROP TRIGGER IF EXISTS events_sync_featured ON public.events;

-- 3. Drop the sync trigger function
DROP FUNCTION IF EXISTS public.sync_featured_columns();

-- 4. Drop the legacy columns
ALTER TABLE public.venues DROP COLUMN IF EXISTS featured;
ALTER TABLE public.events DROP COLUMN IF EXISTS featured;
