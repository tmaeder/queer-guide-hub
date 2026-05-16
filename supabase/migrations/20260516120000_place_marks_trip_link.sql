-- Phase 5 (Footprint): link marks back to source trip + memory fields.
-- Adds trip_id, photo_urls, journal_note, rating to user_place_marks
-- so Footprint entries can show "from trip: …" and store per-place memory.

ALTER TABLE public.user_place_marks
  ADD COLUMN IF NOT EXISTS trip_id      UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_urls   TEXT[],
  ADD COLUMN IF NOT EXISTS journal_note TEXT,
  ADD COLUMN IF NOT EXISTS rating       SMALLINT CHECK (rating >= 1 AND rating <= 5);

CREATE INDEX IF NOT EXISTS user_place_marks_trip_id_idx
  ON public.user_place_marks (trip_id);
