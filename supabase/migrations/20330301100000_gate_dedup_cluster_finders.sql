-- find_duplicate_clusters and find_fuzzy_duplicate_clusters leak safety-gated
-- venues to any signed-in account.
--
-- MEASURED ON PROD before this migration:
--
--   select has_function_privilege('authenticated',
--            'public.find_fuzzy_duplicate_clusters(integer,numeric)','EXECUTE')  -> true
--   select prosecdef ...                                                        -> true
--   pg_get_functiondef(...) ilike '%assert_admin_or_internal%'                   -> false
--
--   -- 600 cluster members returned; 29 of them safety_gated, in EG, ID, KE, LB,
--   -- LY, MM, MY, SY. One verbatim:
--   {"id":"608ccc52-...","city":"Surabaya","slug":"sheraton-health-club-1",
--    "title":"Sheraton Health Club","country":"ID","is_featured":false,
--    "quality_score":0}
--
-- Venues in criminalizing countries carry safety_gated = true and their RLS
-- policy is `USING (NOT safety_gated OR auth.uid() IS NOT NULL)`. Both functions
-- are SECURITY DEFINER, so they run as their owner and skip that policy
-- entirely, and neither carries an internal gate -- so the GRANT is the only
-- thing between a caller and the rows. That grant is `authenticated`, which on
-- this platform is every account, not staff. Signing up is not an authorization
-- boundary here; 20280301104412 says exactly that, about a different function.
--
-- Same defect class as 20290601120731 (_dedup_event_cluster_side, DEFINER +
-- anon, leaked gated events in the UAE and Malaysia). This one is narrower in
-- audience and wider in payload: it hands over the venue's title, slug, city and
-- country in one call.
--
-- HOW IT REGRESSED. 20260611034848 added `select public.assert_admin_or_internal();`
-- to find_duplicate_clusters. 20260811100200 rewrote the function to change the
-- city/country grouping and did not carry the gate across -- a full restatement
-- that dropped one line. The fuzzy finder was rewritten the same way in
-- 20260623151820. Nothing failed, because the gate's absence is only observable
-- by calling as a non-admin, and nothing does.
--
-- WHY A WRAPPER RATHER THAN RESTATING THE BODIES. Both are LANGUAGE sql. Adding
-- the gate inline would mean either transcribing ~4 KB of body -- the exact
-- restatement-drops-a-line failure that caused this -- or a leading
-- `WITH _gate AS (SELECT assert_admin_or_internal())` CTE, which is WORSE than
-- nothing: assert_admin_or_internal is STABLE and an unreferenced CTE may be
-- optimised away, so the gate would sometimes not run and would look present in
-- the source. Renaming preserves each body byte-for-byte and puts the check in a
-- plpgsql PERFORM, where it cannot be skipped.
--
-- THE INNER FUNCTIONS MUST BE REVOKED. ALTER FUNCTION ... RENAME carries the ACL
-- with it, so without this the renamed body is still EXECUTE-able by
-- `authenticated` under its new name and the gate is one call away from being
-- bypassed. The wrappers are SECURITY DEFINER and run as the owner, so they
-- reach the inner functions regardless.
--
-- The gate admits admin AND moderator (and service_role, and direct DB
-- sessions), which is what /admin/duplicates already requires to render, so no
-- console user loses access.

ALTER FUNCTION public.find_duplicate_clusters(text, integer)
  RENAME TO _find_duplicate_clusters_body;

ALTER FUNCTION public.find_fuzzy_duplicate_clusters(integer, numeric)
  RENAME TO _find_fuzzy_duplicate_clusters_body;

REVOKE ALL ON FUNCTION public._find_duplicate_clusters_body(text, integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._find_fuzzy_duplicate_clusters_body(integer, numeric)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_duplicate_clusters(
  p_content_type text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.assert_admin_or_internal();
  return public._find_duplicate_clusters_body(p_content_type, p_limit);
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_fuzzy_duplicate_clusters(
  p_limit integer DEFAULT 200, p_min_name_sim numeric DEFAULT 0.80)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.assert_admin_or_internal();
  return public._find_fuzzy_duplicate_clusters_body(p_limit, p_min_name_sim);
end;
$function$;

REVOKE ALL ON FUNCTION public.find_duplicate_clusters(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_clusters(text, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.find_fuzzy_duplicate_clusters(integer, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_fuzzy_duplicate_clusters(integer, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.find_duplicate_clusters(text, integer) IS
  'Admin/moderator-gated wrapper. The body lives in _find_duplicate_clusters_body, '
  'which is revoked from authenticated: this function is SECURITY DEFINER over tables '
  'with a safety_gated RLS policy, so the gate -- not the grant -- is what keeps venues '
  'in criminalizing countries out of a non-staff caller''s hands. See 20330301100000.';

COMMENT ON FUNCTION public.find_fuzzy_duplicate_clusters(integer, numeric) IS
  'Admin/moderator-gated wrapper. See find_duplicate_clusters and 20330301100000. '
  'Measured before the gate: 29 of 600 returned members were safety_gated venues in '
  'EG, ID, KE, LB, LY, MM, MY, SY.';

DO $verify$
DECLARE
  v_non_admin uuid; v_leaked int; v_ok boolean := false; v_rows int;
BEGIN
  -- 1. The gate is actually in the callable functions.
  IF pg_get_functiondef('public.find_duplicate_clusters(text,integer)'::regprocedure)
       NOT LIKE '%assert_admin_or_internal%'
     OR pg_get_functiondef('public.find_fuzzy_duplicate_clusters(integer,numeric)'::regprocedure)
       NOT LIKE '%assert_admin_or_internal%' THEN
    RAISE EXCEPTION 'a cluster finder is still ungated';
  END IF;

  -- 2. The inner bodies are unreachable by a signed-in caller, or the gate is
  --    one rename away from being pointless.
  IF has_function_privilege('authenticated',
       'public._find_duplicate_clusters_body(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public._find_fuzzy_duplicate_clusters_body(integer,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'an inner cluster-finder body is still executable by authenticated';
  END IF;

  -- 3. POSITIVE CONTROL: as an internal caller the finder still returns data, so
  --    the assertions below are not passing merely because it now returns nothing.
  SELECT jsonb_array_length(public.find_fuzzy_duplicate_clusters(50, 0.80)) INTO v_rows;
  IF coalesce(v_rows, 0) = 0 THEN
    RAISE EXCEPTION 'the gated finder returns no clusters at all -- the wrapper broke the body';
  END IF;

  -- 4. NEGATIVE CONTROL: a signed-in NON-staff caller must be refused. Without
  --    this, "no leak" would also pass on a function that simply errors for
  --    everyone, or one whose gate admits everybody.
  SELECT p.id INTO v_non_admin
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = p.id AND r.role IN ('admin','moderator'))
   LIMIT 1;
  IF v_non_admin IS NULL THEN
    RAISE EXCEPTION 'no non-staff user available to test the refusal against';
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_non_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.find_fuzzy_duplicate_clusters(50, 0.80);
    RAISE EXCEPTION 'NON-STAFF CALLER WAS NOT REFUSED -- the gate admits everyone';
  EXCEPTION WHEN sqlstate '42501' THEN
    v_ok := true;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  IF NOT v_ok THEN RAISE EXCEPTION 'the refusal did not raise 42501'; END IF;

  -- 5. THE OTHER DIRECTION, which matters just as much: a real admin must still
  --    get data. assert_admin_or_internal admits via has_any_role_jwt, which
  --    reads a `user_role` JWT claim OR falls back to a user_roles lookup on
  --    auth.uid(). If the app's JWT carries no such claim and the fallback ever
  --    stopped working, this gate would silently empty /admin/duplicates for
  --    everyone -- a self-inflicted outage that "no leak" would happily report
  --    as success.
  DECLARE v_admin uuid; v_admin_rows int;
  BEGIN
    SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
    IF v_admin IS NULL THEN RAISE EXCEPTION 'no admin account to test access against'; END IF;
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SELECT jsonb_array_length(public.find_fuzzy_duplicate_clusters(50, 0.80)) INTO v_admin_rows;
    PERFORM set_config('request.jwt.claims', '', true);
    IF coalesce(v_admin_rows, 0) = 0 THEN
      RAISE EXCEPTION 'a real admin got no clusters -- this gate breaks /admin/duplicates';
    END IF;
    RAISE NOTICE 'admin still receives % clusters through the gate', v_admin_rows;
  END;

  RAISE NOTICE 'cluster finders gated: bodies revoked, % clusters still returned internally, non-staff refused', v_rows;
END $verify$;
