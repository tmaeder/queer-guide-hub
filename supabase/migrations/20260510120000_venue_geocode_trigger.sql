-- Auto-geocode new venues that lack city_id
-- Calls backfill-venue-cities edge function with venue_id

CREATE OR REPLACE FUNCTION notify_venue_geocode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.latitude IS NULL AND NEW.longitude IS NULL AND (NEW.address IS NULL OR NEW.address = '') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := '{"Content-Type": "application/json", "x-webhook-secret": "meilisearch-sync-webhook-2026"}'::jsonb,
    body := jsonb_build_object('venue_id', NEW.id::text)
  );

  RETURN NEW;
END;
$$;

-- Fire after insert and after update of geocode-relevant columns
DROP TRIGGER IF EXISTS trg_venue_geocode ON venues;
CREATE TRIGGER trg_venue_geocode
  AFTER INSERT OR UPDATE OF latitude, longitude, address
  ON venues
  FOR EACH ROW
  WHEN (NEW.city_id IS NULL AND NEW.duplicate_of_id IS NULL)
  EXECUTE FUNCTION notify_venue_geocode();
