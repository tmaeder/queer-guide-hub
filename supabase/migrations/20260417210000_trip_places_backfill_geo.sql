-- trip_places.country_id / city_id backfill
--
-- TripSafetyBriefing keys entirely off trip_places.country_id. Client paths
-- could insert places with NULL here (AI planner, future custom-place UIs),
-- silently breaking the safety tab. This trigger resolves both fields from
-- the linked venue / event / hotel on INSERT and on UPDATE of the link
-- columns, so the client can't regress this regardless of which insert
-- path it takes.

CREATE OR REPLACE FUNCTION public.trip_places_backfill_geo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.country_id IS NULL OR NEW.city_id IS NULL THEN
    IF NEW.venue_id IS NOT NULL THEN
      SELECT COALESCE(NEW.country_id, v.country_id),
             COALESCE(NEW.city_id,    v.city_id)
        INTO NEW.country_id, NEW.city_id
        FROM venues v WHERE v.id = NEW.venue_id;
    ELSIF NEW.event_id IS NOT NULL THEN
      SELECT COALESCE(NEW.country_id, e.country_id),
             COALESCE(NEW.city_id,    e.city_id)
        INTO NEW.country_id, NEW.city_id
        FROM events e WHERE e.id = NEW.event_id;
    ELSIF NEW.hotel_id IS NOT NULL THEN
      SELECT COALESCE(NEW.country_id, h.country_id),
             COALESCE(NEW.city_id,    h.city_id)
        INTO NEW.country_id, NEW.city_id
        FROM hotels h WHERE h.id = NEW.hotel_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trip_places_backfill_geo_trg ON public.trip_places;
CREATE TRIGGER trip_places_backfill_geo_trg
  BEFORE INSERT OR UPDATE OF venue_id, event_id, hotel_id, country_id, city_id
  ON public.trip_places
  FOR EACH ROW EXECUTE FUNCTION public.trip_places_backfill_geo();

-- One-shot backfill for rows inserted before the trigger existed.
UPDATE trip_places tp
   SET country_id = COALESCE(tp.country_id, v.country_id),
       city_id    = COALESCE(tp.city_id,    v.city_id)
  FROM venues v
 WHERE tp.venue_id = v.id
   AND (tp.country_id IS NULL OR tp.city_id IS NULL);

UPDATE trip_places tp
   SET country_id = COALESCE(tp.country_id, e.country_id),
       city_id    = COALESCE(tp.city_id,    e.city_id)
  FROM events e
 WHERE tp.event_id = e.id
   AND (tp.country_id IS NULL OR tp.city_id IS NULL);

UPDATE trip_places tp
   SET country_id = COALESCE(tp.country_id, h.country_id),
       city_id    = COALESCE(tp.city_id,    h.city_id)
  FROM hotels h
 WHERE tp.hotel_id = h.id
   AND (tp.country_id IS NULL OR tp.city_id IS NULL);
