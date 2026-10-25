-- Pin the pure facet normalizer without changing its body or execution grants.
SET LOCAL lock_timeout='5s';
ALTER FUNCTION public.tag_facet_of(text) SET search_path='';
-- Explicit backend policies preserve the existing client denial and service
-- grants, including SELECT-only service access on lookup and reporting tables.
DO $backend$
DECLARE t text; object_id oid; original_acl aclitem[];
BEGIN
  FOREACH t IN ARRAY ARRAY['email_campaign_audience_members','email_campaign_audiences','email_campaign_reviews','email_campaign_versions','email_experiment_assignments','email_experiments','email_group_invitation_sources','email_import_batches','email_import_members','email_mailbox_sends','email_management_tokens','email_operational_notices','email_operator_events','email_recipient_user_lookup','email_retention_policy','email_template_localizations','email_verified_payments'] LOOP
    object_id:=to_regclass(format('public.%I',t));
    IF object_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=object_id AND relrowsecurity
    ) OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=object_id) THEN
      RAISE EXCEPTION 'Unexpected backend table or policy state: %',t;
    END IF;
    IF has_table_privilege('anon',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR NOT has_table_privilege('service_role',object_id,'SELECT') THEN
      RAISE EXCEPTION 'Unexpected backend table grants: %',t;
    END IF;
    SELECT relacl INTO original_acl FROM pg_class WHERE oid=object_id;
    EXECUTE format('CREATE POLICY service_role_backend_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',t);
    EXECUTE format('COMMENT ON POLICY service_role_backend_access ON public.%I IS %L',t,
      'Backend-only table. Existing table grants remain authoritative; direct browser access stays denied.');
    IF (SELECT relacl FROM pg_class WHERE oid=object_id) IS DISTINCT FROM original_acl THEN
      RAISE EXCEPTION 'Table grants changed: %',t;
    END IF;
  END LOOP;
END $backend$;
DO $verify$
BEGIN
  IF public.tag_facet_of('venues') IS DISTINCT FROM 'venue'
    OR public.tag_facet_of('personalities') IS DISTINCT FROM 'person'
    OR public.tag_facet_of('news_article') IS DISTINCT FROM 'news'
    OR public.tag_facet_of('unknown') IS NOT NULL THEN
    RAISE EXCEPTION 'Facet normalizer behavior changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.tag_facet_of(text)'::regprocedure
    AND 'search_path=""'=ANY(proconfig)) THEN
    RAISE EXCEPTION 'Facet search_path is not pinned';
  END IF;
END $verify$;
NOTIFY pgrst,'reload schema';

