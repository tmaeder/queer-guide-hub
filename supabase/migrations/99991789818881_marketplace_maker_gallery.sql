-- The makers directory: a rotating highlight, and a cover for every maker.
--
-- Two things the page could not do, both because the data layer could not
-- answer them.
--
-- 1. THE HIGHLIGHT BAND NEVER CHANGED. `get_marketplace_brand_covers` orders
--    by `product_count DESC` and takes the top N, so the same twelve makers
--    have led the page since it shipped. Measured on prod today, 94 brands
--    clear every gate the band already enforces (approved, slugged, a logo,
--    and three DISTINCT SFW cover images) -- so 82 of them were unreachable,
--    not because they failed a quality bar but because they sell less than
--    the twelve above them. `p_seed` rotates the window over the whole
--    eligible pool instead.
--
--    The seed DEFAULTS TO THE SERVER'S DAY, so a caller that passes nothing
--    still rotates. That is deliberate: the alternative is every client
--    computing a date, and a client that gets it wrong pins the band to one
--    window forever -- a defect that looks exactly like the one being fixed
--    here, which is to say invisible.
--
--    Ordering is `hashtext(slug || seed)` and NOT `random()`. `random()` is
--    VOLATILE, so the band would reshuffle on every request: a reader who
--    scrolled and came back would find a different twelve, and two tabs would
--    disagree. Hash ordering is stable for a given day, identical for every
--    visitor, and cacheable. `hashtext` can collide and that is harmless here
--    -- a collision reorders two makers, it does not drop one -- but `, slug`
--    still tie-breaks so the order is TOTAL. Without it a collision at the
--    window's edge would flicker a maker in and out between requests, which
--    is the same defect the existing `, b.slug` tie-break was added for.
--
-- 2. NOTHING COULD ASK FOR THE LONG TAIL'S IMAGERY. The directory read is a
--    flat select of six columns over all 871 makers; the covers RPC is a
--    LATERAL over twelve. There was no way to ask "one cover for every maker",
--    so the tail could only ever be text. `get_marketplace_brand_directory`
--    answers exactly that, and it is what lets the page put the 657 makers
--    that HAVE a photograph into a gallery and the 214 that do not into an
--    index -- rather than rendering 214 empty boxes, which is what a gallery
--    over the whole catalogue would do.
--
-- THE SHAPE OF THE SECOND FUNCTION IS A PERFORMANCE FIX, NOT A STYLE CHOICE,
-- and the measurement is the reason it is written the way it is. The obvious
-- form -- resolve the mirror inside the same aggregate that picks the cover,
-- the way `get_marketplace_brand_covers` does -- joins `image_asset_links`
-- and `image_assets` for EVERY candidate listing before discarding all but
-- one. Measured on prod: 2,298 ms and 344,673 buffers, with 302k of those
-- buffers in the two asset joins alone (33,685 + 40,398 index lookups).
-- Picking the cover FIRST and resolving one mirror per brand afterwards is
-- 244 ms and 12,411 buffers for a byte-identical result -- 9.4x faster, 28x
-- fewer buffers. Anon's statement timeout is 8s, so the naive form was not
-- merely slow, it was within one catalogue growth spurt of failing outright.
--
-- Do NOT "tidy" the scalar subquery back into the LATERAL.
--
-- A cover is NULLABLE and that is the point: `url IS NULL` is what the page
-- partitions on. It is not an error and must never be filtered out here --
-- a maker with no photograph still belongs in the directory, it just belongs
-- in the index half of it.

-- ---------------------------------------------------------------------------
-- 1. Rotating highlight
-- ---------------------------------------------------------------------------

-- DROPPED, not replaced. Adding a defaulted parameter creates a SECOND
-- function rather than amending this one, and PostgREST resolves overloads BY
-- ARGUMENT NAME -- so the one-arg form would linger and a call naming both
-- arguments would 300 on an ambiguous match. The repo has been bitten by the
-- mirror-image of this (a renamed argument answering PGRST202 404 in silence),
-- which is why the old signature goes before the new one arrives.
DROP FUNCTION IF EXISTS public.get_marketplace_brand_covers(int);

CREATE FUNCTION public.get_marketplace_brand_covers(
  p_limit int DEFAULT 12,
  p_seed  int DEFAULT NULL
)
RETURNS TABLE(
  slug text, display_name text, logo_url text, logo_on_ink boolean,
  product_count integer, ownership_tags text[], covers jsonb
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- as a broken tile rather than as a strip.
      SELECT l.images[1] AS url,
             max(l.boutique_score) AS score,
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
  -- The whole eligible pool, ordered by a seeded hash. `, b.slug` makes the
  -- order total so a hash collision cannot flicker a maker in and out of the
  -- window between two requests on the same day.
  ORDER BY hashtext(b.slug || coalesce(p_seed, (current_date - DATE '2026-01-01'))::text),
           b.slug
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 24));
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(int, int)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_marketplace_brand_covers(int, int) IS
  'Highlight band for /marketplace/brands: makers with a logo and three distinct '
  'SFW cover images, rotated daily over the whole eligible pool by a seeded hash. '
  'p_seed defaults to the server day. Not a ranking - see get_marketplace_brand_directory '
  'for the ordered catalogue.';

-- ---------------------------------------------------------------------------
-- 2. The catalogue, with one cover each
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_marketplace_brand_directory()
RETURNS TABLE(
  slug text, display_name text, logo_url text, logo_on_ink boolean,
  story text, product_count integer, ownership_tags text[],
  cover_url text, cover_thumb text
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT b.slug, b.display_name, b.logo_url, b.logo_on_ink,
         b.story, b.product_count, b.ownership_tags,
         c.url AS cover_url,
         -- Resolved per BRAND, after the cover is chosen -- see the header.
         -- Nullable and normal: 623 of 657 covers hold a mirror, and <Image>
         -- walks optimized -> thumbnail -> original, so a miss degrades to the
         -- merchant's own URL rather than to a fallback texture.
         (SELECT ia.thumbnail_url
            FROM public.image_asset_links k
            JOIN public.image_assets ia
              ON ia.id = k.asset_id
             AND ia.status = 'active'
             AND ia.optimization_status IN ('optimized','cdn_optimized')
           WHERE k.entity_type = 'marketplace_listing'
             AND k.entity_id = c.id
             AND k.sort_order = 0
           LIMIT 1) AS cover_thumb
  FROM public.marketplace_brands b
  -- LEFT join: a maker with no photograph stays in the catalogue.
  LEFT JOIN LATERAL (
    SELECT l.id, l.images[1] AS url
    FROM public.marketplace_listings l
    WHERE l.brand_key = b.brand_key
      AND l.status = 'active'
      AND l.content_rating IN ('sfw','suggestive')
      AND coalesce(l.images[1], '') <> ''
    ORDER BY l.boutique_score DESC NULLS LAST, l.images[1]
    LIMIT 1
  ) c ON true
  WHERE b.status = 'approved'
    AND b.slug IS NOT NULL
    -- Not cosmetic: marketplace_brands retains rows whose listings have all
    -- gone inactive, and a tile that opens onto an empty grid is a dead end
    -- the reader paid a navigation for.
    AND b.product_count > 0
  ORDER BY b.product_count DESC NULLS LAST, b.slug;
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_directory()
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_marketplace_brand_directory() IS
  'Every approved maker with listings, ordered by product_count, with ONE SFW '
  'cover image each where one exists (cover_url is nullable by design - the page '
  'partitions gallery vs index on it). Replaces the flat select in '
  'useMarketplaceBrandsDirectory.';

-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_rows int;
  v_covers int;
  v_pool int;
  v_a text[];
  v_b text[];
BEGIN
  IF to_regprocedure('public.get_marketplace_brand_covers(int,int)') IS NULL THEN
    RAISE EXCEPTION 'get_marketplace_brand_covers(int,int) was not created';
  END IF;
  -- The old signature must be GONE, or PostgREST has two candidates to choose
  -- between and a named call 300s on the ambiguity.
  IF to_regprocedure('public.get_marketplace_brand_covers(int)') IS NOT NULL THEN
    RAISE EXCEPTION 'the one-arg get_marketplace_brand_covers still exists; PostgREST will see an ambiguous overload';
  END IF;
  IF to_regprocedure('public.get_marketplace_brand_directory()') IS NULL THEN
    RAISE EXCEPTION 'get_marketplace_brand_directory was not created';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_marketplace_brand_covers(int,int)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_marketplace_brand_directory()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute the directory functions; both bands would be silently empty';
  END IF;

  -- The directory must return the catalogue AND must not have filtered the
  -- coverless makers away -- that would silently delete the index half of the
  -- page while leaving the gallery looking perfectly healthy.
  SELECT count(*), count(cover_url) INTO v_rows, v_covers
  FROM public.get_marketplace_brand_directory();
  IF v_rows < 500 THEN
    RAISE EXCEPTION 'directory returned % rows; expected the whole catalogue', v_rows;
  END IF;
  IF v_covers = 0 THEN
    RAISE EXCEPTION 'directory returned no covers at all; the gallery would be empty';
  END IF;
  IF v_covers >= v_rows THEN
    RAISE EXCEPTION 'every directory row has a cover (%/%) - the coverless makers have been filtered out and the index half of the page is gone',
      v_covers, v_rows;
  END IF;

  -- The highlight must reach past the twelve biggest makers, which is the
  -- whole point of the change.
  SELECT count(*) INTO v_pool FROM public.get_marketplace_brand_covers(24, 1);
  IF v_pool < 12 THEN
    RAISE EXCEPTION 'highlight pool returned only % rows', v_pool;
  END IF;

  -- Same seed twice must agree (or a reader who comes back sees a different
  -- band), and two seeds must differ (or it is not rotating at all). The
  -- second test is the one that catches a hash ordering silently collapsing
  -- to a constant.
  SELECT array_agg(slug ORDER BY slug) INTO v_a FROM public.get_marketplace_brand_covers(12, 1);
  IF v_a IS DISTINCT FROM (SELECT array_agg(slug ORDER BY slug) FROM public.get_marketplace_brand_covers(12, 1)) THEN
    RAISE EXCEPTION 'the same seed returned two different windows; the band is not stable';
  END IF;
  SELECT array_agg(slug ORDER BY slug) INTO v_b FROM public.get_marketplace_brand_covers(12, 99);
  IF v_a = v_b THEN
    RAISE EXCEPTION 'two different seeds returned the same twelve makers; the band is not rotating';
  END IF;

  RAISE NOTICE 'makers directory: % rows, % with a cover; highlight pool >= %', v_rows, v_covers, v_pool;
END
$verify$;
