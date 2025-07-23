-- Add TripAdvisor specific fields to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS tripadvisor_id text,
ADD COLUMN IF NOT EXISTS tripadvisor_rating numeric(3,2),
ADD COLUMN IF NOT EXISTS tripadvisor_review_count integer;

-- Create index for TripAdvisor ID for better performance
CREATE INDEX IF NOT EXISTS idx_venues_tripadvisor_id ON public.venues(tripadvisor_id) WHERE tripadvisor_id IS NOT NULL;