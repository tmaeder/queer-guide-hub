-- ============================================================
-- Organizers as venues
-- ------------------------------------------------------------
-- Rather than a parallel `organizers` table, treat organizers
-- as a venue subtype via is_organizer flag. Lets them carry the
-- same address/geo/owner-claim mechanics as venues, with the
-- option to surface separately in UI.
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizer_handles JSONB;

CREATE INDEX IF NOT EXISTS idx_venues_is_organizer
  ON public.venues(is_organizer)
  WHERE is_organizer = true;

COMMENT ON COLUMN public.venues.is_organizer IS
  'When true, this venue represents an organiser (collective, promoter, host) rather than a physical place.';
COMMENT ON COLUMN public.venues.organizer_handles IS
  'Social handles for organisers: {instagram, telegram, bluesky, x, website}.';
