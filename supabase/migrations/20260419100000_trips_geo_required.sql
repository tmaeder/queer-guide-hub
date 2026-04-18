-- ============================================================
-- Trip Planning V2: Geo-first trip foundation
--
-- Adds primary_city_id + primary_country_id to trips so every
-- trip has a geographic anchor that downstream features
-- (reservations, packing, safety briefings) can key off of.
--
-- Denormalized city_name / country_code / timezone are cached
-- to keep list views fast without extra joins.
--
-- The NOT NULL + CHECK constraint is added in the follow-up
-- backfill migration (20260419101000) after legacy rows are
-- reconciled.
-- ============================================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS primary_city_id    UUID REFERENCES public.cities(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_city_name  TEXT,
  ADD COLUMN IF NOT EXISTS primary_country_code TEXT,
  ADD COLUMN IF NOT EXISTS timezone           TEXT;

CREATE INDEX IF NOT EXISTS idx_trips_primary_city ON public.trips(primary_city_id);
CREATE INDEX IF NOT EXISTS idx_trips_primary_country ON public.trips(primary_country_id);

-- ── Denorm trigger ─────────────────────────────────────────────
-- Keep cached city_name / country_code / timezone in sync with the
-- referenced rows so the UI can render without a join.
CREATE OR REPLACE FUNCTION public.trips_denorm_geo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.primary_city_id IS NOT NULL
     AND (OLD IS NULL OR NEW.primary_city_id IS DISTINCT FROM OLD.primary_city_id) THEN
    SELECT c.name, c.timezone, c.country_id
      INTO NEW.primary_city_name, NEW.timezone, NEW.primary_country_id
    FROM public.cities c
    WHERE c.id = NEW.primary_city_id;
  END IF;

  IF NEW.primary_country_id IS NOT NULL
     AND (OLD IS NULL OR NEW.primary_country_id IS DISTINCT FROM OLD.primary_country_id
          OR NEW.primary_country_code IS NULL) THEN
    SELECT code INTO NEW.primary_country_code
    FROM public.countries
    WHERE id = NEW.primary_country_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_denorm_geo_trg ON public.trips;
CREATE TRIGGER trips_denorm_geo_trg
  BEFORE INSERT OR UPDATE OF primary_city_id, primary_country_id
  ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_denorm_geo();

COMMENT ON COLUMN public.trips.primary_city_id  IS 'Geo anchor for downstream suggestions (reservations, packing, safety). Required for new trips via app-level validation + CHECK in 20260419101000.';
COMMENT ON COLUMN public.trips.primary_country_id IS 'Auto-populated from cities.country_id when primary_city_id is set.';
