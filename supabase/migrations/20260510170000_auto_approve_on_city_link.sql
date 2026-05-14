-- Auto-set review_status to 'approved' when city_id gets populated

CREATE OR REPLACE FUNCTION auto_approve_on_city_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.city_id IS NOT NULL AND (OLD.city_id IS NULL OR OLD.city_id != NEW.city_id) THEN
    NEW.review_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venues_auto_approve ON venues;
CREATE TRIGGER trg_venues_auto_approve
  BEFORE UPDATE OF city_id ON venues
  FOR EACH ROW
  WHEN (NEW.city_id IS NOT NULL)
  EXECUTE FUNCTION auto_approve_on_city_link();

DROP TRIGGER IF EXISTS trg_events_auto_approve ON events;
CREATE TRIGGER trg_events_auto_approve
  BEFORE UPDATE OF city_id ON events
  FOR EACH ROW
  WHEN (NEW.city_id IS NOT NULL)
  EXECUTE FUNCTION auto_approve_on_city_link();

DROP TRIGGER IF EXISTS trg_personalities_auto_approve ON personalities;
CREATE TRIGGER trg_personalities_auto_approve
  BEFORE UPDATE OF city_id ON personalities
  FOR EACH ROW
  WHEN (NEW.city_id IS NOT NULL)
  EXECUTE FUNCTION auto_approve_on_city_link();
