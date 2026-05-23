-- Allow anon + authenticated to call the secure venue check-ins RPC.
-- Body returns '[]'::JSON; granting EXECUTE leaks nothing. Stops 403 flood
-- from VenueRecentCheckins on public venue detail pages.
GRANT EXECUTE ON FUNCTION public.get_secure_venue_checkins(uuid) TO authenticated, anon;
