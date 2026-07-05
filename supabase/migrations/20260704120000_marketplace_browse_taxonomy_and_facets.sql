-- Marketplace "Browse by department" — fix empty categories + finer taxonomy + tag facets
--
-- Three compounding problems this migration fixes:
--   1. Empty categories. The tile / dropdown counts counted ALL active listings, but
--      the browse grid defaults to SFW (content_rating in ('sfw','suggestive')). The
--      100%-adult umbrellas (intimacy 4669/0 SFW, bdsm_fetish 2868/0 SFW) showed a big
--      count then an empty grid. Every count RPC now takes p_include_adult and gates
--      on content_rating exactly like the grid does.
--   2. 'other' dumping ground. marketplace_department() only mapped ~16 canonical
--      slugs, so ~9000 real listings (tops, dildo, jockstrap, harness, …) fell to
--      'other'. Replaced the ELSE branch with a token/keyword classifier so every real
--      listing lands in a real department.
--   3. No finer subsections. Added marketplace_subcategory_group() — a clean canonical
--      fine bucket (tops/bottoms/dildos/harnesses/…) — as a STORED column so department
--      pages can show finer sub-tiles that filter correctly.
--
-- Both generated columns regenerate via a single ALTER TABLE rewrite (storm-free DDL,
-- does NOT fire the per-row trg_search_documents_marketplace on the disk-constrained DB).
-- Idempotent; runs in a txn (no CONCURRENTLY).

-- ============================================================================
-- 1. Canonical fine bucket — token/keyword classifier (single source of truth)
-- ============================================================================
-- Normalises the raw merchant subcategory to space-separated tokens and matches
-- word-boundary (\y) patterns, adult/intimate first so "cock ring" never lands in
-- jewelry. Plural-tolerant (s?/es?). Pure + IMMUTABLE → usable in a generated column.
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT btrim(regexp_replace(lower(coalesce(p_subcategory,'')), '[^a-z0-9]+', ' ', 'g')) AS n
  )
  SELECT CASE
    -- ── intimacy (sex toys & intimate) ────────────────────────────────────
    WHEN n ~ '\y(anal|analplugs?|buttplugs?|plugs?|prostate|beads?)\y'              THEN 'anal_toys'
    WHEN n ~ '\y(dildos?|dongs?|realistics?)\y'                                     THEN 'dildos'
    WHEN n ~ '\y(masturbators?|masturbatoren|strokers?|fleshlights?|vaginas?|onanism|sleeves?)\y' THEN 'masturbators'
    WHEN n ~ '\y(vibrators?|vibes?|wands?)\y'                                       THEN 'vibrators'
    WHEN n ~ '\y(cock ?rings?|cockrings?|cock ?straps?|ball ?stretchers?|sheaths?|glans|foreskin)\y' THEN 'cock_rings'
    WHEN n ~ '\y(chastity|cages?|cbt)\y'                                            THEN 'chastity'
    WHEN n ~ '\y(pumps?|enlarge|enlargement)\y'                                     THEN 'pumps'
    WHEN n ~ '\y(lubes?|lubricants?|gleitgel|gleitmittel)\y'                        THEN 'lubes'
    WHEN n ~ '\y(aromas?|poppers?)\y'                                               THEN 'poppers'
    WHEN n ~ '\y(condoms?|kondome|douches?|enema|safer sex)\y'                       THEN 'safer_sex'
    WHEN n ~ '\y(sex ?toys?|sextoys?|strap ?ons?|strapon|better sex|nipples?|clamps?|sounds?|urethral|estim)\y' THEN 'sex_toys'
    -- ── bdsm / fetish ─────────────────────────────────────────────────────
    WHEN n ~ '\y(pups?|puppy|pet play|kitten|neko|pony)\y'                          THEN 'pup_play'
    WHEN n ~ '\y(bondage|restraints?|handcuffs?|cuffs?|leash\w*|ropes?|shibari|spreaders?|slings?)\y' THEN 'bondage'
    WHEN n ~ '\y(floggers?|paddles?|whips?|canes?|impact|punishment|spank)\y'       THEN 'impact_play'
    WHEN n ~ '\y(gags?|muzzles?)\y'                                                 THEN 'gags'
    WHEN n ~ '\y(hoods?|blindfolds?|masks?)\y'                                      THEN 'hoods_masks'
    WHEN n ~ '\y(harness|harnesses)\y'                                             THEN 'harnesses'
    WHEN n ~ '\y(collars?)\y'                                                       THEN 'collars'
    WHEN n ~ '\y(fetish|leather|latex|rubber|neoprene|sleaze|bdsm|kink|dungeon)\y'  THEN 'fetish_gear'
    -- ── underwear ─────────────────────────────────────────────────────────
    WHEN n ~ '\y(jocks?|jockstraps?)\y'                                             THEN 'jockstraps'
    WHEN n ~ '\y(thongs?|g ?strings?)\y'                                            THEN 'thongs'
    WHEN n ~ '\y(lingerie)\y'                                                       THEN 'lingerie'
    WHEN n ~ '\y(underwear|undies|briefs?|boxers?)\y'                               THEN 'underwear'
    -- ── swimwear ──────────────────────────────────────────────────────────
    WHEN n ~ '\y(swim|swimwear|swimsuits?|speedos?|swim ?trunks?|beachwear)\y'      THEN 'swimwear'
    -- ── jewelry (before accessories so "jewelry and pins" wins over "pins") ─
    WHEN n ~ '\y(jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|rings?|chokers?|chains?|anklets?|brooch\w*)\y' THEN 'jewelry'
    -- ── apparel (fine) ────────────────────────────────────────────────────
    WHEN n ~ '\y(socks?)\y'                                                         THEN 'socks'
    WHEN n ~ '\y(jackets?|coats?|hoodies?|sweaters?|sweatshirts?|jumpers?|knits?|knitwear|cardigans?|outwears?|outerwear|parkas?)\y' THEN 'outerwear'
    WHEN n ~ '\y(jumpsuits?|onesies?|rompers?|bodysuits?|catsuits?)\y'              THEN 'bodywear'
    WHEN n ~ '\y(shoes?|boots?|sneakers?|footwear|trainers?)\y'                     THEN 'footwear'
    WHEN n ~ '\y(caps?|hats?|beanies?|snapbacks?|headwear)\y'                       THEN 'headwear'
    WHEN n ~ '\y(bottoms?|pants?|trousers?|shorts?|jeans?|denim|leggings?|joggers?|chinos?)\y' THEN 'bottoms'
    WHEN n ~ '\y(tops?|t ?shirts?|tees?|tanks?|singlets?|shirts?|polos?|jerseys?|rugby|blouses?|vests?)\y' THEN 'tops'
    WHEN n ~ '\y(accessor\w*|accessoires?|bags?|backpacks?|wallets?|belts?|ties?|bandanas?|armbands?|scarf|scarves|gloves?|sunglass\w*|patch\w*|flags?|pins?|badges?|keychains?|lanyards?|stickers?)\y' THEN 'accessories'
    WHEN n ~ '\y(apparel|clothing|clothes|garments?|menswear|womenswear|wear|fashion|sportswear|loungewear|sports?|uniforms?|suits?|dresses?|robes?|chaps)\y' THEN 'apparel'
    -- ── books & art ───────────────────────────────────────────────────────
    WHEN n ~ '\y(books?|magazines?|zines?|comics?|novels?|ebooks?)\y'               THEN 'books'
    WHEN n ~ '\y(art|arts|prints?|posters?|paintings?|photography|illustrations?|artwork)\y' THEN 'art'
    -- ── hygiene / grooming ────────────────────────────────────────────────
    WHEN n ~ '\y(hygiene|skincare|skin care|grooming|cosmetics?|makeup|make up|mascaras?|soaps?|shampoos?|deodorants?|fragrances?|perfumes?|cologne|lotions?|beard|shave|shaving|razors?|toothbrush|care|wash)\y' THEN 'grooming'
    -- ── services ──────────────────────────────────────────────────────────
    WHEN n ~ '\y(mental health|therapy|coaching|coach|training|events?|planning|consultation|services?|booking|sessions?|workshops?)\y' THEN 'services'
    ELSE 'other'
  END
  FROM s;
$$;

-- ============================================================================
-- 2. Department umbrella — derived from the fine bucket (one place to change)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_department(p_subcategory text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.marketplace_subcategory_group(p_subcategory)
    WHEN 'anal_toys'   THEN 'intimacy'
    WHEN 'dildos'      THEN 'intimacy'
    WHEN 'masturbators'THEN 'intimacy'
    WHEN 'vibrators'   THEN 'intimacy'
    WHEN 'cock_rings'  THEN 'intimacy'
    WHEN 'chastity'    THEN 'intimacy'
    WHEN 'pumps'       THEN 'intimacy'
    WHEN 'lubes'       THEN 'intimacy'
    WHEN 'poppers'     THEN 'intimacy'
    WHEN 'safer_sex'   THEN 'intimacy'
    WHEN 'sex_toys'    THEN 'intimacy'
    WHEN 'pup_play'    THEN 'bdsm_fetish'
    WHEN 'bondage'     THEN 'bdsm_fetish'
    WHEN 'impact_play' THEN 'bdsm_fetish'
    WHEN 'gags'        THEN 'bdsm_fetish'
    WHEN 'hoods_masks' THEN 'bdsm_fetish'
    WHEN 'harnesses'   THEN 'bdsm_fetish'
    WHEN 'collars'     THEN 'bdsm_fetish'
    WHEN 'fetish_gear' THEN 'bdsm_fetish'
    WHEN 'jockstraps'  THEN 'underwear'
    WHEN 'thongs'      THEN 'underwear'
    WHEN 'lingerie'    THEN 'underwear'
    WHEN 'underwear'   THEN 'underwear'
    WHEN 'swimwear'    THEN 'swimwear'
    WHEN 'socks'       THEN 'apparel'
    WHEN 'outerwear'   THEN 'apparel'
    WHEN 'bodywear'    THEN 'apparel'
    WHEN 'footwear'    THEN 'apparel'
    WHEN 'headwear'    THEN 'apparel'
    WHEN 'bottoms'     THEN 'apparel'
    WHEN 'tops'        THEN 'apparel'
    WHEN 'accessories' THEN 'apparel'
    WHEN 'apparel'     THEN 'apparel'
    WHEN 'jewelry'     THEN 'jewelry'
    WHEN 'books'       THEN 'books_art'
    WHEN 'art'         THEN 'books_art'
    WHEN 'grooming'    THEN 'hygiene'
    WHEN 'services'    THEN 'services'
    ELSE 'other'
  END;
$$;

-- ============================================================================
-- 3. Regenerate department + add subcategory_group (single table rewrite)
-- ============================================================================
-- Dropping department cascades its index; both columns recompute with the new
-- function bodies. No object depends on department (verified: no views/gen-cols).
ALTER TABLE public.marketplace_listings
  DROP COLUMN IF EXISTS department,
  ADD COLUMN department text
    GENERATED ALWAYS AS (public.marketplace_department(subcategory)) STORED,
  ADD COLUMN subcategory_group text
    GENERATED ALWAYS AS (public.marketplace_subcategory_group(subcategory)) STORED;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_department
  ON public.marketplace_listings (department) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_subcategory_group
  ON public.marketplace_listings (subcategory_group) WHERE status = 'active';

COMMENT ON COLUMN public.marketplace_listings.subcategory_group IS
  'Canonical fine browse bucket (tops/bottoms/dildos/harnesses/…). STORED generated from '
  'subcategory via marketplace_subcategory_group(). Drives department sub-tiles + filter drill-down.';

-- ============================================================================
-- 4. Count RPCs — now content-rating aware (mirror the SFW grid gate)
-- ============================================================================
-- Drop the pre-p_include_adult overloads first: adding a defaulted param would
-- otherwise leave two candidates and make PostgREST calls ambiguous.
DROP FUNCTION IF EXISTS public.get_marketplace_subcategory_counts();
DROP FUNCTION IF EXISTS public.count_marketplace_subcategory(text);
DROP FUNCTION IF EXISTS public.get_marketplace_facets(text, text, text, uuid);

-- Per-subcategory-slug counts (all-categories page). Gated + uncapped (was LIMIT 16,
-- which under-counted departments once the long tail folds in).
CREATE OR REPLACE FUNCTION public.get_marketplace_subcategory_counts(
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(slug text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT subcategory_slug AS slug, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_slug IS NOT NULL AND subcategory_slug <> ''
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY subcategory_slug
  HAVING count(*) >= 3
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_subcategory_counts(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_subcategory_counts(boolean) TO anon, authenticated;

-- Department umbrella counts — the tile + department-dropdown source of truth
-- (replaces client aggregation of the top-16 subcategory counts).
CREATE OR REPLACE FUNCTION public.get_marketplace_department_counts(
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(department text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT department, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND department IS NOT NULL AND department <> 'other'
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY department
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_department_counts(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_department_counts(boolean) TO anon, authenticated;

-- Finer sub-tiles within a department (canonical groups, gated).
CREATE OR REPLACE FUNCTION public.get_marketplace_subcategory_group_counts(
  p_department text DEFAULT NULL, p_include_adult boolean DEFAULT false)
RETURNS TABLE(grp text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT subcategory_group AS grp, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_group IS NOT NULL AND subcategory_group <> 'other'
    AND (p_department IS NULL OR department = p_department)
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY subcategory_group
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_subcategory_group_counts(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_subcategory_group_counts(text, boolean) TO anon, authenticated;

-- Single-category count (legacy category page) — gated.
CREATE OR REPLACE FUNCTION public.count_marketplace_subcategory(
  p_slug text, p_include_adult boolean DEFAULT false)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::bigint
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_slug = lower(regexp_replace(coalesce(p_slug, ''), '[\s\-]+', '_', 'g'))
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'));
$$;
REVOKE ALL ON FUNCTION public.count_marketplace_subcategory(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_marketplace_subcategory(text, boolean) TO anon, authenticated;

-- Filter-dropdown facets — gated, plus a by_department bucket. Keeps the
-- "exclude a dimension's own filter from its own bucket" invariant.
CREATE OR REPLACE FUNCTION public.get_marketplace_facets(
  p_category text DEFAULT NULL,
  p_subcategory text DEFAULT NULL,
  p_business_type text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sub_slug text := lower(regexp_replace(coalesce(p_subcategory, ''), '[\s\-]+', '_', 'g'));
  v_total bigint;
  v_by_cat jsonb;
  v_by_sub jsonb;
  v_by_bt jsonb;
  v_by_dept jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.marketplace_listings ml
  WHERE ml.status = 'active'
    AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    AND (p_category IS NULL OR ml.category = p_category)
    AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
    AND (p_business_type IS NULL OR ml.business_type = p_business_type)
    AND (p_category_id IS NULL OR ml.category_id = p_category_id);

  SELECT coalesce(jsonb_object_agg(category, c), '{}'::jsonb) INTO v_by_cat
  FROM (
    SELECT ml.category, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active' AND ml.category IS NOT NULL
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.category
  ) s;

  SELECT coalesce(jsonb_object_agg(subcategory_slug, c), '{}'::jsonb) INTO v_by_sub
  FROM (
    SELECT ml.subcategory_slug, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active' AND ml.subcategory_slug IS NOT NULL AND ml.subcategory_slug <> ''
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.subcategory_slug
  ) s;

  SELECT coalesce(jsonb_object_agg(business_type, c), '{}'::jsonb) INTO v_by_bt
  FROM (
    SELECT ml.business_type, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active' AND ml.business_type IS NOT NULL
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.business_type
  ) s;

  SELECT coalesce(jsonb_object_agg(department, c), '{}'::jsonb) INTO v_by_dept
  FROM (
    SELECT ml.department, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active' AND ml.department IS NOT NULL AND ml.department <> 'other'
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.department
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'by_category', v_by_cat,
    'by_subcategory', v_by_sub,
    'by_business_type', v_by_bt,
    'by_department', v_by_dept
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_facets(text, text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_facets(text, text, text, uuid, boolean) TO anon, authenticated;

-- ============================================================================
-- 5. Tag facets — namespaced attribute tags scoped to a department / group
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_marketplace_tag_facets(
  p_department text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(slug text, name text, kind text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ut.slug, ut.name, ut.category AS kind, count(*)::bigint AS count
  FROM public.unified_tag_assignments uta
  JOIN public.unified_tags ut ON ut.id = uta.tag_id
  JOIN public.marketplace_listings ml ON ml.id = uta.entity_id
  WHERE uta.entity_type = 'marketplace_listing'
    AND ut.category IN ('material','occasion','vibe')
    AND ut.status = 'active'
    AND ml.status = 'active'
    AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    AND (p_department IS NULL OR ml.department = p_department)
    AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
  GROUP BY ut.slug, ut.name, ut.category
  ORDER BY count(*) DESC
  LIMIT 40;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_tag_facets(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_tag_facets(text, text, boolean) TO anon, authenticated;
