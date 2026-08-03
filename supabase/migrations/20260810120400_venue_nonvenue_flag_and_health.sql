-- Non-venue triage + categorisation health metric
--
-- Part 1: flag rows in venues that are probably not venues
-- --------------------------------------------------------
-- Roughly 1,500 of the 14,729 'other' venues are not venues at all: events
-- ("Samara Pride", "Rainbow on the Plains Festival"), organisations, bare city names
-- ("Adana", "Singapore", "Beijing" -- no address, no website, no description) and junk
-- ("15820"). They are a large part of why the category engine cannot classify the
-- remainder: there is no correct category for them.
--
-- This FLAGS ONLY. It never reclassifies, never merges and never deletes:
--   * a name match is not proof. "Paradise", "Douglas" and "Chico" are city names AND
--     plausible bar names, and the same defect class already produced the Portland ME
--     -> Portland OR and "The Castro" incidents. Requiring a second signal (no address,
--     no website, no description) is what makes the city/village rules safe enough to
--     surface, and even then they go to a human.
--   * the established convention for this kind of disposition is reversible soft
--     archival after review (archive_city_as_nonplace, archive_personality_as_nonperson),
--     not an automated rewrite.
--
-- Part 2: category_coverage_health()
-- ----------------------------------
-- Categories were the one taxonomy with no health metric, unlike tags, amenities and
-- target_groups. Without one, "62% of venues are 'other'" was only discoverable by
-- someone thinking to ask.

CREATE OR REPLACE FUNCTION public.run_venue_nonvenue_flag(p_batch integer DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- 300: trg_search_documents_venue re-indexes on every UPDATE (disk-constrained DB).
  v_batch   int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  v_flagged int := 0;
BEGIN
  PERFORM public.assert_admin_or_internal();

  WITH cand AS (
    SELECT v.id,
      CASE
        WHEN lower(btrim(v.name)) ~ '\m(pride|parade|festival|mardi gras|circuit party)\M'
          THEN 'looks_like_event'
        WHEN lower(btrim(v.name)) ~ '\m(foundation|association|e\.v\.|society|non-?profit|charity|coalition|alliance)\M'
          THEN 'looks_like_organization'
        WHEN lower(btrim(v.name)) ~ '^[0-9]+$' OR length(btrim(v.name)) <= 2
          THEN 'junk_name'
        WHEN EXISTS (SELECT 1 FROM public.queer_villages qv
                     WHERE lower(qv.name) = lower(btrim(v.name)))
          THEN 'matches_queer_village_name'
        WHEN EXISTS (SELECT 1 FROM public.cities c
                     WHERE lower(c.name) = lower(btrim(v.name)))
          THEN 'matches_city_name'
      END AS reason
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND v.category = 'other'
      AND NOT (coalesce(v.enrichment_status, '{}'::jsonb) ? 'nonvenue_candidate')
      AND (
        lower(btrim(v.name)) ~ '\m(pride|parade|festival|mardi gras|circuit party)\M'
        OR lower(btrim(v.name)) ~ '\m(foundation|association|e\.v\.|society|non-?profit|charity|coalition|alliance)\M'
        OR lower(btrim(v.name)) ~ '^[0-9]+$' OR length(btrim(v.name)) <= 2
        -- Place-name rules demand a second signal: a real venue called "Paradise"
        -- almost always has an address, a website or a description. A bare row with
        -- none of the three and a place name is the actual failure mode.
        OR (
          (EXISTS (SELECT 1 FROM public.queer_villages qv WHERE lower(qv.name) = lower(btrim(v.name)))
           OR EXISTS (SELECT 1 FROM public.cities c WHERE lower(c.name) = lower(btrim(v.name))))
          AND coalesce(btrim(v.address), '') = ''
          AND v.website IS NULL
          AND coalesce(btrim(v.description), '') = ''
        )
      )
    ORDER BY v.id
    LIMIT v_batch
  )
  UPDATE public.venues v
  SET needs_attention = true,
      enrichment_status = jsonb_set(
        coalesce(v.enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
        jsonb_build_object('reason', c.reason, 'status', 'review', 'source', 'name_heuristic'))
  FROM cand c
  WHERE v.id = c.id AND c.reason IS NOT NULL;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;
  RETURN jsonb_build_object('flagged', v_flagged);
END;
$$;

COMMENT ON FUNCTION public.run_venue_nonvenue_flag(integer) IS
  'Flags probable non-venues (events / organisations / place names / junk) sitting in '
  'venues for human review. Flag-only and reversible: clears by removing the '
  'enrichment_status.nonvenue_candidate key. Place-name rules require corroboration '
  '(no address, website or description) because a name match alone is not proof.';

REVOKE ALL ON FUNCTION public.run_venue_nonvenue_flag(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_venue_nonvenue_flag(integer) TO service_role;

-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.category_coverage_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'venues', (
      SELECT jsonb_build_object(
        'total', count(*),
        'uncategorised', count(*) FILTER (WHERE category = 'other'),
        'uncategorised_pct', round(100.0 * count(*) FILTER (WHERE category = 'other')
                                   / NULLIF(count(*), 0), 1),
        'auto_applied', count(*) FILTER (
          WHERE enrichment_status->'category_backfill'->>'status' IS NULL
            AND enrichment_status->'category_backfill'->>'to' IS NOT NULL),
        'awaiting_review', count(*) FILTER (
          WHERE enrichment_status->'category_backfill'->>'status' = 'review'),
        'no_signal', count(*) FILTER (
          WHERE enrichment_status->'category_backfill'->>'status' = 'no_signal'),
        'nonvenue_candidates', count(*) FILTER (WHERE enrichment_status ? 'nonvenue_candidate'),
        'unexamined', count(*) FILTER (
          WHERE category = 'other' AND NOT (coalesce(enrichment_status, '{}'::jsonb) ? 'category_backfill'))
      )
      FROM public.venues WHERE duplicate_of_id IS NULL
    ),
    'events', (
      SELECT jsonb_build_object(
        'total', count(*),
        'uncategorised', count(*) FILTER (WHERE event_type = 'other'),
        'uncategorised_pct', round(100.0 * count(*) FILTER (WHERE event_type = 'other')
                                   / NULLIF(count(*), 0), 1),
        -- Tracked separately from 'other': these are rows the gaycities mapper actively
        -- mislabelled, so they are wrong rather than merely unknown.
        'concert_bucket_remaining', count(*) FILTER (WHERE event_type = 'concert'),
        'reclassified', count(*) FILTER (
          WHERE enrichment_status->'event_type_backfill'->>'status' = 'applied'),
        'unexamined_concert', count(*) FILTER (
          WHERE event_type = 'concert'
            AND NOT (coalesce(enrichment_status, '{}'::jsonb) ? 'event_type_backfill'))
      )
      FROM public.events WHERE duplicate_of_id IS NULL
    ),
    'last_runs', (
      SELECT jsonb_object_agg(slug, jsonb_build_object(
               'last_run_at', last_run_at, 'status', last_run_status, 'enabled', enabled))
      FROM public.admin_automations
      WHERE slug IN ('venue_category_reclassify', 'event_type_reclassify', 'venue_nonvenue_flag')
    )
  );
$$;

COMMENT ON FUNCTION public.category_coverage_health() IS
  'Coverage + backfill progress for venues.category and events.event_type, plus the '
  'last run of each backfill job. Categories were the only taxonomy without a health '
  'metric, so a 62%-uncategorised corpus was invisible unless someone thought to ask.';

REVOKE ALL ON FUNCTION public.category_coverage_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.category_coverage_health() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'venue_nonvenue_flag',
  'Flag probable non-venues',
  'Flags events / organisations / bare place names / junk sitting in venues for human '
    'review. Flag-only, never reclassifies.',
  'system', true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','venue_nonvenue_flag',
                     'command','SELECT public.run_venue_nonvenue_flag(300)'),
  '55 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET action = EXCLUDED.action, schedule = EXCLUDED.schedule, enabled = EXCLUDED.enabled;

SELECT cron.schedule('venue_nonvenue_flag', '55 3 * * *',
                     'SELECT public.run_venue_nonvenue_flag(300)');
