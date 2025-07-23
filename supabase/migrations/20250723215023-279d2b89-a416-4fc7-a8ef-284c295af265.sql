-- Add TomTom specific fields to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS tomtom_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS tomtom_rating DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS tomtom_data JSONB DEFAULT '{}'::jsonb;

-- Create index for TomTom ID lookups
CREATE INDEX IF NOT EXISTS idx_venues_tomtom_id ON public.venues(tomtom_id) WHERE tomtom_id IS NOT NULL;