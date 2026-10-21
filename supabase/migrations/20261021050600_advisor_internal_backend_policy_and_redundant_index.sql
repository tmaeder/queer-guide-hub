-- Recovered verbatim from production migration history; already applied.
-- Preserve redirect ownership data behind the existing backend-only ACL/RLS.
SET LOCAL lock_timeout = '5s';
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='redirect_internal' AND tablename='workspace_owners') THEN
  CREATE POLICY backend_service_access ON redirect_internal.workspace_owners
   FOR ALL TO service_role USING (true) WITH CHECK (true);
 END IF;
END $policy$;

-- The zero-scan single-column index is covered by the existing, actively used
-- B-tree (website_id, distinct_id, created_at DESC). Keep FK/search coverage.
DO $coverage$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('umami.session_website_distinct_created_idx')
   AND i.indisvalid AND i.indisready AND i.indpred IS NULL
   AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid='umami.session'::regclass AND attname='website_id')) THEN
  RAISE EXCEPTION 'Replacement website index is absent or invalid';
 END IF;
END $coverage$;
DROP INDEX IF EXISTS umami.session_website_id_idx;
