-- The work-list timed out, which auto-paused the automation. Fix both.
--
-- `ORDER BY random()` has to materialise EVERY matching row before it can sort,
-- and the predicate is a regex over an array evaluated per row: 60,725 rows
-- scanned to return 60. Measured at ~1.15s through the management API, which is
-- why it looked fine — but the edge function goes through PostgREST, whose
-- statement_timeout is far tighter, and there it died with "canceling statement
-- due to statement timeout". Three of those in a row and the auto-pause net from
-- 20260523340000 disabled the registry row, exactly as designed.
--
-- The fix exploits something the previous version missed: `id` is a random uuid,
-- so ordering by the PRIMARY KEY is ALREADY a random order, and a contiguous
-- id-range is a uniform random sample. Anchoring at `gen_random_uuid()` and
-- walking the pk index forward gives the same statistical property as
-- `ORDER BY random()` while stopping as soon as it has enough rows — roughly
-- 1,700 rows scanned instead of 60,725. The second arm wraps around so an
-- anchor near the top of the keyspace still fills a batch.
--
-- Randomness is not cosmetic here: the dead/blocked discriminator only stamps a
-- 403 as "file gone" once the host has answered something in the SAME run, and
-- misterb's dead assets cluster by id. A contiguous slice from the low end is
-- all-dead, corroborates nothing, and stamps nothing.
CREATE OR REPLACE FUNCTION public.marketplace_image_upscale_worklist(
  p_limit integer DEFAULT 25,
  p_source_type text DEFAULT NULL
)
RETURNS TABLE (id uuid, source_type text, images text[], served_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH anchor AS (SELECT gen_random_uuid() AS a),
  eligible AS (
    (
      SELECT l.id
      FROM public.marketplace_listings l, anchor
      WHERE l.id >= anchor.a
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
      LIMIT GREATEST(1, LEAST(p_limit, 200))
    )
    UNION ALL
    (
      SELECT l.id
      FROM public.marketplace_listings l, anchor
      WHERE l.id < anchor.a
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
      LIMIT GREATEST(1, LEAST(p_limit, 200))
    )
  )
  SELECT l.id, l.source_type, l.images, ia.optimized_url
  FROM eligible e
  JOIN public.marketplace_listings l ON l.id = e.id
  LEFT JOIN public.image_asset_links k
    ON k.entity_type = 'marketplace_listing' AND k.entity_id = l.id AND k.sort_order = 0
  LEFT JOIN public.image_assets ia
    ON ia.id = k.asset_id AND ia.optimization_status IN ('optimized', 'cdn_optimized')
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) TO service_role;

-- Un-pause. The auto-pause was CORRECT — the job really was failing — so this
-- clears the counter only after the cause is fixed above, never as a way to
-- silence it.
UPDATE public.admin_automations
SET enabled = true,
    consecutive_failures = 0
WHERE slug = 'marketplace_image_upscale';
