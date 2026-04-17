-- Add services column to venues table
ALTER TABLE public.venues 
ADD COLUMN services TEXT[];

-- Add an index for better performance when filtering by services
CREATE INDEX idx_venues_services ON public.venues USING GIN(services);