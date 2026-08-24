-- Attribute facets + server-side tag-filtered browse (finer-categorisation
-- program, PR 4).
--
-- (1) get_marketplace_attribute_facets — size/color/material/genre/fit counts
--     read from the LISTING COLUMNS (sizes/colors arrays + attributes jsonb),
--     not the tag junction: one table, partial-index-friendly, and it covers
--     the numeric sizes (eu-38, w32) that deliberately have no size-* tag.
--     mat-/occ-/vibe- stay on get_marketplace_tag_facets (no column mirror).
--
-- (2) marketplace_browse_page — the tag-filtered browse moves server-side.
--     The client used to resolve tag slugs → up to 5,000 entity ids and pass
--     them back through `.in('id', …)`; concept auto-tagging (occ-everyday
--     already has 2,644 assignments) pushes that id list past any sane URL
--     length. This RPC does AND-of-OR tag-group filtering + the full filter
--     matrix + sort + pagination in SQL and returns ONE PAGE of ids + the
--     total — the client then fetches ≤24 full rows by id.
--     Tag-group semantics: OR within a group, AND across groups
--     (size-m + size-l = either; size-m + color-black = both).

CREATE OR REPLACE FUNCTION public.get_marketplace_attribute_facets(
  p_department text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(kind text, slug text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH scoped AS (
    SELECT l.sizes, l.colors, l.attributes
    FROM public.marketplace_listings l
    WHERE l.status = 'active'
      AND (p_include_adult OR l.content_rating IN ('sfw','suggestive'))
      AND (p_department IS NULL OR l.department = p_department)
      AND (p_subcategory_group IS NULL OR l.subcategory_group = p_subcategory_group)
  )
  SELECT kind, slug, count(*)::bigint
  FROM (
    SELECT 'size' AS kind, unnest(s.sizes) AS slug FROM scoped s WHERE s.sizes IS NOT NULL
    UNION ALL
    SELECT 'color', unnest(s.colors) FROM scoped s WHERE s.colors IS NOT NULL
    UNION ALL
    SELECT 'material', jsonb_array_elements_text(s.attributes->'material') FROM scoped s WHERE jsonb_typeof(s.attributes->'material') = 'array'
    UNION ALL
    SELECT 'genre', jsonb_array_elements_text(s.attributes->'genre') FROM scoped s WHERE jsonb_typeof(s.attributes->'genre') = 'array'
    UNION ALL
    SELECT 'fit', jsonb_array_elements_text(s.attributes->'fit') FROM scoped s WHERE jsonb_typeof(s.attributes->'fit') = 'array'
  ) x
  GROUP BY kind, slug
  ORDER BY kind, count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_attribute_facets(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_attribute_facets(text, text, boolean) TO anon, authenticated;

-- p_filters keys (all optional): department, subcategory_group, subcategory_fine,
-- category, subcategory_slug, location, business_type, merchant_domain, brand_key,
-- price_min, price_max, community_owned (array), sizes (array), colors (array),
-- currency, in_stock (bool, default true), verified_days (int), include_adult (bool).
-- Sort vocabulary mirrors useMarketplace.tsx exactly (featured always pins first).
CREATE OR REPLACE FUNCTION public.marketplace_browse_page(
  p_tag_groups jsonb DEFAULT '[]'::jsonb,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort text DEFAULT 'boutique',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 24)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH groups AS (
    SELECT ord, array_agg(slug) AS slugs
    FROM jsonb_array_elements(coalesce(p_tag_groups, '[]'::jsonb)) WITH ORDINALITY AS g(grp, ord),
         jsonb_array_elements_text(g.grp) AS slug
    GROUP BY ord
  ),
  tagged AS (
    SELECT a.entity_id
    FROM groups g
    JOIN public.unified_tags t ON t.slug = ANY (g.slugs) AND t.status = 'active'
    JOIN public.unified_tag_assignments a
      ON a.tag_id = t.id AND a.entity_type = 'marketplace_listing'
    GROUP BY a.entity_id
    HAVING count(DISTINCT g.ord) = (SELECT count(*) FROM groups)
  ),
  base AS (
    SELECT l.id, l.featured, l.price_usd, l.created_at, l.updated_at,
           l.quality_score, l.views_count, l.lgbti_relevance_score, l.boutique_score
    FROM public.marketplace_listings l
    WHERE l.status = 'active'
      AND ((SELECT count(*) FROM groups) = 0 OR l.id IN (SELECT entity_id FROM tagged))
      AND (p_filters->>'department' IS NULL OR l.department = p_filters->>'department')
      AND (p_filters->>'subcategory_group' IS NULL OR l.subcategory_group = p_filters->>'subcategory_group')
      AND (p_filters->>'subcategory_fine' IS NULL OR l.subcategory_fine = p_filters->>'subcategory_fine')
      AND (p_filters->>'category' IS NULL OR l.category = p_filters->>'category')
      AND (p_filters->>'subcategory_slug' IS NULL OR l.subcategory_slug = p_filters->>'subcategory_slug')
      AND (p_filters->>'location' IS NULL OR l.location ILIKE '%' || (p_filters->>'location') || '%')
      AND (p_filters->>'business_type' IS NULL OR l.business_type = p_filters->>'business_type')
      AND (p_filters->>'merchant_domain' IS NULL OR l.merchant_domain = p_filters->>'merchant_domain')
      AND (p_filters->>'brand_key' IS NULL OR l.brand_key = p_filters->>'brand_key')
      AND ((p_filters->>'price_min') IS NULL OR l.price >= (p_filters->>'price_min')::numeric)
      AND ((p_filters->>'price_max') IS NULL OR l.price <= (p_filters->>'price_max')::numeric)
      AND (jsonb_typeof(p_filters->'community_owned') IS DISTINCT FROM 'array'
           OR l.community_owned_tags && (SELECT coalesce(array_agg(x), '{}') FROM jsonb_array_elements_text(p_filters->'community_owned') AS t(x)))
      AND (jsonb_typeof(p_filters->'sizes') IS DISTINCT FROM 'array'
           OR l.sizes && (SELECT coalesce(array_agg(x), '{}') FROM jsonb_array_elements_text(p_filters->'sizes') AS t(x)))
      AND (jsonb_typeof(p_filters->'colors') IS DISTINCT FROM 'array'
           OR l.colors && (SELECT coalesce(array_agg(x), '{}') FROM jsonb_array_elements_text(p_filters->'colors') AS t(x)))
      AND (p_filters->>'currency' IS NULL OR l.currency = p_filters->>'currency')
      AND (coalesce((p_filters->>'in_stock')::boolean, true) IS NOT TRUE
           OR l.availability IS NULL OR l.availability <> 'out_of_stock')
      AND ((p_filters->>'verified_days') IS NULL
           OR l.last_verified_at >= now() - ((p_filters->>'verified_days') || ' days')::interval)
      AND (coalesce((p_filters->>'include_adult')::boolean, false) OR l.content_rating IN ('sfw','suggestive'))
  )
  SELECT b.id, count(*) OVER () AS total_count
  FROM base b
  ORDER BY
    b.featured DESC NULLS LAST,
    CASE WHEN p_sort = 'price_asc'  THEN b.price_usd END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN b.price_usd END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest'     THEN b.created_at END DESC,
    CASE WHEN p_sort IN ('editor_choice','best_value') THEN b.quality_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'editor_choice' THEN b.updated_at END DESC,
    CASE WHEN p_sort = 'best_value' THEN b.price_usd END ASC NULLS LAST,
    CASE WHEN p_sort IN ('most_loved','for_you') THEN b.views_count END DESC NULLS LAST,
    CASE WHEN p_sort IN ('most_loved','for_you') THEN b.quality_score END DESC NULLS LAST,
    CASE WHEN p_sort IN ('most_loved','for_you') THEN b.lgbti_relevance_score END DESC NULLS LAST,
    b.boutique_score DESC NULLS LAST,
    b.id
  LIMIT LEAST(GREATEST(p_page_size, 1), 48)
  OFFSET GREATEST(p_page, 0) * LEAST(GREATEST(p_page_size, 1), 48);
$$;
REVOKE ALL ON FUNCTION public.marketplace_browse_page(jsonb, jsonb, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_browse_page(jsonb, jsonb, text, integer, integer) TO anon, authenticated;
