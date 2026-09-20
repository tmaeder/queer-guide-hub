-- The highlight band 500s on prod: 57014, statement timeout.
--
-- `99991789818881` gave `get_marketplace_brand_covers` a seeded hash ordering
-- so the band would rotate. That change was correct and it broke the function,
-- for a reason neither its dry run nor its unit tests could see.
--
-- WHAT THE ORDERING COST. The old body ordered by `product_count DESC, slug`
-- and took twelve. Postgres could walk the brands in that order and STOP as
-- soon as twelve had passed the three-cover LATERAL, so the expensive part ran
-- a dozen or two times. A hash ordering is correlated with nothing, so every
-- eligible brand must be evaluated before the sort can pick a window: the
-- LATERAL went from ~12 executions to 118, and it is not a cheap LATERAL --
-- it joins image_asset_links and image_assets for EVERY candidate listing of
-- every brand, then throws all but three away.
--
-- Measured on prod: 573 ms warm and 279,676 buffers. Warm, it fits inside the
-- 8s ceiling; cold, those buffers are physical reads and PostgREST -- which
-- connects as `authenticator`, whose rolconfig pins statement_timeout=8s --
-- got a 57014 and the band silently vanished from the page.
--
-- WHY IT WAS NOT CAUGHT, WHICH IS THE PART WORTH KEEPING. The migration that
-- introduced it WAS dry-run on prod against live data, and its verify block
-- called this very function four times and passed. But `execute_sql` runs as a
-- privileged role with NO statement_timeout, so the dry run proved the
-- function CORRECT and proved nothing about whether anon could afford it. A
-- migration verify block cannot measure a timeout it does not run under.
-- Quote BUFFERS, not warm milliseconds: 573 ms looked survivable and the
-- 279,676 buffers behind it were the actual finding.
--
-- THE FIX IS THE ONE ALREADY APPLIED TO ITS SIBLING. `get_marketplace_brand_directory`
-- had the identical anti-pattern (2,298 ms / 344,673 buffers) and was fixed in
-- the same migration by picking the cover FIRST and resolving the mirror
-- afterwards. That lesson was not carried across to this function. It is now:
--
--   1. `pool`  -- eligible brands, hash-ordered, bounded. A cheap scan of
--                marketplace_brands (421 buffers, 118 rows) with no listing
--                access at all.
--   2. `picked` -- the three-cover check over that bounded set, WITHOUT the
--                asset joins, stopping at twelve. The nested loop terminates
--                early: measured, 17 of the 60 candidates were touched.
--   3. mirrors  -- resolved per CHOSEN image, 36 lookups rather than tens of
--                thousands.
--
-- Measured on prod, same output: 116 ms and 13,156 buffers. 21x fewer buffers.
--
-- THE CANDIDATE BOUND DOES NOT NARROW THE ROTATION. `pool` is hash-ordered
-- over the WHOLE eligible set before the limit, so every brand is in some
-- seed's window -- the bound caps work per request, not reach across days.
-- 60 is chosen against measurement: 118 brands carry a logo and 94 of those
-- have three distinct covers (80%), so twelve are found long before the bound
-- and it acts as a ceiling rather than as a filter. Do NOT lower it to the
-- twelve the band shows: the three-cover check rejects some candidates, and a
-- bound equal to the window would return a short band on an unlucky seed.

CREATE OR REPLACE FUNCTION public.get_marketplace_brand_covers(
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
  WITH pool AS (
    -- Cheap: marketplace_brands only, no listing access. The hash orders the
    -- WHOLE eligible set; the bound is a work ceiling, not a narrower pool.
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
        -- GROUPED BY THE IMAGE URL, NOT THE LISTING. Colour variants of one
        -- garment are separate listings sharing a hero image, so picking the
        -- top three LISTINGS can yield three byte-identical thumbnails, which
        -- reads as a broken tile rather than as a strip.
        --
        -- The listing id rides along so the mirror can be resolved later; it
        -- is stripped before the row leaves this function.
        SELECT (array_agg(l.id ORDER BY l.boutique_score DESC NULLS LAST))[1] AS id,
               l.images[1] AS url,
               max(l.boutique_score) AS score
        FROM public.marketplace_listings l
        WHERE l.brand_key = p.brand_key
          AND l.status = 'active'
          AND l.content_rating IN ('sfw','suggestive')
          AND coalesce(l.images[1], '') <> ''
        GROUP BY l.images[1]
        ORDER BY max(l.boutique_score) DESC NULLS LAST, l.images[1]
        LIMIT 3
      ) t
    ) c ON jsonb_array_length(c.covers) >= 3
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 24))
  )
  SELECT picked.slug, picked.display_name, picked.logo_url, picked.logo_on_ink,
         picked.product_count, picked.ownership_tags,
         -- Mirrors resolved per CHOSEN image (3 per brand), never per
         -- candidate listing. This is the whole performance fix.
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
                              LIMIT 1)))
            FROM jsonb_array_elements(picked.covers) e) AS covers
  FROM picked;
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(int, int)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_marketplace_brand_covers(int, int) IS
  'Highlight band for /marketplace/brands: makers with a logo and three distinct '
  'SFW cover images, rotated daily over the whole eligible pool by a seeded hash. '
  'Picks covers before resolving mirrors (13k buffers, not 280k) so it fits inside '
  'the 8s anon statement timeout. p_seed defaults to the server day.';

-- WHERE THE TIMEOUT GUARD LIVES, and why it is not in this block.
--
-- A verify block cannot assert a timeout it does not run under: `db push`
-- applies migrations as a privileged role with no `statement_timeout`, and
-- `SET LOCAL` does not survive the way statements are split, so anything
-- asserted here would be measuring the wrong session. Asserting wall-clock
-- instead would be worse — it is warm-cache time, which is exactly the number
-- that made 279,676 buffers look survivable.
--
-- So the postconditions below assert CORRECTNESS, and the affordability guard
-- is `e2e/makers-rotation-and-gallery.spec.ts`, which calls this function
-- through PostgREST as anon — the real role, the real ceiling, cold. That is
-- not theoretical: it is what caught this defect, minutes after the migration
-- it is fixing went green.
DO $verify$
DECLARE
  v_n int;
  v_bad int;
  v_a text[];
  v_b text[];
BEGIN
  -- Shape: a full band, and every strip full and non-repeating. A tile with
  -- two covers, or three copies of one image, reads as broken.
  SELECT count(*) INTO v_n FROM public.get_marketplace_brand_covers(12, 1);
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'band returned % rows, expected 12 — the candidate bound is starving it', v_n;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.get_marketplace_brand_covers(12, 1) r
  WHERE jsonb_array_length(r.covers) <> 3
     OR (SELECT count(DISTINCT e->>'url') FROM jsonb_array_elements(r.covers) e) <> 3;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% tiles have a short or repeating cover strip', v_bad;
  END IF;

  -- The listing id must NOT leak into the response: it is an internal handle
  -- for the mirror lookup, and a client that started keying on it would bind
  -- this function's shape to its implementation.
  SELECT count(*) INTO v_bad
  FROM public.get_marketplace_brand_covers(12, 1) r
  WHERE r.covers::text LIKE '%"id"%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% tiles leak the internal listing id', v_bad;
  END IF;

  -- Rotation survives the rewrite: stable within a seed, different across
  -- seeds. The second half is what catches an ordering that collapsed to a
  -- constant while still returning twelve rows.
  SELECT array_agg(slug ORDER BY slug) INTO v_a FROM public.get_marketplace_brand_covers(12, 1);
  IF v_a IS DISTINCT FROM (SELECT array_agg(slug ORDER BY slug) FROM public.get_marketplace_brand_covers(12, 1)) THEN
    RAISE EXCEPTION 'the same seed returned two different windows; the band is not stable';
  END IF;
  SELECT array_agg(slug ORDER BY slug) INTO v_b FROM public.get_marketplace_brand_covers(12, 99);
  IF v_a = v_b THEN
    RAISE EXCEPTION 'two different seeds returned the same twelve makers; the band is not rotating';
  END IF;

  RAISE NOTICE 'highlight band: 12 rows, strips full, rotation intact';
END
$verify$;
