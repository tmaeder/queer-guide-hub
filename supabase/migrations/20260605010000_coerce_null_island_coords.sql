-- Prevent "Null Island": (0,0) is in the Gulf of Guinea — no real venue/event/
-- hotel is there. Bad geocodes historically wrote (0,0), and the map filters NULL
-- coords but not (0,0), so thousands of rows piled up at 0,0. Coerce exact (0,0)
-- to NULL on write so they drop off the map instead of rendering at the wrong spot.
-- Only exact (0,0) is coerced — lng=0 alone (Greenwich meridian) or lat=0 alone
-- (equator) can be legitimate.

CREATE OR REPLACE FUNCTION public.coerce_null_island_coords()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitude = 0 AND NEW.longitude = 0 THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venues_null_island ON public.venues;
CREATE TRIGGER trg_venues_null_island
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.coerce_null_island_coords();

DROP TRIGGER IF EXISTS trg_events_null_island ON public.events;
CREATE TRIGGER trg_events_null_island
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.coerce_null_island_coords();

DROP TRIGGER IF EXISTS trg_hotels_null_island ON public.hotels;
CREATE TRIGGER trg_hotels_null_island
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.coerce_null_island_coords();
