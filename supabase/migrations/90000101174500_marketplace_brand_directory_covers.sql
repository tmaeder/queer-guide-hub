-- Product covers for the makers directory (/marketplace/brands).
--
-- The directory renders a maker as a mark, a name and a number, and that is
-- almost all it CAN render: measured on prod, of the 885 approved brands with
-- live listings, `story` is present on 24 (2.7%), `ownership_tags` on 37 (4%)
-- and `logo_url` on 118 (13%). The tile was designed around a paragraph that
-- 97% of the catalogue does not have, which is where its dead air comes from.
--
-- Meanwhile the one rich signal the catalogue owns has never been on the page:
-- 671 of 885 brands (76%) have at least one SFW listing with an image, 573 have
-- three or more, and the head of the ordering is saturated. A boutique is its
-- goods; this RPC is what finally puts them on the index.
--
-- SCOPE IS DELIBERATELY THE HEAD, NOT THE WHOLE CATALOGUE. The page asks for
-- ~12 rows for one featured band and renders the remaining ~870 as a
-- typographic index, so this never fans out to 885 lateral subqueries.
--
-- ── SECURITY INVOKER, unlike its DEFINER sibling get_marketplace_spotlight_brands ──
-- That one is DEFINER because it deliberately reaches rows RLS hides. This one
-- wants exactly what RLS already grants anon, and the difference is not
-- theoretical: measured as `anon`, marketplace_listings shows 42,137 active SFW
-- rows against 48,904 seen as service_role. A DEFINER here would bypass that
-- 6,767-row filter and could put a listing on a public index that anon is not
-- meant to see — and it would land the function in front of
-- check-definer-content-leaks.mjs for the privilege. INVOKER is both safer and
-- less work. Verified below that anon can actually read all four tables, since
-- an INVOKER function starved by RLS fails SILENTLY, as an empty band.
--
-- ── content safety ──
-- `content_rating IN ('sfw','suggestive')` is the entire gate for this band and
-- is NOT a caller parameter: a cover on a public directory must not be
-- flippable to 'adult' by whoever calls the RPC. The live vocabulary is
-- sfw / suggestive / adult / explicit. A NULL rating is EXCLUDED rather than
-- coalesced to 'sfw' — unclassified is not evidence of safe.
--
-- ── two bars that are hard, not preferred ──
--   * `logo_url IS NOT NULL` — a featured tile with no mark reads as broken
--     beside eleven that have one. It also drops the brand literally named
--     "Custom" (800 listings, no domain, one merchant's junk bucket), which
--     sits tenth by listing count.
--   * three covers, enforced as the LATERAL's join condition — a strip with a
--     hole in it is worse than no strip, and failing the join drops the brand
--     rather than handing the client a partial array to defend against.
-- 94 brands clear both bars today, so a 12-row band has ~8x headroom.
--
-- The heading this feeds is "Most listings", never "Featured" or "Our picks".
-- The ordering is product_count DESC and nothing has curated it; a curation
-- word would be an unbacked claim about the catalogue, the same failure
-- `useVerifiedOwnedBrands` and `CoverageNote` exist to prevent. `is_spotlight`
-- is deliberately NOT consulted: it is editorial (7 rows), and mixing "spotlit"
-- with "biggest" under one heading is the claim-drift `routeMetaContract`
-- guards.

-- The lateral filters by status/rating and sorts by boutique_score; the
-- existing idx_marketplace_listings_brand_key_col covers only brand_key and
-- leaves both to the heap. The brands this runs for are by definition the
-- largest in the catalogue (the top one has 7,391 listings), so the lateral
-- gets its own partial index. No CONCURRENTLY — migrations run in a transaction.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_brand_cover
  ON public.marketplace_listings (brand_key, boutique_score DESC NULLS LAST)
  WHERE status = 'active' AND content_rating IN ('sfw','suggestive');

CREATE OR REPLACE FUNCTION public.get_marketplace_brand_covers(p_limit int DEFAULT 12)
RETURNS TABLE (
  slug text,
  display_name text,
  logo_url text,
  logo_on_ink boolean,
  product_count integer,
  ownership_tags text[],
  covers jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT b.slug, b.display_name, b.logo_url, b.logo_on_ink,
         b.product_count, b.ownership_tags, c.covers
  FROM public.marketplace_brands b
  JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object('url', t.url, 'thumb', t.thumb)
             ORDER BY t.score DESC NULLS LAST, t.url
           ) AS covers
    FROM (
      -- GROUPED BY THE IMAGE URL, NOT THE LISTING. Colour variants of one
      -- garment are separate listings sharing a hero image, so picking the top
      -- three LISTINGS can yield three byte-identical thumbnails, which reads
      -- as a broken tile rather than as a strip. Measured clean across the
      -- current top twelve, but the set rotates with product_count and the
      -- defence is two lines.
      SELECT l.images[1] AS url,
             max(l.boutique_score) AS score,
             -- `img.queer.guide` mirror when we hold one. Load-bearing for
             -- weight, not for looks: isCfResizableSource (see
             -- src/utils/cloudflareOptimizations.ts) DENIES cdn.shopify.com,
             -- which is most of this catalogue, so a raw merchant URL gets no
             -- CDN resizing at all and downloads a full product photo into a
             -- ~112px tile. 78.5% of active SFW listings have a mirror.
             -- Nullable by design — <Image> walks optimized -> thumbnail ->
             -- original, so an un-mirrored (or WAF-blocked) thumb degrades to
             -- the merchant's own image rather than to a fallback texture.
             (array_agg(ia.thumbnail_url ORDER BY l.boutique_score DESC NULLS LAST)
                FILTER (WHERE ia.thumbnail_url IS NOT NULL))[1] AS thumb
      FROM public.marketplace_listings l
      LEFT JOIN public.image_asset_links k
        ON k.entity_type = 'marketplace_listing'
       AND k.entity_id = l.id
       AND k.sort_order = 0
      LEFT JOIN public.image_assets ia
        ON ia.id = k.asset_id
       AND ia.status = 'active'
       AND ia.optimization_status IN ('optimized','cdn_optimized')
      WHERE l.brand_key = b.brand_key
        AND l.status = 'active'
        AND l.content_rating IN ('sfw','suggestive')
        AND coalesce(l.images[1], '') <> ''
      GROUP BY l.images[1]
      ORDER BY max(l.boutique_score) DESC NULLS LAST, l.images[1]
      LIMIT 3
    ) t
  ) c ON jsonb_array_length(c.covers) >= 3
  WHERE b.status = 'approved'
    AND b.slug IS NOT NULL
    AND b.product_count > 0
    AND b.logo_url IS NOT NULL
  -- `, b.slug` is not decoration: product_count alone is not a total order, so
  -- without it a tie at the twelfth position reshuffles between requests and a
  -- brand flickers in and out of the band.
  ORDER BY b.product_count DESC NULLS LAST, b.slug
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 24));
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(int) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_marketplace_brand_covers(int) IS
  'Head of the makers directory with exactly 3 SFW product covers per brand, each {url, thumb}. Requires a logo; SECURITY INVOKER so RLS still filters the listings. See the migration header for why both bars are hard.';

DO $verify$
DECLARE
  v_rows int;
  v_short int;
BEGIN
  -- HARD on the structural postconditions: that the function exists, is
  -- callable by anon and holds its own shape is what this migration exists to
  -- reach, and none of it can rot with the data.
  IF to_regprocedure('public.get_marketplace_brand_covers(int)') IS NULL THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers was not created';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_marketplace_brand_covers(int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers is not executable by anon';
  END IF;

  -- An INVOKER function starved by RLS returns an EMPTY BAND, not an error, so
  -- assert anon can actually reach all four tables this reads. Checked as a
  -- privilege rather than by counting rows, which would be a data assertion.
  IF NOT (has_table_privilege('anon', 'public.marketplace_brands', 'SELECT')
      AND has_table_privilege('anon', 'public.marketplace_listings', 'SELECT')
      AND has_table_privilege('anon', 'public.image_asset_links', 'SELECT')
      AND has_table_privilege('anon', 'public.image_assets', 'SELECT')) THEN
    RAISE EXCEPTION 'anon cannot read every table get_marketplace_brand_covers needs; the band would be silently empty';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE jsonb_array_length(covers) <> 3)
    INTO v_rows, v_short
  FROM public.get_marketplace_brand_covers(12);

  IF v_short > 0 THEN
    RAISE EXCEPTION 'the >=3 covers join condition is not holding: % rows came back short', v_short;
  END IF;

  -- SOFT on coverage. 94 brands clear both bars as of writing, but that is a
  -- measurement of a churning catalogue, not an invariant — aborting db push
  -- (which takes every migration queued behind it, repo-wide) because an ingest
  -- run moved a number would be wildly out of proportion to a band of twelve
  -- tiles. The page renders nothing when the band is empty.
  RAISE NOTICE 'get_marketplace_brand_covers(12): % rows', v_rows;
END
$verify$;
