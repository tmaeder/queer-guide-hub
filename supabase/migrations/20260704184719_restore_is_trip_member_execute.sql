-- Final piece of the public-trips outage fix (user-approved): the security
-- pass also revoked EXECUTE on is_trip_member(), but the trips/trip_places/
-- trip_days RLS SELECT policies call it for EVERY read — including anon
-- reads of is_public trips. Without EXECUTE the whole query fails with
-- "permission denied for function is_trip_member" (PostgREST 401 for anon).
-- The function is a membership predicate (boolean), safe to expose.
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid, uuid) TO anon, authenticated;
