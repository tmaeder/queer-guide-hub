-- Companion to restore_trips_anon_select (user-approved fix for the broken
-- public /trips/discover): the same botched revoke also stripped anon SELECT
-- from trip_places and trip_days, whose RLS select policies explicitly serve
-- rows of is_public trips to everyone. Discover cards embed trip_places
-- (city/country names + equality score); day previews read trip_days.
-- trip_members stays anon-revoked — its policy is member-only anyway.
GRANT SELECT ON public.trip_places TO anon;
GRANT SELECT ON public.trip_days TO anon;
