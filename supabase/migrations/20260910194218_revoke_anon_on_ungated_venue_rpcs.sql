-- Five SECURITY DEFINER functions returned venue rows to anonymous callers,
-- bypassing the safety_gated policy. Found by auditing outward from the same
-- default-privilege defect as 20260910154500; these five PRE-DATE that work.
--
-- The confirmed reproduction, run against production:
--
--   select * from public.get_venues_by_tag(array['bangladesh'], 500);
--   → 1 row, safety_gated = true
--
-- Bangladesh criminalises same-sex relations. `safety_gated` exists precisely
-- so that venues in criminalising and death-penalty countries are invisible to
-- anonymous callers — RLS on `venues` enforces it, and SECURITY DEFINER skips
-- RLS. None of these five carries an admin gate or a safety_gated filter of its
-- own, so the policy simply did not apply to them.
--
-- Why a REVOKE and not a filter: all five have ZERO callers. Verified in the
-- application (src, workers, supabase/functions, extension), in other database
-- functions, in views, and in cron.job commands — nothing invokes them. Adding
-- an `include_gated` parameter would be the right fix for a function someone
-- actually uses; for dead entry points, removing reachability is both simpler
-- and stronger.
--
-- They are left in place rather than dropped: a DROP would need certainty that
-- no external client (the Chrome extension talks to PostgREST directly) calls
-- them, and reachability is the property that matters here.
--
-- Already applied directly to production — the exposure was live, so it did not
-- wait for this migration. This makes it durable and asserted.
--
-- The 19 other SECURITY DEFINER functions that read a gated table without a
-- gate are NOT touched here. Several are legitimately anon-facing (they return
-- counts, not rows) and two have real callers, so each needs its own judgement
-- rather than a blanket revoke. They are listed in the PR for follow-up.

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_venues_by_tag(text[], integer)',
    'public.organization_venues(uuid)',
    'public.venues_open_now(uuid, integer)',
    'public.entities_in_polygon(text, text, integer)',
    'public.entities_along_route(text, integer, text[], integer)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
    EXCEPTION WHEN undefined_function THEN
      -- Signature drift should be loud, not silently skipped: a renamed
      -- argument list here means the revoke did not happen.
      RAISE EXCEPTION 'expected function not found: % — verify the signature before shipping', sig;
    END;
  END LOOP;
END $$;

-- Assert reachability is actually gone, rather than trusting the REVOKE above.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_venues_by_tag','organization_venues','venues_open_now',
                       'entities_in_polygon','entities_along_route')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still EXECUTE: %', bad;
  END IF;
END $$;
