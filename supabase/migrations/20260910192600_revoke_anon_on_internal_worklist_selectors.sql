-- Thirteen internal work-list selectors were anon-callable, and being
-- SECURITY DEFINER they returned safety_gated rows.
--
-- This is the generalisation #2819 asked for. That PR closed five venue RPCs
-- and its own migration comment says "the 19 other SECURITY DEFINER functions
-- that read a gated table without a gate are NOT touched here ... each needs
-- its own judgement". This is that judgement for the thirteen that are
-- internal-only; the ten that remain are listed at the bottom.
--
-- MEASURED ON PRODUCTION, before the revoke:
--
--   select count(*) from venues_due_for_existence_check(500);          -- 500
--   ... joined to venues where safety_gated                            --  15
--   select count(*) from venues_due_for_amenity_backfill(500, false);  -- 500
--   ... joined to venues where safety_gated                            --   9
--
-- `safety_gated` exists so venues in criminalising and death-penalty countries
-- are invisible to anonymous callers. RLS on `venues` enforces it; SECURITY
-- DEFINER skips RLS. None of these carries an admin gate or a safety_gated
-- filter, so an unauthenticated caller could enumerate those rows. There are
-- 1,187 gated venues, 436 gated organizations and 52 gated events in total.
--
-- WHY A REVOKE AND NOT A FILTER: every caller is already authenticated or
-- service_role, so nothing loses access.
--
--   cities_due_for_refresh            supabase/functions/city-factual-backfill
--   entities_due_for_queer_image      supabase/functions/queer-imagery-backfill
--   venues_due_for_existence_check    supabase/functions/existence-external-osm,
--                                     supabase/functions/existence-deep-probe
--   venues_due_for_amenity_backfill   supabase/functions/amenity-truth-backfill
--                                     + src/components/admin/AmenityQualityPanel
--   villages_due_for_refresh          supabase/functions/pipeline-enrich-village
--   find_fuzzy_duplicate_clusters     src/config/contentTypes/venue.ts (/admin)
--   find_event_fuzzy_duplicate_clusters
--                                     src/config/contentTypes/event.ts (/admin)
--   _review_risk_blocked              scripts/rollback/… only
--   compute_village_completeness      no caller
--   events_due_for_existence_check    no caller
--   find_event_venue_candidates       no caller
--   find_org_adoption_candidates      no caller
--   find_org_merchant_domain_matches  no caller
--
-- The three `src/` call sites are all under /admin, which requires a session,
-- so they run as `authenticated` and keep their grant.
--
-- REVOKE FROM PUBLIC **AND** FROM anon, in that order. Neither alone is
-- sufficient and the failure modes differ: `FROM anon` alone is a no-op while
-- PUBLIC still holds the grant (it left 50 of 97 functions reachable in the
-- first draft of 20260822100000), and `FROM PUBLIC` alone leaves the explicit
-- anon grant that ALTER DEFAULT PRIVILEGES wrote at CREATE time (that is the
-- defect #2819 was fixing). `proacl` is not a reliable witness for either —
-- assert on has_function_privilege, which is what the block below does.
--
-- Already applied directly to production, because the exposure was live. A
-- bare REVOKE records no migration history, so it creates no drift; this file
-- makes it durable and asserted.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public._review_risk_blocked(text, text, uuid)',
    'public.cities_due_for_refresh(integer, text)',
    'public.compute_village_completeness(uuid)',
    'public.entities_due_for_queer_image(text, integer)',
    'public.events_due_for_existence_check(integer)',
    'public.find_event_fuzzy_duplicate_clusters(integer)',
    'public.find_event_venue_candidates(integer, boolean)',
    'public.find_fuzzy_duplicate_clusters(integer, numeric)',
    'public.find_org_adoption_candidates(text, integer)',
    'public.find_org_merchant_domain_matches()',
    'public.venues_due_for_amenity_backfill(integer, boolean)',
    'public.venues_due_for_existence_check(integer)',
    'public.villages_due_for_refresh(integer)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skipping %, not present', sig;
    END;
  END LOOP;
END $$;

-- Assert it, rather than trusting the REVOKE. A migration that revokes without
-- verifying is how the original hole shipped.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO leaked
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       '_review_risk_blocked', 'cities_due_for_refresh', 'compute_village_completeness',
       'entities_due_for_queer_image', 'events_due_for_existence_check',
       'find_event_fuzzy_duplicate_clusters', 'find_event_venue_candidates',
       'find_fuzzy_duplicate_clusters', 'find_org_adoption_candidates',
       'find_org_merchant_domain_matches', 'venues_due_for_amenity_backfill',
       'venues_due_for_existence_check', 'villages_due_for_refresh')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still execute: %', leaked;
  END IF;
END $$;

-- STILL OPEN, deliberately not touched here. Ten STABLE SECURITY DEFINER
-- functions remain anon-executable while reading a gated table without a
-- safety_gated filter. Each is plausibly public-by-design — most return counts
-- or aggregates rather than entity rows — but "plausibly" is not a judgement,
-- and blanket-revoking a function a public page calls would break that page:
--
--   cities_directory, city_markable_totals, event_previous_editions,
--   get_homepage_stats, hotels_top_cities, is_venue_open_at,
--   local_supporter_score, organization_products, quest_progress,
--   user_local_supporter_cities
--
-- They are also invisible to the CI gate: check-anon-function-grants.mjs is
-- scoped to VOLATILE functions on the stated reasoning that "read-only
-- functions are the legitimate public API surface". That reasoning holds for
-- writes and not for disclosure — safety_gated is a disclosure control, and a
-- STABLE SECURITY DEFINER selector bypasses it just as completely. Widening
-- that gate is a change to a deliberate design decision and belongs with the
-- ten judgements above, not in a revoke migration.
