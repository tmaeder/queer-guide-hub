-- The makers counter band intermittently does not render, and the cause is a
-- GROUP BY I added in 99100101174500.
--
-- MEASURED ON PROD before this change:
--   get_marketplace_brand_covers(12) → 1.86s warm, 279,690 shared buffer hits.
-- For comparison, tag_hygiene_stats was optimised after timing out three times
-- and sits at 57,559. This one is 4.9x that, against an 8s PostgREST ceiling
-- (`authenticator` pins statement_timeout=8s). Warm it fits; cold those blocks
-- are physical reads and it does not, which is the 500.
--
-- The failure is SILENT at the UI, which is why it took an e2e to find: when
-- the RPC errors, `useMarketplaceBrandCovers` returns nothing, `showCounter`
-- goes false, and MarketplaceBrands renders the page with no counter band at
-- all. No error state, no empty band — the band is simply absent, and the page
-- looks deliberate. `e2e/marketplace-makers-directory.spec.ts` catches it as
-- "heading 'On the counter today' not found".
--
-- ── the cost is per-brand, and the outer LIMIT cannot bound it ──
-- #3805 made the band rotate by ordering the whole eligible pool on a seeded
-- hash. An ORDER BY over a hash cannot use an index, so the LATERAL is
-- evaluated for EVERY eligible brand (118 today) before twelve are taken.
-- Capping the candidate pool therefore reduces how many times the LATERAL
-- runs, but not what each run costs — and each run is the expensive half:
--
--   Bitmap Index Scan on idx_marketplace_listings_brand_cover   Buffers:    60
--     -> Bitmap Heap Scan   Heap Blocks: 5743   rows=7407       Buffers: 10521
--       -> Sort -> GroupAggregate (rows=7404) -> LIMIT 3
--
-- `GROUP BY l.images[1]` has to materialise every one of cherrykitten's 7,407
-- listings before LIMIT 3 can apply, so the `boutique_score DESC` half of
-- idx_marketplace_listings_brand_cover is dead weight: the index finds the
-- brand in 60 buffers and grouping then spends 10,521.
--
-- Bounding the candidate set FIRST lets the index serve the ordering:
--
--   Index Scan using idx_marketplace_listings_brand_cover
--     Incremental Sort   Presorted Key: boutique_score   rows=49   Buffers: 97
--
-- 10,521 → 97 buffers, 98.2ms → 1.94ms for that brand. The index was always
-- right; the GROUP BY was stopping it being used.
--
-- ── the GROUP BY stays, because the defect it prevents is real ──
-- Colour variants of one garment are separate listings sharing a hero image,
-- so taking the top three LISTINGS can yield three byte-identical thumbnails,
-- which reads as a broken tile. It only ever needed to look at a handful of
-- candidates, not a whole catalogue.
--
-- ── the asset joins move inside the bound too ──
-- image_asset_links / image_assets were joined across every one of the brand's
-- listings to resolve a mirror URL for three of them. They now join the ≤60
-- survivors. The aggregate is kept EXACTLY as it was — first non-null
-- thumbnail among the listings sharing a URL, highest boutique_score first —
-- because a simpler "thumb of the top listing" returns NULL where a
-- lower-scoring sibling has a mirror, and a NULL thumb falls back to the
-- merchant's own image, which isCfResizableSource denies for cdn.shopify.com.
-- That is a full-size product photo in a 112px tile. Measured: that shortcut
-- changed 4 of 24 rows, so it is not taken.
--
-- ── THIS IS NOT BYTE-IDENTICAL, AND THAT IS STATED RATHER THAN GLOSSED ──
-- Measured against the live function over the same seed, 21 of 24 brands
-- return identical covers and 3 differ. The reason is ties: boutique_score is
-- NULL on much of the corpus, and where a brand's scores are all NULL the old
-- code ranked URLs alphabetically across the WHOLE catalogue, which a bounded
-- set cannot see. The three differing brands get three different — equally
-- valid, equally SFW, same-brand — covers. Alphabetical-by-URL was never a
-- meaningful ranking; it was a tiebreak nobody chose.
--
-- What IS preserved exactly, and was verified before shipping:
--   * which brands qualify. 118 eligible, 94 have ≥3 distinct covers under
--     both the old and the bounded predicate, 0 lost. The `>= 3` join
--     condition is what drops a brand from the band, so this is the property
--     that had to hold.
--   * the signature, the seeded hash ordering, the `, b.slug` total order,
--     the limit clamp, SECURITY INVOKER and the search_path.
--
-- 60 rather than 20: 20 was enough for every brand measured, but the margin is
-- free — the bound exists to stop a full-catalogue scan, and 60 index-ordered
-- tuples cost essentially the same as 20 while leaving room for a brand whose
-- head is unusually duplicated.

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
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT b.slug, b.display_name, b.logo_url, b.logo_on_ink,
         b.product_count, b.ownership_tags, c.covers
  FROM public.marketplace_brands b
  JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object('url', t.url, 'thumb', t.thumb)
             ORDER BY t.score DESC NULLS LAST, t.url
           ) AS covers
    FROM (
      SELECT cand.url,
             max(cand.boutique_score) AS score,
             (array_agg(ia.thumbnail_url ORDER BY cand.boutique_score DESC NULLS LAST)
                FILTER (WHERE ia.thumbnail_url IS NOT NULL))[1] AS thumb
      FROM (
        -- The bound. Index-ordered, so this is an Incremental Sort over ~60
        -- tuples rather than a heap scan of the brand's whole catalogue.
        SELECT l.id, l.images[1] AS url, l.boutique_score
        FROM public.marketplace_listings l
        WHERE l.brand_key = b.brand_key
          AND l.status = 'active'
          AND l.content_rating IN ('sfw','suggestive')
          AND coalesce(l.images[1], '') <> ''
        ORDER BY l.boutique_score DESC NULLS LAST, l.id
        LIMIT 60
      ) cand
      LEFT JOIN public.image_asset_links k
        ON k.entity_type = 'marketplace_listing'
       AND k.entity_id = cand.id
       AND k.sort_order = 0
      LEFT JOIN public.image_assets ia
        ON ia.id = k.asset_id
       AND ia.status = 'active'
       AND ia.optimization_status IN ('optimized','cdn_optimized')
      -- Dedupe by hero image, not by listing: colour variants share one.
      GROUP BY cand.url
      ORDER BY max(cand.boutique_score) DESC NULLS LAST, cand.url
      LIMIT 3
    ) t
  ) c ON jsonb_array_length(c.covers) >= 3
  WHERE b.status = 'approved'
    AND b.slug IS NOT NULL
    AND b.product_count > 0
    AND b.logo_url IS NOT NULL
  -- The whole eligible pool, ordered by a seeded hash. `, b.slug` makes the
  -- order total so a hash collision cannot flicker a maker in and out of the
  -- window between two requests on the same day.
  ORDER BY hashtext(b.slug || coalesce(p_seed, (current_date - DATE '2026-01-01'))::text),
           b.slug
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 24));
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(integer, integer) TO anon, authenticated, service_role;

DO $verify$
DECLARE
  v_rows int;
  v_short int;
  v_buffers bigint;
BEGIN
  -- Structural: the function still exists, is anon-callable, and still holds
  -- its own shape. None of this can rot with the data.
  IF to_regprocedure('public.get_marketplace_brand_covers(integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers(int,int) was not created — the seeded signature is load-bearing for the rotating band';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_marketplace_brand_covers(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers is not executable by anon';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE jsonb_array_length(covers) <> 3)
    INTO v_rows, v_short
  FROM public.get_marketplace_brand_covers(12);

  -- A partial strip is the one shape the >= 3 join condition exists to refuse.
  IF v_short > 0 THEN
    RAISE EXCEPTION 'bounded LATERAL returned % row(s) with a partial strip', v_short;
  END IF;

  -- The band going EMPTY is the very failure this migration fixes, so unlike
  -- the coverage note in 99100101174500 this one is hard: if bounding the
  -- candidate set has dropped every brand, shipping it would replace an
  -- intermittent 500 with a permanently absent band.
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'bounded LATERAL returned no brands at all — the bound is too tight';
  END IF;

  RAISE NOTICE 'get_marketplace_brand_covers(12): % rows, all with a full strip', v_rows;
END
$verify$;
