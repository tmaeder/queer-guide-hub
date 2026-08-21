-- Source beats name: refuge-restrooms rows are toilets.
--
-- The 20260810120100 backfill correctly set 732 refuge-restrooms venues to 'toilet'
-- by provenance. But an earlier name-inference pass had already relabelled 167 of
-- the same population from the building name the restroom hangs in: Willow Coffee
-- Company -> cafe, Zephyr Pub -> bar, "Oyster Bar/Water Park bathroom" -> bar, and
-- JUUT Salon Spa -> sauna, which on this platform asserts a sexual venue type about
-- a hair salon. Measured live 2026-08-21 (sole-source refuge-restrooms, inferred):
-- cafe 75, outdoor 24, bar 22, shop 18, restaurant 15, hotel 7, community_center 3,
-- club 2, sauna 1.
--
-- Two parts:
--   1. Repair those rows -> 'toilet'. Guarded to venues whose ONLY source is
--      refuge-restrooms (a venue that merely also appears there is left alone) and
--      whose category was written by inference or is still 'other'. A curated
--      category is never overwritten.
--   2. Teach run_venue_category_reclassify the rule so the class cannot regrow:
--      a sole-source refuge-restrooms row is a toilet, source-based at 1.0, before
--      any name inference runs.

-- ---------------------------------------------------------------------------
-- 1. Repair. Batched at 300: trg_search_documents_venue fires on every UPDATE and
--    this database is disk-constrained; a timeout is a full rollback.
DO $$
DECLARE
  v_rows int;
BEGIN
  LOOP
    WITH batch AS (
      SELECT v.id
      FROM public.venues v
      WHERE v.duplicate_of_id IS NULL
        AND v.category <> 'toilet'
        AND (v.category = 'other'
             OR v.enrichment_status->'category_backfill'->>'source' LIKE 'infer%')
        AND EXISTS (
          SELECT 1 FROM public.venue_sources s
          WHERE s.venue_id = v.id AND s.source_slug = 'refuge-restrooms'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.venue_sources s2
          WHERE s2.venue_id = v.id AND s2.source_slug <> 'refuge-restrooms'
        )
      LIMIT 300
    )
    UPDATE public.venues v
    SET category = 'toilet',
        enrichment_status = jsonb_set(
          coalesce(v.enrichment_status, '{}'::jsonb),
          '{category_backfill}',
          jsonb_build_object(
            'from', v.category, 'to', 'toilet',
            'source', 'refuge-restrooms', 'confidence', 1.0,
            'note', 'source beats name: inferred category retracted'
          )
        )
    FROM batch b
    WHERE v.id = b.id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
    RAISE NOTICE 'venue category source-truth repair: % rows', v_rows;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The rule in the engine. Same body as 20260810120200 plus a source-truth tier
--    ahead of inference. The selector already restricts to category='other' rows
--    without the category_backfill sentinel, so this only governs future rows.
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
  v_src      text;
BEGIN
  PERFORM public.assert_admin_or_internal();

  FOR rec IN
    SELECT v.id, v.name, v.category, v.venue_subtype, v.tags, v.description,
           (SELECT string_agg(s.payload->'raw'->>'tags', ' ')
              FROM public.venue_sources s WHERE s.venue_id = v.id) AS source_tags,
           (SELECT array_agg(DISTINCT s.source_slug)
              FROM public.venue_sources s WHERE s.venue_id = v.id) AS source_slugs
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND v.category = 'other'
      AND NOT (coalesce(v.enrichment_status, '{}'::jsonb) ? 'category_backfill')
    ORDER BY v.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;

    -- Source truth outranks the name. refuge-restrooms is a restroom database that
    -- names entries after the building they hang in; reading that name produced 167
    -- cafes, bars and a sauna out of public toilets. A row whose ONLY source is
    -- refuge-restrooms IS a toilet, no inference needed or allowed.
    IF rec.source_slugs = ARRAY['refuge-restrooms'] THEN
      v_cat  := 'toilet';
      v_conf := 1.0;
      v_src  := 'refuge-restrooms';
    ELSE
      v_inf  := public.infer_venue_category(
                  rec.name, rec.venue_subtype, rec.tags, rec.source_tags, rec.description);
      v_cat  := v_inf->>'category';
      v_conf := (v_inf->>'confidence')::numeric;
      v_src  := 'infer_v2';
    END IF;

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
                             'confidence', v_conf, 'source', v_src))
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
                             'confidence', v_conf, 'source', v_src,
                             'status', 'review'))
      WHERE id = rec.id;
      v_flagged := v_flagged + 1;

    ELSE
      UPDATE public.venues SET
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', NULL, 'confidence', 0,
                             'source', v_src, 'status', 'no_signal'))
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
