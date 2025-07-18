-- Add image columns to cities table
ALTER TABLE public.cities 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_metadata JSONB DEFAULT '{}'::jsonb;

-- Create storage bucket for city images
INSERT INTO storage.buckets (id, name, public)
VALUES ('city-images', 'city-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for city images
CREATE POLICY "City images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'city-images');

CREATE POLICY "Service role can upload city images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'city-images');

CREATE POLICY "Service role can update city images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'city-images');

-- Add index for better performance when querying cities with images
CREATE INDEX IF NOT EXISTS idx_cities_image_url ON public.cities(image_url) WHERE image_url IS NOT NULL;