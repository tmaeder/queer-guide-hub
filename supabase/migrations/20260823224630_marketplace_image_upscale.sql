-- Marketplace image upscale — server-side, paced, resumable.
--
-- Finishes the job `scripts/data-quality/upgrade-marketplace-images.mjs` started.
-- That script cleared mrsleather (983 listings, 135x135 -> 400x500),
-- invinciblerubber and pnpplzine, then stalled on misterb: that shop rate-limits
-- per IP, answering 200 at low volume and 403 after roughly ten requests, and a
-- developer machine that has been probing all session stays blocked for a long
-- window. 2,194 listings cannot be swept from one desk. A paced cron running
-- from Supabase's egress finishes it unattended and resumes automatically.
--
-- Three helpers, because the edge function must not embed SQL it cannot test:
--   marketplace_image_upscale_worklist  — what is left to do, with the baseline
--   marketplace_set_cover_asset         — repoint the cover at the new image
--   marketplace_stamp_image_upscale     — terminal sentinel

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
  ORDER BY l.id
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_image_upscale_worklist(integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_set_cover_asset(
  p_listing_id uuid,
  p_url text,
  p_optimized_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_set_cover_asset(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_set_cover_asset(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_stamp_image_upscale(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH upd AS (
    UPDATE public.marketplace_listings
    SET attributes = COALESCE(attributes, '{}'::jsonb)
      || jsonb_build_object('image_upscale', jsonb_build_object('attempted_at', now()))
    WHERE id = ANY(p_ids)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM upd;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'marketplace_image_upscale',
  'Upscale marketplace product images',
  'Every 5 min: replaces storefront thumbnail URLs (Magento/OpenCart cache paths, WordPress size suffixes, query resizers) with the merchant''s original and mirrors it to R2, so a rate-limited shop cannot be hot-linked by a page of cards. Paced 2.5s per host and capped at 110s per run because misterb 403s above roughly ten quick requests. Resumable: examined listings are stamped attributes.image_upscale, blocked ones deliberately are not. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','marketplace-image-upscale','command',
$cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-upscale',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":40,"host_gap_ms":2500,"max_ms":110000}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$),
  '*/5 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $do$
BEGIN
  BEGIN
    PERFORM cron.unschedule('marketplace-image-upscale');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $do$;

SELECT cron.schedule(
  a.action->>'jobname',
  a.schedule,
  public.admin_automation_effective_command(a.slug, a.action->>'command')
)
FROM public.admin_automations a
WHERE a.slug = 'marketplace_image_upscale';
