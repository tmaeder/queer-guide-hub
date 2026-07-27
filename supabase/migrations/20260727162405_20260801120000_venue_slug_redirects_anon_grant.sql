-- Filename carries two stamps: 20260727162405 is the version the MCP
-- apply_migration tool actually recorded (it stamps its own call-timestamp,
-- not a name we pass in) after applying this live to reconcile a 401 in
-- prod; 20260801120000 is this repo's intended sequential version. Same
-- repair-shim convention as 20260706042931_20260709100600_fix_marketplace_
-- brands_anon_401.sql -- keeps `db push` from seeing remote-only drift.
--
-- venue_slug_redirects was created (20260601072108_venue_merge_dedup_phase1)
-- with RLS + a public-read policy but no table-level GRANT, so PostgREST
-- returns 401 for anon before RLS is ever evaluated — old venue slugs never
-- redirect for logged-out visitors or crawlers. Mirror guide_slug_redirects
-- (20260726151000_unified_guides_grants): SELECT for anon+authenticated.
-- Do NOT touch username_redirects — that anon-blocked state is deliberate
-- (deadname linkability).

GRANT SELECT ON public.venue_slug_redirects TO anon, authenticated;
