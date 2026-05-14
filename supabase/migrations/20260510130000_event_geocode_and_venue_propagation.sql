-- 1. Auto-geocode events missing city_id (Nominatim or inherit from venue)
CREATE OR REPLACE FUNCTION notify_event_geocode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.city_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.latitude IS NULL AND NEW.longitude IS NULL AND NEW.venue_id IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := '{"Content-Type": "application/json", "x-webhook-secret": "meilisearch-sync-webhook-2026"}'::jsonb,
    body := jsonb_build_object('event_id', NEW.id::text)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_geocode ON events;
CREATE TRIGGER trg_event_geocode
  AFTER INSERT OR UPDATE OF latitude, longitude, venue_id
  ON events
  FOR EACH ROW
  WHEN (NEW.city_id IS NULL AND NEW.duplicate_of_id IS NULL)
  EXECUTE FUNCTION notify_event_geocode();

-- 2. When a venue gets city_id, propagate to its events that lack one
CREATE OR REPLACE FUNCTION propagate_venue_city_to_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.city_id IS NOT NULL AND (OLD.city_id IS NULL OR OLD.city_id != NEW.city_id) THEN
    UPDATE events
    SET city_id = NEW.city_id,
        country_id = COALESCE(events.country_id, NEW.country_id),
        updated_at = now()
    WHERE venue_id = NEW.id
      AND city_id IS NULL
      AND duplicate_of_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_propagate_city ON venues;
CREATE TRIGGER trg_venue_propagate_city
  AFTER UPDATE OF city_id ON venues
  FOR EACH ROW
  WHEN (NEW.city_id IS NOT NULL)
  EXECUTE FUNCTION propagate_venue_city_to_events();
