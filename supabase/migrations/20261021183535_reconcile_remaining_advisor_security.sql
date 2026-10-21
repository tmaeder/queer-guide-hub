-- Reconcile RPCs and backend tables introduced after the initial isolation.
-- Public RPC OIDs, named/default arguments and all staff checks are preserved.
-- The email anonymization extension calls a renamed invoker alias of the old
-- RPC. Keep its old private target intact; replacing it would create recursion.
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE advisor_rpc_followup (
  name text PRIMARY KEY, args text NOT NULL, implementation text NOT NULL
) ON COMMIT DROP;
INSERT INTO pg_temp.advisor_rpc_followup VALUES
('admin_anonymize_user', 'p_user_id uuid, p_reason text', 'admin_anonymize_user_email'),
('decide_admin_review_case', 'p_case_id uuid, p_fingerprint text, p_action text, p_notes text, p_confirm boolean, p_payload jsonb', 'decide_admin_review_case'),
('get_admin_review_case_details', 'p_case_id uuid', 'get_admin_review_case_details'),
('get_admin_review_work_summary', '', 'get_admin_review_work_summary'),
('get_admin_review_worklist', 'p_queue_types text[], p_search text, p_scope text, p_sort text, p_page integer, p_per_page integer', 'get_admin_review_worklist'),
('reconcile_admin_review_cases', 'p_queue_type text, p_item_ids uuid[]', 'reconcile_admin_review_cases'),
('retry_admin_review_research', 'p_case_id uuid', 'retry_admin_review_research');

DO $rpc$
DECLARE m record; f record; call_args text; signature text; private_signature text;
  original_body text; alias_body text; new_definition text;
BEGIN
  SELECT prosrc INTO STRICT original_body FROM pg_proc
    WHERE oid='api_private.admin_anonymize_user(uuid,text)'::regprocedure;
  SELECT prosrc INTO STRICT alias_body FROM pg_proc
    WHERE oid='public._admin_anonymize_before_email(uuid,text)'::regprocedure;
  IF position('api_private.admin_anonymize_user(' in alias_body)=0 THEN
    RAISE EXCEPTION 'Unexpected pre-email anonymization call chain';
  END IF;
  FOR m IN SELECT * FROM pg_temp.advisor_rpc_followup ORDER BY name LOOP
    SELECT p.*, pg_get_function_arguments(p.oid) AS full_args,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) AS return_type,
      pg_get_functiondef(p.oid) AS definition
    INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=m.name
      AND pg_get_function_identity_arguments(p.oid)=m.args;
    IF NOT f.prosecdef OR f.proowner <> 'postgres'::regrole
      OR f.prokind <> 'f' OR f.provariadic <> 0
      OR has_function_privilege('anon',f.oid,'EXECUTE')
      OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected staff RPC contract: %',m.name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api_private' AND p.proname=m.implementation
        AND p.proargtypes=f.proargtypes
    ) THEN RAISE EXCEPTION 'Private implementation already exists: %',m.implementation; END IF;
    signature:=format('public.%I(%s)',m.name,m.args);
    private_signature:=format('api_private.%I(%s)',m.implementation,m.args);
    new_definition:=overlay(f.definition placing
      format('CREATE OR REPLACE FUNCTION api_private.%I',m.implementation)
      from 1 for length(format('CREATE OR REPLACE FUNCTION public.%I',m.name)));
    EXECUTE new_definition;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',private_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',private_signature);
    SELECT coalesce(string_agg(format('%I => $%s',f.proargnames[i],i),', ' ORDER BY i),'')
      INTO call_args FROM generate_series(1,f.pronargs) i;
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql %s %s SECURITY INVOKER PARALLEL %s COST %s %s SET search_path = %L AS %L',
      m.name,f.full_args,f.return_type,
      CASE f.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN f.proisstrict THEN 'STRICT' ELSE 'CALLED ON NULL INPUT' END,
      CASE f.proparallel WHEN 's' THEN 'SAFE' WHEN 'r' THEN 'RESTRICTED' ELSE 'UNSAFE' END,
      f.procost, CASE WHEN f.proretset THEN format('ROWS %s',f.prorows) ELSE '' END,
      '',format('SELECT %sapi_private.%I(%s)',CASE WHEN f.proretset THEN '* FROM ' ELSE '' END,m.implementation,call_args));
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',signature);
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=m.name AND p.oid=f.oid
        AND NOT p.prosecdef AND pg_get_function_arguments(p.oid)=f.full_args
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api_private' AND p.proname=m.implementation
        AND p.proargtypes=f.proargtypes AND p.prosecdef
        AND p.prosrc=f.prosrc AND p.proconfig=f.proconfig
    ) THEN RAISE EXCEPTION 'Staff RPC implementation/contract changed: %',m.name; END IF;
  END LOOP;
  IF (SELECT prosrc FROM pg_proc WHERE oid='api_private.admin_anonymize_user(uuid,text)'::regprocedure) IS DISTINCT FROM original_body
    OR (SELECT prosrc FROM pg_proc WHERE oid='public._admin_anonymize_before_email(uuid,text)'::regprocedure) IS DISTINCT FROM alias_body THEN
    RAISE EXCEPTION 'Original anonymization implementation or alias changed';
  END IF;
END $rpc$;

-- These tables already deny direct browser access. Make their intended
-- service-only access explicit without granting any new client privileges.
DO $backend$
DECLARE table_name text; table_oid oid;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['admin_review_cases','admin_review_repairs','admin_review_research_attempts','admin_review_research_jobs','email_activity_reservations','email_campaigns','email_consent_events','email_delivery_events','email_delivery_preference_events','email_delivery_preferences','email_disabled_accounts','email_erased_mailboxes','email_group_mentions','email_journey_messages','email_journey_runs','email_journey_steps','email_journey_versions','email_journeys','email_lifecycle_events','email_outbox','email_segment_versions','email_segments','email_subscribers','email_subscription_tokens','email_suppressions','trip_invitation_rate_limits','trip_member_invitations'] LOOP
    table_oid:=to_regclass(format('public.%I',table_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=table_oid AND relrowsecurity
    ) OR EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=table_oid
    ) THEN RAISE EXCEPTION 'Unexpected backend table/policy state: %',table_name; END IF;
    IF NOT has_table_privilege('service_role',table_oid,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Service access missing: %',table_name;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('CREATE POLICY service_role_backend_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',table_name);
    EXECUTE format('COMMENT ON POLICY service_role_backend_access ON public.%I IS %L',table_name,
      'Backend-only table. Clients use authorized server endpoints; direct browser access remains denied.');
  END LOOP;
END $backend$;
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND
      (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN RAISE EXCEPTION 'Callable public SECURITY DEFINER function remains'; END IF;
END $verify$;
NOTIFY pgrst,'reload schema';
