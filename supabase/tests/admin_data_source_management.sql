-- Run after admin_data_source_management. All changes are rolled back.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL plpgsql.check_asserts = on;

-- Capture the owner's counts for a positive control, including disabled feeds.
CREATE TEMP TABLE source_registry_counts AS
SELECT (SELECT count(*) FROM public.ingestion_sources) AS imports,
       (SELECT count(*) FROM public.news_sources) AS news;
GRANT SELECT ON source_registry_counts TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","user_role":"admin"}', true);
DO $test$
BEGIN
  ASSERT (SELECT count(*) FROM public.ingestion_sources) =
         (SELECT imports FROM source_registry_counts), 'Admins must see every import source';
  ASSERT (SELECT count(*) FROM public.news_sources) =
         (SELECT news FROM source_registry_counts), 'Admins must see disabled news feeds';
  ASSERT EXISTS (SELECT 1 FROM public.ingestion_sources), 'Import read must be non-vacuous';
END
$test$;

-- EXPLAIN exercises SELECT + UPDATE policy permissions without firing triggers
-- or touching provider counters, audit trails or source configuration.
EXPLAIN (COSTS OFF) UPDATE public.ingestion_sources SET name = name
WHERE id = '00000000-0000-0000-0000-000000000000' RETURNING id;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","user_role":"editor","user_metadata":{"user_role":"admin"}}', true);
DO $test$
DECLARE changed bigint;
BEGIN
  ASSERT (SELECT count(*) FROM public.ingestion_sources) = 0,
    'Editors and user-editable metadata must not grant import registry access';
  ASSERT NOT EXISTS (SELECT 1 FROM public.news_sources WHERE NOT is_active),
    'Editors must not acquire access to disabled feeds';
  UPDATE public.ingestion_sources SET name = name;
  GET DIAGNOSTICS changed = ROW_COUNT;
  ASSERT changed = 0, 'Editors must not update import sources';
END
$test$;
RESET ROLE;

DO $test$
BEGIN
  ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
    ('public.ingestion_sources'::regclass, 'public.news_sources'::regclass, 'public.scrape_sources'::regclass)),
    'Source registries must retain RLS';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'ingestion_sources' AND policyname = 'ingestion_sources_admin_update'
    AND qual IS NOT NULL AND with_check IS NOT NULL), 'Updates must check both old and new rows';
END
$test$;
SELECT 'Source registry permission tests passed' AS result;
ROLLBACK;
