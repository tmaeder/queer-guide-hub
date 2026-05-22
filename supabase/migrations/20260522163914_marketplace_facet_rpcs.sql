-- Marketplace facet RPCs + canonical subcategory slug
--
-- Background: listing counts on the marketplace landing tiles, category
-- pages, and filter dropdown disagreed because every count was computed
-- by `SELECT subcategory, ... LIMIT 10000` from the client, then JS-
-- aggregated. Supabase's `db.max_rows = 1000` server cap silently
-- truncated the result, so the "Products (1000)" facet count was the
-- limit, not the real count. Tiles also linked to /marketplace/category/
-- <raw subcategory> while the category page did `.eq('subcategory', slug)`,
-- failing when the stored subcategory had whitespace or different casing.
--
-- This migration:
--   1. Adds a STORED generated column `subcategory_slug` that canonicalises
--      `subcategory` to lower-snake-case. Indexed. Stable, deterministic.
--   2. Adds three SECURITY DEFINER RPCs that aggregate counts server-side
--      with no row cap. Granted to anon + authenticated (counts are public
--      info — listings already have FOR SELECT USING (true) RLS).

-- 1. Canonical slug column + index ----------------------------------

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS subcategory_slug text
  GENERATED ALWAYS AS (
    lower(regexp_replace(coalesce(subcategory, ''), '[\s\-]+', '_', 'g'))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_subcategory_slug
  ON public.marketplace_listings (subcategory_slug)
  WHERE status = 'active';

-- 2. Tile counts ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_marketplace_subcategory_counts()
RETURNS TABLE(slug text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT subcategory_slug AS slug, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_slug IS NOT NULL
    AND subcategory_slug <> ''
  GROUP BY subcategory_slug
  HAVING count(*) >= 5
  ORDER BY count(*) DESC
  LIMIT 16;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_subcategory_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_subcategory_counts() TO anon, authenticated;

-- 3. Category-page count by slug -----------------------------------

CREATE OR REPLACE FUNCTION public.count_marketplace_subcategory(p_slug text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_slug = lower(regexp_replace(coalesce(p_slug, ''), '[\s\-]+', '_', 'g'));
$$;

REVOKE ALL ON FUNCTION public.count_marketplace_subcategory(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_marketplace_subcategory(text) TO anon, authenticated;

-- 4. Filter-dropdown facets ----------------------------------------
--
-- Returns total + per-dimension counts. Critical invariant: when
-- computing the bucket for dimension X, we DO NOT apply the filter for
-- X itself — so the Type dropdown shows true Products/Services totals
-- even after the user has selected one. Otherwise "Products (998)"
-- collapses to "Products (998-of-998)" the moment it's selected.

CREATE OR REPLACE FUNCTION public.get_marketplace_facets(
  p_category text DEFAULT NULL,
  p_subcategory text DEFAULT NULL,
  p_business_type text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_slug text := lower(regexp_replace(coalesce(p_subcategory, ''), '[\s\-]+', '_', 'g'));
  v_total bigint;
  v_by_cat jsonb;
  v_by_sub jsonb;
  v_by_bt jsonb;
BEGIN
  -- Total with all filters applied.
  SELECT count(*) INTO v_total
  FROM public.marketplace_listings ml
  WHERE ml.status = 'active'
    AND (p_category IS NULL OR ml.category = p_category)
    AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
    AND (p_business_type IS NULL OR ml.business_type = p_business_type)
    AND (p_category_id IS NULL OR ml.category_id = p_category_id);

  -- by_category — exclude the category filter from its own bucket.
  SELECT coalesce(jsonb_object_agg(category, c), '{}'::jsonb) INTO v_by_cat
  FROM (
    SELECT ml.category, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active'
      AND ml.category IS NOT NULL
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.category
  ) s;

  -- by_subcategory — exclude the subcategory filter from its own bucket.
  SELECT coalesce(jsonb_object_agg(subcategory_slug, c), '{}'::jsonb) INTO v_by_sub
  FROM (
    SELECT ml.subcategory_slug, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active'
      AND ml.subcategory_slug IS NOT NULL
      AND ml.subcategory_slug <> ''
      AND (p_category IS NULL OR ml.category = p_category)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.subcategory_slug
  ) s;

  -- by_business_type — exclude the business_type filter from its own bucket.
  SELECT coalesce(jsonb_object_agg(business_type, c), '{}'::jsonb) INTO v_by_bt
  FROM (
    SELECT ml.business_type, count(*)::bigint AS c
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active'
      AND ml.business_type IS NOT NULL
      AND (p_category IS NULL OR ml.category = p_category)
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.business_type
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'by_category', v_by_cat,
    'by_subcategory', v_by_sub,
    'by_business_type', v_by_bt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_facets(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_facets(text, text, text, uuid) TO anon, authenticated;
