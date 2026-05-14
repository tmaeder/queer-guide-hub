-- Add optimization tracking to image_assets
-- Allows tracking which images have been mirrored to our own storage
-- and which are served from reliable external CDNs.

ALTER TABLE public.image_assets
  ADD COLUMN IF NOT EXISTS optimization_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS optimized_url text,
  ADD COLUMN IF NOT EXISTS optimized_at timestamptz;

ALTER TABLE public.image_assets
  ADD CONSTRAINT image_assets_optimization_status_check
  CHECK (optimization_status IN ('pending', 'processing', 'optimized', 'cdn_optimized', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_image_assets_optimization_status
  ON public.image_assets (optimization_status);

INSERT INTO storage.buckets (id, name, public)
VALUES ('optimized-images', 'optimized-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "Public read optimized images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'optimized-images');

CREATE POLICY IF NOT EXISTS "Service upload optimized images"
  ON storage.objects FOR INSERT
  TO service_role
  USING (bucket_id = 'optimized-images')
  WITH CHECK (bucket_id = 'optimized-images');
