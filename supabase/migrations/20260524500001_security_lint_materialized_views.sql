-- Fix Supabase linter: materialized_view_in_api (0016).
-- venue_leaderboard_global and venue_leaderboard_city are refresh
-- materialized views read by /venues ranking. Exposing them on the
-- Data API skips RLS. Frontend should go through rpc_venues_ranked
-- (already SECURITY DEFINER) instead of selecting the mat views.
--
-- Revoke direct SELECT from anon and authenticated. service_role
-- keeps access for refresh and admin tooling.

REVOKE SELECT ON public.venue_leaderboard_global FROM anon, authenticated;
REVOKE SELECT ON public.venue_leaderboard_city   FROM anon, authenticated;
