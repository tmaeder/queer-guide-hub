-- Give the planner a CONSTANT anchor. This is the whole fix.
--
-- The work-list timed out under PostgREST ("canceling statement due to statement
-- timeout"), and three failures in a row tripped the auto-pause net, disabling
-- the automation. Two separate mistakes got it there:
--
-- 1. `ORDER BY random()` has to materialise EVERY matching row before it sorts,
--    and the predicate is a regex over an array evaluated per row: 60,725 rows
--    scanned to return 60. It measured ~1.15s through the management API, which
--    is why it looked fine — the edge function goes through PostgREST, whose
--    statement_timeout is far tighter.
-- 2. Replacing it with a random ANCHOR into the primary-key index was right, but
--    computing that anchor in a CTE is not: a CTE value is not a constant the
--    planner can push into an index condition, so it still scanned. 3.2s.
--
-- Computing the anchor into a plpgsql variable gives the planner `id >= <const>`.
-- Measured: index scan on the pk, 1,472 rows examined, stops at 60 — 59ms for
-- the raw query, 89ms through the function. 3.2s -> 89ms with no change to
-- meaning.
--
-- Why an anchor rather than an ordered scan: `id` is a random uuid, so ordering
-- by the primary key IS a random order and a contiguous id-range is a uniform
-- random sample. That property is load-bearing, not cosmetic — the dead/blocked
-- discriminator only stamps a 403 as "file gone" once the host has answered
-- something in the SAME run, and misterb's dead assets cluster by id, so a slice
-- from the low end is all-dead, corroborates nothing and stamps nothing. The
-- second UNION arm wraps around so an anchor near the top still fills a batch.
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

-- Un-pause. The auto-pause was CORRECT — the job really was failing — so this
-- clears the counter only after the cause above is fixed, never as a way to
-- silence it.
UPDATE public.admin_automations
SET enabled = true, consecutive_failures = 0
WHERE slug = 'marketplace_image_upscale';
