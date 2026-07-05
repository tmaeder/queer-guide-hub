-- Restore anon SELECT on trips (user-approved). A security pass revoked it
-- (leaving the other privileges — clearly unintended), which broke the
-- deliberately public /trips/discover feed with PostgREST 401s. The
-- trips_select RLS policy already scopes anon reads to is_public = true
-- rows; the grant is required for the policy to apply at all. Writes remain
-- blocked by RLS.
GRANT SELECT ON public.trips TO anon;
