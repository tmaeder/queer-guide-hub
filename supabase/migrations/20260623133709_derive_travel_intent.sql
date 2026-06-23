-- Phase 2: travel intent auto-derives from the viewer's nearest upcoming trip.
-- Returns at most one row (the soonest non-past trip with a known city) so the
-- People hub / TripWorkspace can offer "find who's also going to {city}".
CREATE OR REPLACE FUNCTION public.derive_travel_intent()
RETURNS TABLE(trip_id uuid, city_id uuid, city_name text, start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT t.id, t.primary_city_id, t.primary_city_name, t.start_date, t.end_date
  FROM public.trips t
  WHERE t.owner_id = auth.uid()
    AND t.primary_city_id IS NOT NULL
    AND (t.end_date IS NULL OR t.end_date >= current_date)
  ORDER BY t.start_date ASC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.derive_travel_intent() FROM anon;
GRANT EXECUTE ON FUNCTION public.derive_travel_intent() TO authenticated;
