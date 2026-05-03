-- Grant anon SELECT on hotels.
--
-- Bug: the public-read RLS policy on `hotels` exists, but the table-level
-- GRANT to the `anon` role is missing SELECT (baseline migration grants
-- INSERT/DELETE/UPDATE/TRIGGER/TRUNCATE/MAINTAIN/REFERENCES but not SELECT).
-- Result: anon clients (the public website) hit 401 "permission denied for
-- table hotels" when the map's Hotels layer tries to fetch markers.
--
-- Fix: align with venues/events which both have anon SELECT.

GRANT SELECT ON TABLE public.hotels TO anon;
