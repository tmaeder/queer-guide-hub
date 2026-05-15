-- The auto_optimize_image_asset BEFORE INSERT trigger marked any URL with
-- '%cdn.%', '%img.%', '%static.%', etc as 'cdn_optimized' — meaning the
-- image-ingest worker skipped mirroring it because the source was assumed
-- reliable. That assumption breaks hard for publisher CDNs (b-cdn.net,
-- guim.co.uk, etc.) that return 401/404/hotlink-block, so 350+ marked
-- images stayed as broken hotlinks on the public site.
--
-- Tighten the trigger to a narrow allowlist of CDNs we trust on the
-- public web. Everything else stays 'pending' so the worker mirrors it.

CREATE OR REPLACE FUNCTION public.auto_optimize_image_asset()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Hosts we control (Supabase Storage, our R2 CDN, our own domain):
  -- already authoritative, no mirroring needed.
  IF NEW.url ILIKE '%xqeacpakadqfxjxjcewc.supabase.co%'
     OR NEW.url ILIKE '%img.queer.guide%'
     OR NEW.url ILIKE '%queer.guide/images/%'
  THEN
    NEW.optimization_status := 'optimized';
    NEW.optimized_at := now();
    NEW.optimized_url := NEW.url;
  -- Stock photo libraries + Wikipedia: stable, no hotlink protection,
  -- explicit public-CDN policy. Worth trusting.
  ELSIF NEW.url ILIKE '%images.unsplash.com%'
     OR NEW.url ILIKE '%images.pexels.com%'
     OR NEW.url ILIKE '%upload.wikimedia.org%'
     OR NEW.url ILIKE '%res.cloudinary.com%'
  THEN
    NEW.optimization_status := 'cdn_optimized';
    NEW.optimized_at := now();
  END IF;
  -- Everything else stays 'pending' (the column default) so the
  -- image-ingest worker mirrors it into R2.
  RETURN NEW;
END;
$$;

-- One-shot: reset existing cdn_optimized rows whose URLs aren't on the
-- narrow allowlist so the image-ingest cron mirrors them into R2.
UPDATE public.image_assets
SET optimization_status = 'pending',
    optimized_at = NULL,
    optimized_url = NULL,
    thumbnail_url = NULL
WHERE optimization_status = 'cdn_optimized'
  AND NOT (
    url ILIKE '%images.unsplash.com%'
    OR url ILIKE '%images.pexels.com%'
    OR url ILIKE '%upload.wikimedia.org%'
    OR url ILIKE '%res.cloudinary.com%'
    OR url ILIKE '%xqeacpakadqfxjxjcewc.supabase.co%'
    OR url ILIKE '%img.queer.guide%'
  );
