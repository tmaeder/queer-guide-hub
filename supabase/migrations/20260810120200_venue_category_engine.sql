-- Venue category inference engine
--
-- State before this migration
-- ---------------------------
-- infer_venue_category() and run_venue_category_reclassify() already existed in
-- production, in NO migration file, called by no cron / admin_automations row / edge
-- function / client code. This migration brings them into the repo and replaces the
-- inference with a calibrated version.
--
-- The old inference read only (name, subtype, tags). venues.tags had itself been
-- stripped to 37 distinct values by the 20260613120000 default-reject vocabulary
-- cleanup, so the type information it needed was gone: dry-running it over the 14,729
-- 'other' venues classified 239 of them (1.6%).
--
-- What changed
-- ------------
-- 1. The signal. Raw source tags survive in venue_sources.payload->'raw'->>'tags'
--    ("Bars & Clubs", "Nude Beach", "Vietnamese restaurant", "gay owned,clothing shop")
--    for 13,526 of the 14,729. Adding them plus the description raises the rows
--    carrying any usable signal to 5,887.
--
-- 2. Name-first precedence. The venue's own name states its primary function far more
--    reliably than the tag list, which is an AMENITY list: "Hotel Bar" is a bar,
--    "Blue Sky Cafe" tagged "Restaurant" is a cafe, and a bar that lists "cruising" is
--    still a bar. Tier 1 reads the name; tier 2 falls back to subtype/tags/description.
--    Measured against independent ground truth this moved bar from 84.5% to 92.3%.
--
-- Calibration (the numbers the thresholds come from)
-- --------------------------------------------------
-- Agreement was measured against venues whose category is already set AND which no
-- previous backfill touched (enrichment_status ? 'category_backfill' excluded). That
-- exclusion matters: an earlier pass had already labelled 5,280 rows, and including
-- them measures the rule agreeing with an earlier heuristic rather than with truth.
--
--   category           n     agreement    disposition
--   bar             1,647       92.3%     auto-apply
--   sauna             269       89.2%     auto-apply
--   community_center   54       87.0%     auto-apply
--   theater            17       82.4%     review
--   hotel             108       78.7%     review
--   restaurant        121       60.3%     review
--   club              260       23.8%     review  (over-fires badly on independent data)
--   cafe / outdoor / shop / cruising      review  (NOT VALIDATABLE -- every row in
--                                                  those categories was created by the
--                                                  earlier pass, so no independent
--                                                  ground truth for them exists)
--
-- Only the three categories that clear 85% on independent data auto-apply. Everything
-- else is written as a SUGGESTION with needs_attention, never to venues.category. A
-- null category is recoverable; a wrong one is not.
--
-- Expected effect on the 14,729 'other' venues:
--   3,328 auto-applied, 2,559 queued for review, 8,842 left as 'other' (no signal).

-- ---------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.infer_venue_category(text, text, text[]);

CREATE OR REPLACE FUNCTION public.infer_venue_category(
  p_name         text,
  p_subtype      text  DEFAULT NULL,
  p_tags         text[] DEFAULT NULL,
  p_source_tags  text  DEFAULT NULL,
  p_description  text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH sig AS (
    SELECT
      lower(coalesce(p_name, '')) AS nm,
      lower(
        coalesce(p_subtype, '') || ' | ' ||
        coalesce(array_to_string(p_tags, ' '), '') || ' | ' ||
        coalesce(p_source_tags, '') || ' | ' ||
        left(coalesce(p_description, ''), 300)
      ) AS ctx
  ),
  hit AS (
    SELECT CASE
      -- Tier 1 -- the name states the primary function.
      WHEN nm ~ '\m(sauna|bathhouse|badehaus)\M'                              THEN 'sauna'
      WHEN nm ~ '\m(cafe|café|caffe|kaffee|coffee|koffie)\M'                  THEN 'cafe'
      WHEN nm ~ '\m(restaurant|ristorante|trattoria|bistro|steakhouse|pizzeria)\M' THEN 'restaurant'
      WHEN nm ~ '\m(hotel|hostel|guesthouse|pension|motel)\M'                 THEN 'hotel'
      WHEN nm ~ '\m(bar|pub|tavern|taproom|kneipe|saloon)\M'                  THEN 'bar'
      WHEN nm ~ '\m(club|disco|discotheque)\M'                                THEN 'club'
      -- Tier 2 -- subtype / tags / description. Ordered by primary function, so an
      -- amenity mention never outranks what the venue actually is.
      WHEN ctx ~ '\m(sauna|bathhouse|bath house|steam room)\M'                THEN 'sauna'
      WHEN ctx ~ '\m(nude beach|naturist|nudist|clothing.optional)\M'         THEN 'outdoor'
      WHEN ctx ~ '\m(night ?club|nightclub|discotheque|disco bar)\M'          THEN 'club'
      WHEN ctx ~ '\m(gay bar|hotel bar|sports bar|dive bar|leather bar|lounge bar|bars? & clubs?|\mbar\M|\mpub\M|tavern|taproom|kneipe|lounge)\M' THEN 'bar'
      WHEN ctx ~ '\m(cafe|café|coffee|kaffee|bakery)\M'                       THEN 'cafe'
      WHEN ctx ~ '\m(restaurant|ristorante|trattoria|bistro|dining|diner|steakhouse)\M' THEN 'restaurant'
      WHEN ctx ~ '\m(sex shop|sexshop|bookshop|bookstore|boutique|erotica|\mshop\M|\mstore\M)\M' THEN 'shop'
      WHEN ctx ~ '\m(cruising|cruise club|darkroom|dark room|gloryhole|glory hole|sex club|sexclub)\M' THEN 'cruising'
      WHEN ctx ~ '\m(beach|beaches|dunes|\mpark\M|lake|forest)\M'             THEN 'outdoor'
      WHEN ctx ~ '\m(club)\M'                                                 THEN 'club'
      WHEN ctx ~ '\m(hotel|hostel|guesthouse|guest house|b&b|bnb|pension|accommodation)\M' THEN 'hotel'
      WHEN ctx ~ '\m(community cent(er|re)|lgbt cent(er|re)|pride cent(er|re)|organi[sz]ation|association|advocacy|foundation)\M' THEN 'community_center'
      WHEN ctx ~ '\m(gallery|museum)\M'                                       THEN 'gallery'
      WHEN ctx ~ '\m(theatre|theater|cinema)\M'                               THEN 'theater'
      ELSE NULL
    END AS cat
    FROM sig
  )
  SELECT jsonb_build_object(
    'category', cat,
    -- Measured agreement, not a guess. Categories without independent ground truth are
    -- pinned below the auto-apply threshold on purpose.
    'confidence', CASE cat
      WHEN 'bar'              THEN 0.92
      WHEN 'sauna'            THEN 0.89
      WHEN 'community_center' THEN 0.87
      WHEN 'theater'          THEN 0.82
      WHEN 'hotel'            THEN 0.79
      WHEN 'restaurant'       THEN 0.60
      WHEN 'club'             THEN 0.24
      WHEN 'cafe'             THEN 0.50
      WHEN 'outdoor'          THEN 0.50
      WHEN 'shop'             THEN 0.50
      WHEN 'gallery'          THEN 0.50
      WHEN 'cruising'         THEN 0.21
      ELSE 0
    END
  )
  FROM hit;
$$;

COMMENT ON FUNCTION public.infer_venue_category(text, text, text[], text, text) IS
  'Name-first venue category inference. Returns {category, confidence} where confidence '
  'is MEASURED agreement against independently-labelled rows, not a guess. Only bar / '
  'sauna / community_center clear the 0.85 auto-apply bar.';

-- ---------------------------------------------------------------------------------
-- Runner. Keeps the shape of the pre-existing (untracked) version: batched, sentinel
-- in enrichment_status.category_backfill, apply / review / no_signal ladder.
DROP FUNCTION IF EXISTS public.run_venue_category_reclassify(integer, numeric);
DROP FUNCTION IF EXISTS public.run_venue_category_reclassify(integer, numeric, uuid);

CREATE OR REPLACE FUNCTION public.run_venue_category_reclassify(
  p_batch          integer DEFAULT 300,
  p_min_confidence numeric DEFAULT 0.85,
  p_dry_run        boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Hard cap at 300: trg_search_documents_venue re-indexes on every UPDATE and this
  -- database is disk-constrained. Raising this is how you get a statement timeout,
  -- and a timeout is a full rollback of the batch.
  v_batch    int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  v_examined int := 0;
  v_applied  int := 0;
  v_flagged  int := 0;
  v_none     int := 0;
  v_by_cat   jsonb := '{}'::jsonb;
  rec        record;
  v_inf      jsonb;
  v_cat      text;
  v_conf     numeric;
BEGIN
  PERFORM public.assert_admin_or_internal();

  FOR rec IN
    SELECT v.id, v.name, v.category, v.venue_subtype, v.tags, v.description,
           (SELECT string_agg(s.payload->'raw'->>'tags', ' ')
              FROM public.venue_sources s WHERE s.venue_id = v.id) AS source_tags
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND v.category = 'other'
      AND NOT (coalesce(v.enrichment_status, '{}'::jsonb) ? 'category_backfill')
    ORDER BY v.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    v_inf  := public.infer_venue_category(
                rec.name, rec.venue_subtype, rec.tags, rec.source_tags, rec.description);
    v_cat  := v_inf->>'category';
    v_conf := (v_inf->>'confidence')::numeric;

    IF p_dry_run THEN
      IF v_cat IS NOT NULL AND v_conf >= p_min_confidence THEN
        v_applied := v_applied + 1;
        v_by_cat := jsonb_set(v_by_cat, ARRAY[v_cat],
                      to_jsonb(coalesce((v_by_cat->>v_cat)::int, 0) + 1));
      ELSIF v_cat IS NOT NULL THEN
        v_flagged := v_flagged + 1;
      ELSE
        v_none := v_none + 1;
      END IF;
      CONTINUE;
    END IF;

    IF v_cat IS NOT NULL AND v_conf >= p_min_confidence THEN
      UPDATE public.venues SET
        category = v_cat,
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', v_cat,
                             'confidence', v_conf, 'source', 'infer_v2'))
      WHERE id = rec.id;
      v_applied := v_applied + 1;
      v_by_cat := jsonb_set(v_by_cat, ARRAY[v_cat],
                    to_jsonb(coalesce((v_by_cat->>v_cat)::int, 0) + 1));

    ELSIF v_cat IS NOT NULL THEN
      -- Below the bar: record the suggestion, never the value.
      UPDATE public.venues SET
        needs_attention = true,
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'suggested', v_cat,
                             'confidence', v_conf, 'source', 'infer_v2',
                             'status', 'review'))
      WHERE id = rec.id;
      v_flagged := v_flagged + 1;

    ELSE
      UPDATE public.venues SET
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', NULL, 'confidence', 0,
                             'source', 'infer_v2', 'status', 'no_signal'))
      WHERE id = rec.id;
      v_none := v_none + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'examined', v_examined, 'applied', v_applied, 'flagged', v_flagged,
    'no_signal', v_none, 'by_category', v_by_cat, 'dry_run', coalesce(p_dry_run, false));
END;
$$;

REVOKE ALL ON FUNCTION public.run_venue_category_reclassify(integer, numeric, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_venue_category_reclassify(integer, numeric, boolean) TO service_role;

-- ---------------------------------------------------------------------------------
-- The sentinel is what stops the runner re-examining a row forever, but it also means
-- a row examined by an OLD inference is never reconsidered by a better one. 5,280 rows
-- were already stamped by the previous pass. Ported from reset_city_enrichment_state().
CREATE OR REPLACE FUNCTION public.reset_venue_category_state(p_only_no_signal boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_rows int;
BEGIN
  PERFORM public.assert_admin_or_internal();
  UPDATE public.venues
  SET enrichment_status = enrichment_status - 'category_backfill'
  WHERE enrichment_status ? 'category_backfill'
    AND (NOT p_only_no_signal
         OR enrichment_status->'category_backfill'->>'status' = 'no_signal');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('cleared', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_venue_category_state(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_venue_category_state(boolean) TO service_role;

-- ---------------------------------------------------------------------------------
-- Registration. The whole reason this engine did nothing for its entire existence is
-- that it was never scheduled, so registering it is the load-bearing step.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'venue_category_reclassify',
  'Venue category reclassify',
  'Infers venues.category for rows stuck on ''other''. Auto-applies only bar / sauna / '
    'community_center (>=85% measured agreement); every other category is recorded as a '
    'suggestion with needs_attention for human review.',
  'system', true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','venue_category_reclassify',
                     'command','SELECT public.run_venue_category_reclassify(300, 0.85)'),
  '35 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET action = EXCLUDED.action, schedule = EXCLUDED.schedule, enabled = EXCLUDED.enabled;

SELECT cron.schedule(
  'venue_category_reclassify', '35 3 * * *',
  'SELECT public.run_venue_category_reclassify(300, 0.85)'
);
