-- Fix: anon REST reads on `continents` and `queer_villages` return 401.
--
-- Both tables already have RLS enabled with permissive public-read policies
-- ("Continents public read access" / "Public read villages", both FOR SELECT
-- USING (true)). The 401 comes from the table-level GRANT, which PostgREST
-- checks *before* RLS runs. The 2026-04-28 `restore_anon_public_select`
-- migration issued `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`, but
-- these two tables ended up missing SELECT for anon (baseline grants anon
-- only INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE — no SELECT).
-- Effect on /places (signed-out): ContinentSection falls back to a flat
-- country grid and the "Iconic queer neighborhoods" rail renders empty.
--
-- This restores read-only access. Writes stay locked down by the existing
-- admin-only RLS policies.

BEGIN;

GRANT SELECT ON TABLE public.continents     TO anon;
GRANT SELECT ON TABLE public.queer_villages TO anon;

COMMIT;
