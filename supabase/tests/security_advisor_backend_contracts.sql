-- Verify the final backend contract without reading or changing user records.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $catalog$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_campaign_audience_members','email_campaign_audiences','email_campaign_reviews','email_campaign_versions','email_experiment_assignments','email_experiments','email_group_invitation_sources','email_import_batches','email_import_members','email_mailbox_sends','email_management_tokens','email_operational_notices','email_operator_events','email_recipient_user_lookup','email_retention_policy','email_template_localizations','email_verified_payments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=to_regclass(format('public.%I',t))
        AND polname='service_role_backend_access'
        AND polroles=ARRAY['service_role'::regrole::oid] AND polcmd='*'
        AND pg_get_expr(polqual,polrelid)='true'
        AND pg_get_expr(polwithcheck,polrelid)='true'
    ) THEN RAISE EXCEPTION 'Backend policy missing or changed: %',t; END IF;
    IF has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Browser table access widened: %',t;
    END IF;
  END LOOP;
END $catalog$;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  IF public.tag_facet_of('venues') IS DISTINCT FROM 'venue'
    OR public.tag_facet_of('personalities') IS DISTINCT FROM 'person'
    OR public.tag_facet_of('news_article') IS DISTINCT FROM 'news'
    OR public.tag_facet_of(null) IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous facet normalization changed';
  END IF;
END $anon$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $service$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_campaign_audience_members','email_campaign_audiences','email_campaign_reviews','email_campaign_versions','email_experiment_assignments','email_experiments','email_group_invitation_sources','email_import_batches','email_import_members','email_mailbox_sends','email_management_tokens','email_operational_notices','email_operator_events','email_recipient_user_lookup','email_retention_policy','email_template_localizations','email_verified_payments'] LOOP
    EXECUTE format('SELECT 1 FROM public.%I LIMIT 0',t);
  END LOOP;
END $service$;
RESET ROLE;
SELECT 'Final backend access checks passed' AS result;
ROLLBACK;
