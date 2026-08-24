-- Recovers `marketplace-image-upscale` into version control.
--
-- Found during a cost/efficiency audit (2026-08-24): the edge function, its four
-- backing RPCs, and the admin_automations registry row all existed live and had
-- been running correctly every 5 minutes for days (version 5 of the function,
-- 0 consecutive_failures) but were never committed anywhere in this repo. They
-- were applied directly against the project (edge function deploy + raw SQL),
-- which -- per this repo's own migration-history rule -- leaves the deployed
-- state undocumented, unreviewable, and one accidental redeploy away from being
-- silently lost. This migration is a byte-for-byte capture of the four live
-- function definitions and the live registry row so `db push` matches what is
-- actually running; the edge function source was recovered into
-- supabase/functions/marketplace-image-upscale/index.ts and
-- supabase/functions/_shared/image-upscale.ts in the same PR.
--
-- ── 1. Work-list selector ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_image_upscale_worklist(p_limit integer DEFAULT 25, p_source_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, source_type text, images text[], served_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        AND NOT COALESCE(l.attributes->'image_upscale' ? 'resolved_at', false)
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
        AND NOT COALESCE(l.attributes->'image_upscale' ? 'resolved_at', false)
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
$function$;
REVOKE ALL ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) TO service_role;

-- ── 2. Stamp / attempt / cover-asset writers ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_stamp_image_upscale(p_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_note_image_upscale_attempt(p_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_set_cover_asset(p_listing_id uuid, p_url text, p_optimized_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_asset_id uuid;
  v_hash text := encode(digest(p_url, 'sha256'), 'hex');
BEGIN
  INSERT INTO public.image_assets (url_hash, url, source, status, optimization_status, optimized_url, optimized_at, last_seen_at)
  VALUES (
    v_hash, p_url, 'scraper', 'active',
    CASE WHEN p_optimized_url IS NULL THEN 'pending' ELSE 'optimized' END,
    p_optimized_url,
    CASE WHEN p_optimized_url IS NULL THEN NULL ELSE now() END,
    now()
  )
  ON CONFLICT (url_hash) DO UPDATE
    SET last_seen_at = now(),
        optimized_url = COALESCE(EXCLUDED.optimized_url, public.image_assets.optimized_url),
        optimization_status = CASE
          WHEN EXCLUDED.optimized_url IS NOT NULL THEN 'optimized'
          ELSE public.image_assets.optimization_status
        END,
        optimized_at = CASE
          WHEN EXCLUDED.optimized_url IS NOT NULL THEN now()
          ELSE public.image_assets.optimized_at
        END
  RETURNING id INTO v_asset_id;

  DELETE FROM public.image_asset_links
  WHERE entity_type = 'marketplace_listing'
    AND entity_id = p_listing_id
    AND sort_order = 0
    AND asset_id IS DISTINCT FROM v_asset_id;

  INSERT INTO public.image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
  VALUES (v_asset_id, 'marketplace_listing', p_listing_id, 'cover', 0)
  ON CONFLICT (asset_id, entity_type, entity_id, role) DO UPDATE SET sort_order = 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.marketplace_set_cover_asset(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_set_cover_asset(uuid, text, text) TO service_role;

-- ── 3. Registry row (canonical, RAW command -- sync_automations_to_cron()
--       derives the run-tracking wrapper; do NOT pre-wrap, see 20260910163700) ─
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'marketplace_image_upscale',
  'Upscale marketplace product images',
  'Every 5 min: replaces storefront thumbnail URLs (Magento/OpenCart cache paths, WordPress size suffixes, query resizers) with the merchant''s original and mirrors it to R2, so a rate-limited shop cannot be hot-linked by a page of cards. Paced 2.5s per host and capped at 110s per run because misterb 403s above roughly ten quick requests. Resumable: examined listings are stamped attributes.image_upscale, blocked ones deliberately are not. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','marketplace-image-upscale','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-upscale',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":60,"host_gap_ms":500,"max_ms":110000}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  '*/5 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('marketplace-image-upscale');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'marketplace_image_upscale';
