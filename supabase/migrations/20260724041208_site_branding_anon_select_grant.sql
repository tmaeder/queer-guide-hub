-- Fix: anon PostgREST reads of site_branding returned 401 — the RLS SELECT
-- policy exists, but the table-level SELECT GRANT for anon was missing (this
-- project's default privileges revoke anon SELECT on new tables; anon oddly
-- kept INSERT/UPDATE/etc., which RLS blocks but shouldn't be granted at all).
-- Surfaced by the E2E critical-path console-error spec once the Header began
-- reading published branding (useSiteBranding).

GRANT SELECT ON public.site_branding TO anon, authenticated;
GRANT SELECT ON public.site_branding_versions TO authenticated;

-- Writes go exclusively through the SECURITY DEFINER branding_* RPCs; strip
-- the meaningless direct write grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.site_branding FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.site_branding_versions FROM anon, authenticated;
REVOKE SELECT ON public.site_branding_versions FROM anon;
