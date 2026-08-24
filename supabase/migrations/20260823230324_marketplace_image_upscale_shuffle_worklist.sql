-- Shuffle the upscale work-list.
--
-- `ORDER BY id` returns a CONTIGUOUS slice, and contiguity is the problem: the
-- misterb head is a run of products whose original files are gone, so a whole
-- batch could 403 and the host would record zero successes. The dead/blocked
-- discriminator in marketplace-image-upscale needs at least one 200 from a host
-- before it will call that host's 403s "file missing" — otherwise it refuses to
-- judge, correctly, and nothing gets stamped. Result: the sweep re-measures the
-- same dead patch forever.
--
-- Random ordering mixes live and dead rows into every batch, so the host
-- corroborates itself and the dead rows get stamped and leave the queue. The
-- sort costs ~1.15s over the 2,181 candidate rows, which is nothing against a
-- run that spends two minutes on paced HTTP, and the filter forces a full scan
-- either way. Progress does not depend on the order — the stamp guarantees it.
CREATE OR REPLACE FUNCTION public.marketplace_image_upscale_worklist(
  p_limit integer DEFAULT 25,
  p_source_type text DEFAULT NULL
)
RETURNS TABLE (id uuid, source_type text, images text[], served_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT l.id,
         l.source_type,
         l.images,
         ia.optimized_url
  FROM public.marketplace_listings l
  LEFT JOIN public.image_asset_links k
    ON k.entity_type = 'marketplace_listing'
   AND k.entity_id = l.id
   AND k.sort_order = 0
  LEFT JOIN public.image_assets ia
    ON ia.id = k.asset_id
   AND ia.optimization_status IN ('optimized', 'cdn_optimized')
  WHERE l.status = 'active'
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
  ORDER BY random()
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) TO service_role;
