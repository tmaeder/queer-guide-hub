-- Offline mutation queue support: updated_at on the two tables whose rows
-- can be edited offline (packing checks, place notes/reorder). Client-set on
-- replay — deliberately NO trigger (avoids write amplification; these tables
-- see bursty updates during drag reorders).
ALTER TABLE public.trip_places
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.trip_packing_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
