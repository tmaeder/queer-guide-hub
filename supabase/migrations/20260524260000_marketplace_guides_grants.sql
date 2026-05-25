-- Grant the missing table privileges + helper-function EXECUTE so anon
-- and authenticated can actually hit the marketplace_guides RLS policies.
-- Discovered via `permission denied for table marketplace_guides` (42501)
-- when an anon visitor tried to load /marketplace/guides/:slug.
--
-- Why both: in Postgres RLS evaluation order, GRANT-on-table is checked
-- before policies; lacking the GRANT short-circuits with 42501. Once
-- granted, all policies on the table evaluate — including the admin
-- policy that calls public.has_role_jwt, which itself needs EXECUTE
-- granted to anon (returns false for anon JWTs).

GRANT SELECT ON public.marketplace_guides         TO anon, authenticated;
GRANT SELECT ON public.marketplace_guide_picks    TO anon, authenticated;
GRANT SELECT ON public.marketplace_guide_sections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_guide_reads TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_role_jwt(public.app_role) TO anon;
