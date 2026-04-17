-- Add venue_id to marketplace_listings to link products/services to venues
ALTER TABLE public.marketplace_listings 
ADD COLUMN venue_id uuid REFERENCES public.venues(id);

-- Add index for better performance when querying by venue
CREATE INDEX idx_marketplace_listings_venue_id ON public.marketplace_listings(venue_id);

-- Add RLS policy for venue-based access
CREATE POLICY "Users can view listings for public venues" 
ON public.marketplace_listings 
FOR SELECT 
USING (venue_id IS NULL OR EXISTS (
  SELECT 1 FROM public.venues 
  WHERE venues.id = marketplace_listings.venue_id
));