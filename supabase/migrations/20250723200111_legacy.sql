-- Add Foursquare-specific columns to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS foursquare_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS foursquare_rating DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS foursquare_data JSONB DEFAULT '{}'::jsonb;

-- Create index for Foursquare ID lookups
CREATE INDEX IF NOT EXISTS idx_venues_foursquare_id ON public.venues(foursquare_id) WHERE foursquare_id IS NOT NULL;