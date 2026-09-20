-- The counter band's LATERAL still scans a whole catalogue to pick 3 covers.
--
-- This sits ON TOP OF 99991789868183 (#3820), which is merged but not yet
-- applied at the time of writing. That one bounded how MANY times the LATERAL
-- runs — a `pool` CTE takes 60 brands by seeded hash instead of all 118 — and
-- moved the thumbnail lookup out to a correlated subquery over the three
-- picked rows instead of joining image_asset_links across every listing. Both
-- are real wins and both are kept verbatim here.
--
-- What it does not change is what EACH run costs, and that is where the work
-- is. Measured on prod against the currently-live function:
--
--   get_marketplace_brand_covers(12, 7)   279,690 buffers   8,322 ms
--
-- `authenticator` pins statement_timeout=8s, so that call did not approach the
-- ceiling, it crossed it — the 500 #3820 was opened for. Replaying #3820's own
-- shape against prod data brings the wall clock down but leaves the buffers
-- almost exactly where they were (279,762), because the inner GROUP BY is
-- untouched:
--
--   Bitmap Index Scan on idx_marketplace_listings_brand_cover   Buffers:    60
--     -> Bitmap Heap Scan   Heap Blocks: 5743   rows=7407       Buffers: 10521
--       -> Sort -> GroupAggregate (rows=7404) -> LIMIT 3
--
-- `GROUP BY l.images[1]` has to materialise all 7,407 of cherrykitten's
-- listings before LIMIT 3 can apply, so the `boutique_score DESC` half of
-- idx_marketplace_listings_brand_cover is dead weight: the index finds the
-- brand in 60 buffers and grouping then spends 10,521. Bounding the candidate
-- rows FIRST lets the index serve the ordering instead:
--
--   Index Scan using idx_marketplace_listings_brand_cover
--     Incremental Sort   Presorted Key: boutique_score
--
-- Measured with #3820's pool + this bound, both together, on prod:
--
--   1,075 buffers   8.8 ms      (from 279,762 / 1,572 ms)
--
-- 260x fewer buffers. That matters more than the wall clock: a warm 1.5s is
-- 20% of the ceiling, and it is the COLD call — where those ~280k blocks are
-- physical reads — that 500s. 1,075 blocks cannot.
--
-- ── the GROUP BY stays ──
-- Colour variants of one garment are separate listings sharing a hero image,
-- so taking the top three LISTINGS can yield three byte-identical thumbnails,
-- which reads as a broken tile. It only ever needed to look at a handful of
-- candidates, not a whole catalogue. 60 rather than 20: 20 sufficed for every
-- brand measured, but 60 index-ordered tuples cost essentially the same and
-- leave room for a brand whose head is unusually duplicated.
--
-- ── NOT byte-identical, and that is stated rather than glossed ──
-- boutique_score is NULL across much of the corpus. Where a brand's scores are
-- all NULL the unbounded version ranked URLs alphabetically across the WHOLE
-- catalogue, which a bounded set cannot see, so a few brands get different —
-- equally valid, equally SFW, same-brand — covers. Alphabetical-by-URL was a
-- tiebreak nobody chose, not a ranking.
--
-- What IS preserved, and was verified before shipping: which brands qualify.
-- 118 eligible, 94 have >=3 distinct covers under both the unbounded and the
-- bounded predicate, 0 lost. The `>= 3` join condition is what drops a brand
-- from the band, so that is the property that had to hold.
--
-- ── ordering note ──
-- This migration is written against #3820's body and must apply after it.
-- 99991789868183 > this file's predecessor 99991789847771, which is why that
-- earlier attempt was renumbered rather than rebased in place: `db push`
-- aborts on a pending file sorting below the applied ceiling and takes every
-- migration queued behind it.

CREATE OR REPLACE FUNCTION public.get_marketplace_brand_covers(
  p_limit integer DEFAULT 12,
  p_seed integer DEFAULT NULL::integer
)
RETURNS TABLE (
  slug text,
  display_name text,
  logo_url text,
  logo_on_ink boolean,
  product_count integer,
  ownership_tags text[],
  covers jsonb
)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
  WITH pool AS (
    -- #3820: the hash ordering cannot use an index, so bound the pool before
    -- paying for any LATERAL at all.
    SELECT b.slug, b.brand_key, b.display_name, b.logo_url, b.logo_on_ink,
           b.product_count, b.ownership_tags
    FROM public.marketplace_brands b
    WHERE b.status = 'approved'
      AND b.slug IS NOT NULL
      AND b.product_count > 0
      AND b.logo_url IS NOT NULL
    ORDER BY hashtext(b.slug || coalesce(p_seed, (current_date - DATE '2026-01-01'))::text),
             b.slug
    LIMIT 60
  ),
  picked AS (
    SELECT p.slug, p.display_name, p.logo_url, p.logo_on_ink,
           p.product_count, p.ownership_tags, c.covers
    FROM pool p
    JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'url', t.url)
                       ORDER BY t.score DESC NULLS LAST, t.url) AS covers
      FROM (
        SELECT (array_agg(cand.id ORDER BY cand.boutique_score DESC NULLS LAST))[1] AS id,
               cand.url,
               max(cand.boutique_score) AS score
        FROM (
          -- THE BOUND. Index-ordered, so this is an Incremental Sort over ~60
          -- tuples rather than a heap scan of the brand's whole catalogue.
          SELECT l.id, l.images[1] AS url, l.boutique_score
          FROM public.marketplace_listings l
          WHERE l.brand_key = p.brand_key
            AND l.status = 'active'
            AND l.content_rating IN ('sfw','suggestive')
            AND coalesce(l.images[1], '') <> ''
          ORDER BY l.boutique_score DESC NULLS LAST, l.id
          LIMIT 60
        ) cand
        -- Dedupe by hero image, not by listing: colour variants share one.
        GROUP BY cand.url
        ORDER BY max(cand.boutique_score) DESC NULLS LAST, cand.url
        LIMIT 3
      ) t
    ) c ON jsonb_array_length(c.covers) >= 3
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 24))
  )
  SELECT picked.slug, picked.display_name, picked.logo_url, picked.logo_on_ink,
         picked.product_count, picked.ownership_tags,
         -- #3820: resolve the mirror for the three picked rows only. The thumb
         -- is nullable by design — <Image> walks optimized -> thumbnail ->
         -- original, so an un-mirrored cover degrades to the merchant's own
         -- image rather than to a fallback texture.
         (SELECT jsonb_agg(jsonb_build_object(
                   'url', e->>'url',
                   'thumb', (SELECT ia.thumbnail_url
                               FROM public.image_asset_links k
                               JOIN public.image_assets ia
                                 ON ia.id = k.asset_id
                                AND ia.status = 'active'
                                AND ia.optimization_status IN ('optimized','cdn_optimized')
                              WHERE k.entity_type = 'marketplace_listing'
                                AND k.entity_id = (e->>'id')::uuid
                                AND k.sort_order = 0
                              LIMIT 1))
                 ORDER BY ord)
            FROM jsonb_array_elements(picked.covers) WITH ORDINALITY AS a(e, ord))
  FROM picked;
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(integer, integer) TO anon, authenticated, service_role;

DO $verify$
DECLARE
  v_rows int;
  v_short int;
  v_nourl int;
BEGIN
  IF to_regprocedure('public.get_marketplace_brand_covers(integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers(int,int) was not created — the seeded signature is load-bearing for the rotating band';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_marketplace_brand_covers(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers is not executable by anon';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE jsonb_array_length(covers) <> 3),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(covers) e
           WHERE coalesce(e->>'url','') = ''))
    INTO v_rows, v_short, v_nourl
  FROM public.get_marketplace_brand_covers(12);

  IF v_short > 0 THEN
    RAISE EXCEPTION 'bounded LATERAL returned % row(s) with a partial strip', v_short;
  END IF;

  -- The re-shaping through jsonb_array_elements is where a url could silently
  -- go missing, and a cover with no url renders as a hole in the strip.
  IF v_nourl > 0 THEN
    RAISE EXCEPTION '% row(s) carry a cover with no url — the thumb re-shape dropped it', v_nourl;
  END IF;

  -- An empty band is the exact failure this removes, so unlike the soft
  -- coverage note in 99100101174500 this one is hard.
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'bounded LATERAL returned no brands at all — the bound is too tight';
  END IF;

  RAISE NOTICE 'get_marketplace_brand_covers(12): % rows, all with a full 3-cover strip', v_rows;
END
$verify$;
