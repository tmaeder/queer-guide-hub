-- Trips discovery signals: staff picks + social proof counters.
--
-- Adds columns used by the new /trips and /trips/discover surfaces:
--   - is_staff_pick: admin-flagged trips appear in the Staff Picks rail
--   - fork_count:    bumped by fork_public_trip() when a stranger forks
--   - save_count:    bumped by trip_saves trigger
--
-- All defaulted to safe values so existing rows behave like "not picked, no saves".

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_staff_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fork_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS trips_staff_pick_public_idx
  ON public.trips (is_staff_pick, created_at DESC)
  WHERE is_staff_pick AND is_public;
