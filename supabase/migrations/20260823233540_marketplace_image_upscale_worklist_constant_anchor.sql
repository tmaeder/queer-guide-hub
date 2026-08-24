-- Give the planner a CONSTANT anchor. This is the whole fix.
--
-- The previous version computed the random anchor in a CTE, and a CTE value is
-- not a constant the planner can push into an index condition — so it fell back
-- to scanning and the function took 3.2s, still slow enough to be a risk under
-- PostgREST's tighter statement_timeout. Measured with a literal uuid the exact
-- same predicate runs in 59ms: index scan on the primary key, 1,472 rows
-- examined, stops at 60. So compute the anchor into a plpgsql variable first and
-- the shape the planner sees is `id >= <constant>`.
--
-- 3.2s -> 59ms, ~55x, with no change to what the query means.
CREATE OR REPLACE FUNCTION public.marketplace_image_upscale_worklist(
  p_limit integer DEFAULT 25,
  p_source_type text DEFAULT NULL
)
RETURNS TABLE (id uuid, source_type text, images text[], served_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_anchor uuid := gen_random_uuid();
  v_limit integer := GREATEST(1, LEAST(p_limit, 200));
BEGIN
  RETURN QUERY
  WITH eligible AS (
    (
      SELECT l.id AS lid
      FROM public.marketplace_listings l
      WHERE l.id >= v_anchor
        AND l.status = 'active'
        AND l.images IS NOT NULL
        AND cardinality(l.images) > 0
        AND NOT (l.attributes ? 'image_upscale')
        AND (p_source_type IS NULL OR l.source_type = p_source_type)
        AND EXISTS (
          SELECT 1 FROM unnest(l.images) im
          WHERE im ~ '/media/catalog/product/cache/[0-9a-f]{16,}/'
             OR im ~ '/image/cache/.+-\d{2,4}x\d{2,4}\.'
             OR im ~ '/wp-content/uploads/.+-\d{2,4}x\d{2,4}\.'
             OR (im ~ '[?&]width=' AND (im LIKE '%cdn.shopify.com%' OR im LIKE '%/cdn/shop/%'))
             OR (im ~ '[?&](w|h|imwidth|sw|maxwidth)=' AND im NOT LIKE '%cdn.shopify.com%')
        )
      ORDER BY l.id
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT l.id AS lid
      FROM public.marketplace_listings l
      WHERE l.id < v_anchor
        AND l.status = 'active'
        AND l.images IS NOT NULL
        AND cardinality(l.images) > 0
        AND NOT (l.attributes ? 'image_upscale')
        AND (p_source_type IS NULL OR l.source_type = p_source_type)
        AND EXISTS (
          SELECT 1 FROM unnest(l.images) im
          WHERE im ~ '/media/catalog/product/cache/[0-9a-f]{16,}/'
             OR im ~ '/image/cache/.+-\d{2,4}x\d{2,4}\.'
             OR im ~ '/wp-content/uploads/.+-\d{2,4}x\d{2,4}\.'
             OR (im ~ '[?&]width=' AND (im LIKE '%cdn.shopify.com%' OR im LIKE '%/cdn/shop/%'))
             OR (im ~ '[?&](w|h|imwidth|sw|maxwidth)=' AND im NOT LIKE '%cdn.shopify.com%')
        )
      ORDER BY l.id
      LIMIT v_limit
    )
  )
  SELECT l.id, l.source_type, l.images, ia.optimized_url
  FROM eligible e
  JOIN public.marketplace_listings l ON l.id = e.lid
  LEFT JOIN public.image_asset_links k
    ON k.entity_type = 'marketplace_listing' AND k.entity_id = l.id AND k.sort_order = 0
  LEFT JOIN public.image_assets ia
    ON ia.id = k.asset_id AND ia.optimization_status IN ('optimized', 'cdn_optimized')
  LIMIT v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) TO service_role;

UPDATE public.admin_automations
SET enabled = true, consecutive_failures = 0
WHERE slug = 'marketplace_image_upscale';
