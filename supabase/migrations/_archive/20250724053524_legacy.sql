-- Add data source tracking to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS data_source text,
ADD COLUMN IF NOT EXISTS external_id text,
ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'manual';

-- Create index for faster lookups during re-import
CREATE INDEX IF NOT EXISTS idx_venues_external_id ON public.venues(data_source, external_id);
CREATE INDEX IF NOT EXISTS idx_venues_last_synced ON public.venues(last_synced_at);

-- Add comments for clarity
COMMENT ON COLUMN public.venues.data_source IS 'Source of venue data: foursquare, tripadvisor, tomtom, or manual';
COMMENT ON COLUMN public.venues.external_id IS 'ID from the external data source';
COMMENT ON COLUMN public.venues.last_synced_at IS 'Last time venue was synced with external source';
COMMENT ON COLUMN public.venues.sync_status IS 'Status of last sync: manual, synced, error';