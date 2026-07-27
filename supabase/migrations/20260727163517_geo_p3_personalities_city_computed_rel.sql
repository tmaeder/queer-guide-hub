-- PR #2371 regression fix: personalities.city_id was flipped to geo_city_profiles
-- in the P2 FK re-point (#2363) but never got a computed-relationship overload
-- like venues/events/hotels/trip_places did, so the bare `city_id` embed hint
-- now 400s (geo_city_profiles has no id/name). Same pattern as
-- 20260726210906_geo_p2b_flip_venues_events_hotels.sql.
create or replace function public.cities(p public.personalities)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = p.city_id $$;

notify pgrst, 'reload schema';
