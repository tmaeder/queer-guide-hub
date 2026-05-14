-- Add thumbnail_url for R2-served thumbnails
ALTER TABLE public.image_assets ADD COLUMN IF NOT EXISTS thumbnail_url text;
