-- Recompute an event's location safety flag even when a writer updates the
-- cached flag alone. The location trigger from 20261014225550 did not fire for
-- that write shape, allowing stored flags to drift from the resolved country.
DROP TRIGGER IF EXISTS zzzzz_events_safety_gated ON public.events;

CREATE TRIGGER zzzzz_events_safety_gated
BEFORE INSERT OR UPDATE OF country_id, city_id, venue_id, country, city, safety_gated
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_entity_safety_gated();

UPDATE public.events e
SET safety_gated = public.location_is_high_risk(e.country_id, e.city_id)
WHERE coalesce(e.safety_gated, false)
  IS DISTINCT FROM public.location_is_high_risk(e.country_id, e.city_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.events e
    WHERE coalesce(e.safety_gated, false)
      IS DISTINCT FROM public.location_is_high_risk(e.country_id, e.city_id)
  ) THEN
    RAISE EXCEPTION 'event safety gating remains inconsistent';
  END IF;
END $$;
