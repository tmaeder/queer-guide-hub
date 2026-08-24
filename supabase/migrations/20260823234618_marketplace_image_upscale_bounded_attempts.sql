-- Bound the retries, or the sweep never terminates.
--
-- The dead/blocked discriminator refuses to stamp a 403 unless the host answered
-- something in the SAME run. That is the right instinct — recording a block as
-- "no better copy exists" writes a merchant off permanently — but as the only
-- rule it does not terminate here: roughly 99% of misterb's originals are
-- deleted, so a 60-listing batch usually contains no live file at all, nothing
-- corroborates, nothing is stamped, and the next run draws from the same 2,150.
-- Measured: a clean successful run with 134 misterb requests, 0 successes, 0
-- stamped, `remaining` unmoved.
--
-- So: keep refusing to judge on ONE failure, but count the failures. Three
-- unmeasurable visits and the row is written off as data_unavailable. This is
-- the same terminal-sentinel-after-3-attempts shape the city-fields backfill
-- uses, for the same reason — an exhausted row has to leave the pool or it
-- starves everything behind it.
--
-- `resolved_at` (set by marketplace_stamp_image_upscale) and `attempts >= 3` are
-- different states on purpose: the first means we looked and judged, the second
-- means we could not look, three times. Only the first is evidence about the
-- image.
CREATE OR REPLACE FUNCTION public.marketplace_note_image_upscale_attempt(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH upd AS (
    UPDATE public.marketplace_listings l
    SET attributes = COALESCE(l.attributes, '{}'::jsonb) || jsonb_build_object(
      'image_upscale',
      COALESCE(l.attributes->'image_upscale', '{}'::jsonb) || jsonb_build_object(
        'attempts', COALESCE((l.attributes->'image_upscale'->>'attempts')::int, 0) + 1,
        'last_attempt_at', now()
      )
    )
    WHERE l.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM upd;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) TO service_role;

-- The terminal stamp now records that we actually JUDGED the row, distinct from
-- merely having visited it.
CREATE OR REPLACE FUNCTION public.marketplace_stamp_image_upscale(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH upd AS (
    UPDATE public.marketplace_listings l
    SET attributes = COALESCE(l.attributes, '{}'::jsonb) || jsonb_build_object(
      'image_upscale',
      COALESCE(l.attributes->'image_upscale', '{}'::jsonb) || jsonb_build_object(
        'attempted_at', now(),
        'resolved_at', now()
      )
    )
    WHERE l.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM upd;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) TO service_role;

-- Work-list drops both terminal states.
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
        AND NOT (l.attributes->'image_upscale' ? 'resolved_at')
        AND COALESCE((l.attributes->'image_upscale'->>'attempts')::int, 0) < 3
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
        AND NOT (l.attributes->'image_upscale' ? 'resolved_at')
        AND COALESCE((l.attributes->'image_upscale'->>'attempts')::int, 0) < 3
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

-- Rows stamped before this migration used the bare `attempted_at` key with no
-- `resolved_at`. They WERE judged, so carry them over rather than making them
-- eligible again.
UPDATE public.marketplace_listings
SET attributes = attributes || jsonb_build_object(
  'image_upscale', (attributes->'image_upscale') || jsonb_build_object('resolved_at', attributes->'image_upscale'->>'attempted_at')
)
WHERE attributes->'image_upscale' ? 'attempted_at'
  AND NOT (attributes->'image_upscale' ? 'resolved_at');
