-- Marketplace "Browse by department" — content-rating-gated count/facet RPCs
--
-- Companion to 20260704102951_marketplace_browse_taxonomy_functions.sql (the
-- marketplace_department()/marketplace_subcategory_group() token classifier)
-- and 20260704103309_marketplace_regen_department_add_group.sql (the STORED
-- department/subcategory_group columns) — both already applied. This
-- migration adds the RPCs that read those columns.
--
-- Root cause fixed: count RPCs previously counted ALL active listings while
-- the browse grid (useMarketplace.tsx, SFW_RATINGS) defaults to
-- content_rating IN ('sfw','suggestive') until an 18+ opt-in. 100%-adult
-- umbrellas (intimacy, bdsm_fetish) showed a real tile count but an empty
-- grid. Every count RPC below takes p_include_adult and gates on
-- content_rating exactly like the grid, so counts always match results.

-- Drop the pre-p_include_adult overloads first: adding a defaulted param
-- would otherwise leave two candidates and make PostgREST calls ambiguous.
DROP FUNCTION IF EXISTS public.get_marketplace_subcategory_counts();
DROP FUNCTION IF EXISTS public.count_marketplace_subcategory(text);
DROP FUNCTION IF EXISTS public.get_marketplace_facets(text, text, text, uuid);

-- Per-subcategory-slug counts (all-categories page). Gated + uncapped (was
-- LIMIT 16, which under-counted departments once the long tail folds in).
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
    'total', v_total, 'by_category', v_by_cat, 'by_subcategory', v_by_sub,
    'by_business_type', v_by_bt, 'by_department', v_by_dept);
END;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_facets(text, text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_facets(text, text, text, uuid, boolean) TO anon, authenticated;

-- Tag facets — namespaced attribute tags (mat-/occ-/vibe-) scoped to a
-- department / fine group, content-rating gated.
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
