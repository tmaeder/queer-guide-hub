-- ============================================================
-- Fix Supabase security linter warnings:
--   1. rls_disabled_in_public: public.scraper_migrations
--   2. function_search_path_mutable (4 functions):
--        - public.track_share_view
--        - public.trip_places_backfill_geo
--        - public.get_share_view_stats
--        - public.user_travel_preferences_touch
-- ============================================================

-- 1. Enable RLS on scraper_migrations. Maintained by the scraper
--    service role (bypasses RLS); no policy is needed because no
--    other role should read or write it.
ALTER TABLE IF EXISTS public.scraper_migrations ENABLE ROW LEVEL SECURITY;

-- 2. Pin search_path on each flagged function. Empty search_path
--    forces fully-qualified references inside the bodies (which
--    they already use), eliminating the role-mutable-search_path
--    hijack vector.
ALTER FUNCTION public.track_share_view(TEXT, TEXT)
  SET search_path = '';

ALTER FUNCTION public.get_share_view_stats(UUID)
  SET search_path = '';

ALTER FUNCTION public.user_travel_preferences_touch()
  SET search_path = '';

DO $$
DECLARE
  sig TEXT;
BEGIN
  FOR sig IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trip_places_backfill_geo'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', sig, '');
  END LOOP;
END
$$;
