-- Add edition column to events table
-- Stores the edition/iteration of recurring events (e.g. "5th", "2026", "Vol. 3")
-- Requested via community feedback for better data matching
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS edition TEXT;
