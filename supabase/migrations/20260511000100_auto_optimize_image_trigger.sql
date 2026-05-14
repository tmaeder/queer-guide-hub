-- Auto-classify image optimization status on INSERT.
-- CDN-hosted images are marked immediately; others stay 'pending'
-- for batch processing by optimize-images-batch.

CREATE OR REPLACE FUNCTION public.auto_optimize_image_asset()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.url ILIKE '%supabase%' THEN
    NEW.optimization_status := 'optimized';
    NEW.optimized_at := now();
  ELSIF NEW.url ILIKE '%res.cloudinary.com%'
     OR NEW.url ILIKE '%upload.wikimedia.org%'
     OR NEW.url ILIKE '%images.pexels.com%'
     OR NEW.url ILIKE '%images.unsplash.com%'
     OR NEW.url ILIKE '%fastly.4sqi.net%'
     OR NEW.url ILIKE '%i0.wp.com%'
     OR NEW.url ILIKE '%googleusercontent.com%'
     OR NEW.url ILIKE '%cloudfront.net%'
     OR NEW.url ILIKE '%akamaized.net%'
     OR NEW.url ILIKE '%cdn.%'
     OR NEW.url ILIKE '%static.%'
     OR NEW.url ILIKE '%media.%'
     OR NEW.url ILIKE '%assets.%'
     OR NEW.url ILIKE '%img.%'
     OR NEW.url ILIKE '%images.%'
  THEN
    NEW.optimization_status := 'cdn_optimized';
    NEW.optimized_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_optimize_image_asset ON public.image_assets;
CREATE TRIGGER trg_auto_optimize_image_asset
  BEFORE INSERT ON public.image_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_optimize_image_asset();
