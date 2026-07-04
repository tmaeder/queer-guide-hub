-- Atlas: country-level place marks + trip-derived visited countries.
--
-- 'country' marks power the profile world map (visited = mark_type 'visited',
-- bucket list = mark_type 'saved'). 'city' is added alongside for future
-- city-level marking. The fill_city trigger ignores unknown entity types,
-- and country marks simply keep city_id NULL.
ALTER TYPE place_mark_entity ADD VALUE IF NOT EXISTS 'country';
ALTER TYPE place_mark_entity ADD VALUE IF NOT EXISTS 'city';

-- Countries touched by a user's COMPLETED trips. security_invoker so the
-- trips/trip_places RLS decides visibility; clients filter user_id = self.
CREATE OR REPLACE VIEW public.trip_visited_countries
WITH (security_invoker = true) AS
SELECT DISTINCT tm.user_id, tp.country_id, c.code, c.name
FROM public.trip_members tm
JOIN public.trips t ON t.id = tm.trip_id
JOIN public.trip_places tp ON tp.trip_id = t.id
JOIN public.countries c ON c.id = tp.country_id
WHERE t.status = 'completed' AND tp.country_id IS NOT NULL;

GRANT SELECT ON public.trip_visited_countries TO authenticated;
