-- Day notes + route legs support on trip_places.
-- icon: lucide icon slug for category='note' rows (curated picker client-side).
-- arrive_mode: user override for the heuristic route-leg transport mode.
ALTER TABLE public.trip_places
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS arrive_mode text
    CHECK (arrive_mode IS NULL OR arrive_mode IN ('walk', 'transit', 'drive'));
