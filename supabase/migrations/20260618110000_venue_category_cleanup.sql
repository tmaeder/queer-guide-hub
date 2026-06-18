-- Venue category cleanup (2026-06-18)
-- 84.3% of live venues sit at category='other' — the field is dead, breaking the
-- VenueFilters facet, map layer grouping, and search facets. This adds:
--   1. infer_venue_category() — pure deterministic inference (subtype > tags > name keyword)
--   2. run_venue_category_reclassify() — batched, reversible (snapshots prior category)
--   3. run_venue_event_demisfile() — reversibly archives events misfiled as venues
-- Adds two categories to fit reality: 'outdoor' (beaches/parks/naturist) + 'cruising'.
-- All writes batched <=300 (trg_search_documents_venue storm on a disk-constrained DB)
-- and reversible via enrichment_status snapshots.

-- ---------------------------------------------------------------------------
-- 0. Extend the category vocabulary: add 'outdoor' (beaches/parks/naturist) and
--    'cruising' (cruising spots), plus 'cafe'/'shop' that the CMS already exposed
--    but the CHECK omitted.
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_category_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_category_check CHECK (category = ANY (ARRAY[
  'bar','club','restaurant','hotel','sauna','theater','community_center','organization',
  'event-venue','gallery','salon','gym','cafe','shop','outdoor','cruising','other'
]));

-- ---------------------------------------------------------------------------
-- 1. Pure inference: best (category, confidence) from name/subtype/tags.
--    Returns NULL category when nothing matches → caller keeps 'other'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.infer_venue_category(
  p_name text, p_subtype text, p_tags text[]
)
 RETURNS jsonb
 LANGUAGE sql IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH sig AS (
    SELECT
      lower(coalesce(p_name,'')) AS nm,
      lower(coalesce(p_subtype,'')) AS sub,
      array(SELECT lower(t) FROM unnest(coalesce(p_tags,'{}')) t) AS tg
  ),
  hits AS (
    SELECT cat, conf FROM (
      VALUES
        -- subtype (highest trust — explicit type from source)
        ('outdoor', 0.95, (SELECT sub ~ '(nude beach|naturist|nudist|hot spring|beach|dunes)' FROM sig)),
        ('hotel',   0.95, (SELECT sub ~ '(bnb|b&b|guesthouse|guest house|hostel|pension)' FROM sig)),
        -- name keywords
        ('sauna',   0.9,  (SELECT nm ~ '\m(sauna|bathhouse|bath house|spa|thermal)\M' FROM sig)),
        ('hotel',   0.9,  (SELECT nm ~ '\m(hotel|hostel|guesthouse|guest house|b&b|bnb|pension|motel|inn|lodge)\M' FROM sig)),
        ('cruising',0.85, (SELECT nm ~ '\m(cruising|cruise club|cruise bar|gloryhole|darkroom|dark room)\M' FROM sig)),
        ('club',    0.85, (SELECT nm ~ '\m(nightclub|disco|discotheque)\M' FROM sig)),
        ('cafe',    0.85, (SELECT nm ~ '\m(cafe|café|coffee|kaffee|bistro|brunch)\M' FROM sig)),
        ('restaurant',0.8,(SELECT nm ~ '\m(restaurant|ristorante|trattoria|grill|eatery|diner|steakhouse)\M' FROM sig)),
        ('shop',    0.8,  (SELECT nm ~ '\m(shop|store|boutique|sex shop|sexshop|bookstore|emporium)\M' FROM sig)),
        ('bar',     0.8,  (SELECT nm ~ '\m(bar|pub|tavern|lounge|kneipe|taproom|biergarten|cocktail)\M' FROM sig)),
        ('club',    0.75, (SELECT nm ~ '\m(club)\M' FROM sig)),
        ('outdoor', 0.7,  (SELECT nm ~ '\m(beach|park|forest|lake|sauna lake|dunes|cruising area)\M' FROM sig)),
        ('community_center',0.8,(SELECT nm ~ '\m(community center|community centre|lgbt center|lgbtq center|pride center|zentrum)\M' FROM sig)),
        -- venue-type tags (controlled vocab from the venue-tags cleanup)
        ('sauna',   0.8,  (SELECT 'sauna' = ANY(tg) FROM sig)),
        ('bar',     0.75, (SELECT tg && ARRAY['bar','gay-bar','pub'] FROM sig)),
        ('club',    0.75, (SELECT tg && ARRAY['club','nightclub','dance-club'] FROM sig)),
        ('cafe',    0.75, (SELECT tg && ARRAY['cafe','coffee-shop'] FROM sig)),
        ('hotel',   0.75, (SELECT tg && ARRAY['hotel','accommodation','guesthouse'] FROM sig)),
        ('shop',    0.7,  (SELECT tg && ARRAY['shop','store','sex-shop'] FROM sig)),
        ('restaurant',0.7,(SELECT tg && ARRAY['restaurant','dining'] FROM sig))
    ) v(cat, conf, matched)
    WHERE v.matched
  ),
  ranked AS (
    SELECT cat, max(conf) AS conf FROM hits GROUP BY cat
  )
  SELECT CASE WHEN (SELECT count(*) FROM ranked) = 0 THEN
    jsonb_build_object('category', NULL, 'confidence', 0)
  ELSE
    -- highest-confidence category; if 2+ DISTINCT categories tie at the top conf,
    -- it's ambiguous → shave confidence so the runner routes it to review.
    (SELECT jsonb_build_object(
       'category', cat,
       'confidence', CASE WHEN (SELECT count(*) FROM ranked r2 WHERE r2.conf = (SELECT max(conf) FROM ranked)) > 1
                          THEN conf - 0.2 ELSE conf END)
     FROM ranked ORDER BY conf DESC, cat LIMIT 1)
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.infer_venue_category(text, text, text[]) TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Batched reclassifier. Auto-applies confidence >= p_min_confidence (snapshots
--    prior category into enrichment_status.category_backfill, reversible); medium
--    confidence flags needs_attention with a suggested_category; keeps 'other' otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_category_reclassify(
  p_batch integer DEFAULT 300, p_min_confidence numeric DEFAULT 0.75, p_after_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_batch int := GREATEST(1, LEAST(coalesce(p_batch,300), 300));
  v_examined int := 0; v_applied int := 0; v_flagged int := 0;
  rec record; v_inf jsonb; v_cat text; v_conf numeric; v_last uuid := p_after_id;
BEGIN
  PERFORM public.assert_admin_or_internal();
  -- Keyset cursor (id > p_after_id), NOT a stored marker: no-signal venues get ZERO
  -- writes (no pointless search-trigger reindex on the disk-constrained DB). The driver
  -- loops, passing back last_id, until examined=0.
  FOR rec IN
    SELECT v.id, v.name, v.category, v.venue_subtype, v.tags
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL AND v.category = 'other'
      AND (p_after_id IS NULL OR v.id > p_after_id)
    ORDER BY v.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    v_last := rec.id;
    v_inf := public.infer_venue_category(rec.name, rec.venue_subtype, rec.tags);
    v_cat := v_inf->>'category';
    v_conf := (v_inf->>'confidence')::numeric;

    IF v_cat IS NOT NULL AND v_conf >= p_min_confidence THEN
      UPDATE public.venues SET
        category = v_cat,
        enrichment_status = jsonb_set(coalesce(enrichment_status,'{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', v_cat, 'confidence', v_conf, 'source', 'infer'))
      WHERE id = rec.id;
      v_applied := v_applied + 1;
    ELSIF v_cat IS NOT NULL AND v_conf >= 0.5 THEN
      UPDATE public.venues SET
        needs_attention = true,
        enrichment_status = jsonb_set(coalesce(enrichment_status,'{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'suggested', v_cat, 'confidence', v_conf, 'source', 'infer', 'status', 'review'))
      WHERE id = rec.id;
      v_flagged := v_flagged + 1;
    END IF;
    -- no signal: no write at all (keyset cursor advances past it).
  END LOOP;
  RETURN jsonb_build_object('examined', v_examined, 'applied', v_applied, 'flagged', v_flagged, 'last_id', v_last);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_venue_category_reclassify(integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_venue_category_reclassify(integer, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Reversibly archive events misfiled as venues (name matches an event pattern
--    AND the row lacks venue-physicality signal: no website/phone and not already
--    a real category). Snapshots prior review_status/seo into enrichment_status.
--    Requires p_confirm=true (it removes rows from the public venue surfaces).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_event_demisfile(
  p_batch integer DEFAULT 300, p_confirm boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_batch int := GREATEST(1, LEAST(coalesce(p_batch,300), 300));
  v_examined int := 0; v_archived int := 0;
  rec record;
BEGIN
  PERFORM public.assert_admin_or_internal();
  IF NOT p_confirm THEN
    -- dry-run: count candidates only
    SELECT count(*) INTO v_examined FROM public.venues v
    WHERE v.duplicate_of_id IS NULL AND v.review_status <> 'archived'
      AND v.category = 'other'
      AND v.name ~* '\m(pride|festival|parade|march|circuit party|street party|film fest|filmfest|drag race|pageant|gala dinner)\M'
      AND v.website IS NULL AND v.phone IS NULL
      AND NOT (v.enrichment_status ? 'event_demisfile');
    RETURN jsonb_build_object('dry_run', true, 'candidates', v_examined);
  END IF;

  FOR rec IN
    SELECT v.id, v.review_status, v.seo_indexable
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL AND v.review_status <> 'archived'
      AND v.category = 'other'
      AND v.name ~* '\m(pride|festival|parade|march|circuit party|street party|film fest|filmfest|drag race|pageant|gala dinner)\M'
      AND v.website IS NULL AND v.phone IS NULL
      AND NOT (v.enrichment_status ? 'event_demisfile')
    ORDER BY v.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    UPDATE public.venues SET
      review_status = 'archived',
      seo_indexable = false,
      needs_attention = true,
      enrichment_status = jsonb_set(coalesce(enrichment_status,'{}'::jsonb), '{event_demisfile}',
        jsonb_build_object('prev_review_status', rec.review_status, 'prev_seo_indexable', rec.seo_indexable,
                           'reason', 'event misfiled as venue', 'at', now()))
    WHERE id = rec.id;
    v_archived := v_archived + 1;
  END LOOP;
  RETURN jsonb_build_object('examined', v_examined, 'archived', v_archived);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_venue_event_demisfile(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_venue_event_demisfile(integer, boolean) TO service_role;

COMMENT ON FUNCTION public.infer_venue_category(text, text, text[]) IS
  'Deterministic venue category inference (subtype > name keyword > venue-type tag). Returns {category, confidence}; NULL category = keep other.';
COMMENT ON FUNCTION public.run_venue_category_reclassify(integer, numeric) IS
  'Batched reversible reclassify of category=other venues. Auto-applies >= p_min_confidence (snapshots prior in enrichment_status.category_backfill); 0.5-min flags needs_attention.';
COMMENT ON FUNCTION public.run_venue_event_demisfile(integer, boolean) IS
  'Reversibly archives events misfiled as venues (review_status=archived). p_confirm=false returns a dry-run candidate count.';
