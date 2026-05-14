-- Add death_place column to personalities (free text city/location)
ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS death_place text;

COMMENT ON COLUMN public.personalities.death_place IS
  'Place of death (free text city/location). Only meaningful when death_date is set.';
