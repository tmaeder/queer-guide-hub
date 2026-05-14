-- Hotels: introduce a curated `featured_priority` integer.
--
-- Today the boolean `featured` is set on ~35% of rows (108/312), which made
-- the "Featured" badge meaningless on the card grid (Phase 5 hid the badge
-- entirely). A curated integer — only set on hotels we actually want to
-- promote — restores meaning. The frontend will:
--   - sort by `featured_priority` DESC NULLS LAST first
--   - show the Featured badge only when `featured_priority IS NOT NULL`
--
-- `featured` is left in place to preserve existing ordering until ingestion
-- starts populating priority. Keep both columns; deprecate `featured` later.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS featured_priority integer;

COMMENT ON COLUMN public.hotels.featured_priority IS
  'Curated promotion rank — higher = more prominent. NULL = not curated. Only rows with a non-null priority should display a "Featured" badge.';

-- Helpful for "ORDER BY featured_priority DESC NULLS LAST" sweeps.
CREATE INDEX IF NOT EXISTS hotels_featured_priority_idx
  ON public.hotels (featured_priority DESC NULLS LAST)
  WHERE featured_priority IS NOT NULL;
