-- Add closed_at to track permanently closed venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Fix broken index referencing non-existent is_active column on venues
DROP INDEX IF EXISTS idx_venues_status;
CREATE INDEX IF NOT EXISTS idx_venues_open ON public.venues (created_at DESC) WHERE closed_at IS NULL;
