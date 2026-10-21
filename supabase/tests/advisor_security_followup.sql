-- Read-only authorization regressions; no real accounts are modified.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $catalog$
DECLARE t text; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_review_cases','admin_review_repairs','admin_review_research_attempts','admin_review_research_jobs','email_activity_reservations','email_campaigns','email_consent_events','email_delivery_events','email_delivery_preference_events','email_delivery_preferences','email_disabled_accounts','email_erased_mailboxes','email_group_mentions','email_journey_messages','email_journey_runs','email_journey_steps','email_journey_versions','email_journeys','email_lifecycle_events','email_outbox','email_segment_versions','email_segments','email_subscribers','email_subscription_tokens','email_suppressions','trip_invitation_rate_limits','trip_member_invitations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=to_regclass(format('public.%I',t))
        AND polname='service_role_backend_access'
        AND polroles=ARRAY['service_role'::regrole::oid]
        AND polcmd='*' AND pg_get_expr(polqual,polrelid)='true'
        AND pg_get_expr(polwithcheck,polrelid)='true'
    ) THEN RAISE EXCEPTION 'Backend-only policy missing or changed: %',t; END IF;
    IF has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      THEN RAISE EXCEPTION 'Browser table grant returned: %',t; END IF;
  END LOOP;
  IF position('api_private.admin_anonymize_user_email' in pg_get_functiondef('public.admin_anonymize_user(uuid,text)'::regprocedure))=0
    OR position('public._admin_anonymize_before_email' in pg_get_functiondef('api_private.admin_anonymize_user_email(uuid,text)'::regprocedure))=0
    OR position('api_private.admin_anonymize_user(' in pg_get_functiondef('public._admin_anonymize_before_email(uuid,text)'::regprocedure))=0
    OR position('admin_anonymize_user_email' in pg_get_functiondef('api_private.admin_anonymize_user(uuid,text)'::regprocedure))>0 THEN
      RAISE EXCEPTION 'Anonymization delegation chain changed or became recursive';
  END IF;
END $catalog$;
SET LOCAL request.jwt.claims='{"role":"anon"}';
SET LOCAL ROLE anon;
DO $denied$
DECLARE expression text; t text;
BEGIN
  FOREACH expression IN ARRAY ARRAY['public.admin_anonymize_user(''00000000-0000-0000-0000-000000000000''::uuid)','public.decide_admin_review_case(''00000000-0000-0000-0000-000000000000''::uuid,''missing'',''approve'')','public.get_admin_review_case_details(''00000000-0000-0000-0000-000000000000''::uuid)','public.get_admin_review_work_summary()','public.get_admin_review_worklist()','public.reconcile_admin_review_cases(''missing'',array[]::uuid[])','public.retry_admin_review_research(''00000000-0000-0000-0000-000000000000''::uuid)'] LOOP
    BEGIN
      EXECUTE 'SELECT '||expression;
      RAISE EXCEPTION 'Unauthorized staff RPC call succeeded: %',expression;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['admin_review_cases','admin_review_repairs','admin_review_research_attempts','admin_review_research_jobs','email_activity_reservations','email_campaigns','email_consent_events','email_delivery_events','email_delivery_preference_events','email_delivery_preferences','email_disabled_accounts','email_erased_mailboxes','email_group_mentions','email_journey_messages','email_journey_runs','email_journey_steps','email_journey_versions','email_journeys','email_lifecycle_events','email_outbox','email_segment_versions','email_segments','email_subscribers','email_subscription_tokens','email_suppressions','trip_invitation_rate_limits','trip_member_invitations'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 0',t);
      RAISE EXCEPTION 'Unauthorized backend table read succeeded: %',t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $denied$;
RESET ROLE;
SET LOCAL request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}';
SET LOCAL ROLE authenticated;
DO $denied$
DECLARE expression text; t text;
BEGIN
  FOREACH expression IN ARRAY ARRAY['public.admin_anonymize_user(''00000000-0000-0000-0000-000000000000''::uuid)','public.decide_admin_review_case(''00000000-0000-0000-0000-000000000000''::uuid,''missing'',''approve'')','public.get_admin_review_case_details(''00000000-0000-0000-0000-000000000000''::uuid)','public.get_admin_review_work_summary()','public.get_admin_review_worklist()','public.reconcile_admin_review_cases(''missing'',array[]::uuid[])','public.retry_admin_review_research(''00000000-0000-0000-0000-000000000000''::uuid)'] LOOP
    BEGIN
      EXECUTE 'SELECT '||expression;
      RAISE EXCEPTION 'Unauthorized staff RPC call succeeded: %',expression;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['admin_review_cases','admin_review_repairs','admin_review_research_attempts','admin_review_research_jobs','email_activity_reservations','email_campaigns','email_consent_events','email_delivery_events','email_delivery_preference_events','email_delivery_preferences','email_disabled_accounts','email_erased_mailboxes','email_group_mentions','email_journey_messages','email_journey_runs','email_journey_steps','email_journey_versions','email_journeys','email_lifecycle_events','email_outbox','email_segment_versions','email_segments','email_subscribers','email_subscription_tokens','email_suppressions','trip_invitation_rate_limits','trip_member_invitations'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 0',t);
      RAISE EXCEPTION 'Unauthorized backend table read succeeded: %',t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $denied$;
RESET ROLE;
SELECT 'Staff RPC and backend table isolation checks passed' AS result;
ROLLBACK;
