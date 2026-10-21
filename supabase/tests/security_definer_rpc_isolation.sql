-- No persistent writes. Run after isolate_security_definer_rpc_implementations.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $catalog$
DECLARE f record; role_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND
      (has_function_privilege('anon',p.oid,'EXECUTE') OR
       has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN RAISE EXCEPTION 'Privileged implementation exposed in public API'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_schema_privilege(role_name,'api_private','CREATE') THEN
      RAISE EXCEPTION '% can create private implementations',role_name;
    END IF;
  END LOOP;
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY['assert_search_hybrid_contract','auto_assign_usernames','cities_due_for_refresh','collapse_entity_dup_chains','collapse_venue_dup_chains','entities_due_for_queer_image','events_due_for_existence_check','marketplace_due_for_existence_check','news_thin_for_refetch','recount_all_tag_usage','search_facets_parity_failures','search_facets_parity_probe_failures','tags_due_for_content','venues_due_for_description','venues_due_for_existence_check','villages_due_for_refresh'])
  LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE')
      OR has_function_privilege('authenticated',f.oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Backend privilege regression: %',f.proname;
    END IF;
  END LOOP;
END $catalog$;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  IF public.has_any_role_jwt(ARRAY['admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Anonymous caller passed admin check';
  END IF;
  IF public.get_milestone('__rpc_security_probe_missing__') IS NOT NULL
    OR public.get_entity_detail('venue','00000000-0000-0000-0000-000000000000'::uuid) IS NOT NULL
    OR public.get_tag_workbooks('00000000-0000-0000-0000-000000000000'::uuid) <> '[]'::jsonb
    OR EXISTS (SELECT 1 FROM public.get_shared_trip('__rpc_security_probe_missing__')) THEN
    RAISE EXCEPTION 'Public API behavior regression';
  END IF;
  PERFORM public.get_homepage_stats();
  PERFORM 1 FROM public.taxonomy_terms LIMIT 1;
  BEGIN
    PERFORM public.cities_due_for_refresh();
    RAISE EXCEPTION 'Anonymous caller executed backend job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $anon$;
RESET ROLE;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}';
SET LOCAL ROLE authenticated;
DO $member$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_my_profile())
    OR public.has_any_role_jwt(ARRAY['admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Unrelated member received private profile/admin access';
  END IF;
  PERFORM 1 FROM public.my_missions();
  BEGIN
    PERFORM public.admin_users_list();
    RAISE EXCEPTION 'Non-admin received user directory';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cities_due_for_refresh();
    RAISE EXCEPTION 'Member executed backend job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $member$;
RESET ROLE;
SELECT 'All RPC isolation and authorization checks passed' AS result;
ROLLBACK;
