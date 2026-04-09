-- Add logo_url and logo_fetched_at columns to venues table
-- (events already has these columns)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_fetched_at TIMESTAMPTZ;
