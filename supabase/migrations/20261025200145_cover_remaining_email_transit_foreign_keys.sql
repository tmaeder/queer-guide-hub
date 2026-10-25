-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261025200145 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Production: prebuild these nine indexes CONCURRENTLY with psql autocommit,
-- then record this idempotent migration after all builds are valid. Fresh/local
-- databases may replay this ordinary transactional form.
SET lock_timeout = '5s';
DO $guard$
DECLARE r record; existing oid;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('city_transit_service','city_transit_service_feed_key_fkey','FOREIGN KEY (feed_key) REFERENCES transit_feeds(feed_key) ON DELETE CASCADE','city_transit_service_feed_key_idx','CREATE INDEX city_transit_service_feed_key_idx ON public.city_transit_service USING btree (feed_key)'),
 ('email_campaigns','email_campaigns_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_campaigns_created_by_idx','CREATE INDEX email_campaigns_created_by_idx ON public.email_campaigns USING btree (created_by)'),
 ('email_campaigns','email_campaigns_template_key_fkey','FOREIGN KEY (template_key) REFERENCES email_templates(template_key)','email_campaigns_template_key_idx','CREATE INDEX email_campaigns_template_key_idx ON public.email_campaigns USING btree (template_key)'),
 ('email_experiments','email_experiments_audience_id_fkey','FOREIGN KEY (audience_id) REFERENCES email_campaign_audiences(id) ON DELETE CASCADE','email_experiments_audience_id_idx','CREATE INDEX email_experiments_audience_id_idx ON public.email_experiments USING btree (audience_id)'),
 ('email_segment_versions','email_segment_versions_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segment_versions_created_by_idx','CREATE INDEX email_segment_versions_created_by_idx ON public.email_segment_versions USING btree (created_by)'),
 ('email_segments','email_segments_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segments_created_by_idx','CREATE INDEX email_segments_created_by_idx ON public.email_segments USING btree (created_by)'),
 ('email_segments','email_segments_updated_by_fkey','FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segments_updated_by_idx','CREATE INDEX email_segments_updated_by_idx ON public.email_segments USING btree (updated_by)'),
 ('email_subscription_tokens','email_subscription_tokens_confirmation_outbox_id_fkey','FOREIGN KEY (confirmation_outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL','email_subscription_tokens_confirmation_outbox_id_idx','CREATE INDEX email_subscription_tokens_confirmation_outbox_id_idx ON public.email_subscription_tokens USING btree (confirmation_outbox_id)'),
 ('email_subscription_tokens','email_subscription_tokens_requested_user_id_fkey','FOREIGN KEY (requested_user_id) REFERENCES auth.users(id) ON DELETE SET NULL','email_subscription_tokens_requested_user_id_idx','CREATE INDEX email_subscription_tokens_requested_user_id_idx ON public.email_subscription_tokens USING btree (requested_user_id)')
 ) x(table_name, constraint_name, constraint_definition, index_name, index_definition) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||r.table_name) AND c.conname=r.constraint_name AND c.contype='f' AND c.convalidated AND pg_get_constraintdef(c.oid)=r.constraint_definition) THEN
   RAISE EXCEPTION 'Foreign key changed: %',r.constraint_name;
  END IF;
  existing:=to_regclass('public.'||r.index_name);
  IF existing IS NOT NULL AND (
    pg_get_indexdef(existing) IS DISTINCT FROM r.index_definition
    OR NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=existing AND i.indisvalid AND i.indisready AND NOT i.indisunique AND i.indpred IS NULL)
  ) THEN RAISE EXCEPTION 'Index name collision or invalid index: %',r.index_name; END IF;
 END LOOP;
END $guard$;
CREATE INDEX IF NOT EXISTS city_transit_service_feed_key_idx ON public.city_transit_service USING btree (feed_key);
CREATE INDEX IF NOT EXISTS email_campaigns_created_by_idx ON public.email_campaigns USING btree (created_by);
CREATE INDEX IF NOT EXISTS email_campaigns_template_key_idx ON public.email_campaigns USING btree (template_key);
CREATE INDEX IF NOT EXISTS email_experiments_audience_id_idx ON public.email_experiments USING btree (audience_id);
CREATE INDEX IF NOT EXISTS email_segment_versions_created_by_idx ON public.email_segment_versions USING btree (created_by);
CREATE INDEX IF NOT EXISTS email_segments_created_by_idx ON public.email_segments USING btree (created_by);
CREATE INDEX IF NOT EXISTS email_segments_updated_by_idx ON public.email_segments USING btree (updated_by);
CREATE INDEX IF NOT EXISTS email_subscription_tokens_confirmation_outbox_id_idx ON public.email_subscription_tokens USING btree (confirmation_outbox_id);
CREATE INDEX IF NOT EXISTS email_subscription_tokens_requested_user_id_idx ON public.email_subscription_tokens USING btree (requested_user_id);
DO $verify$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('city_transit_service','city_transit_service_feed_key_fkey','FOREIGN KEY (feed_key) REFERENCES transit_feeds(feed_key) ON DELETE CASCADE','city_transit_service_feed_key_idx','CREATE INDEX city_transit_service_feed_key_idx ON public.city_transit_service USING btree (feed_key)'),
 ('email_campaigns','email_campaigns_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_campaigns_created_by_idx','CREATE INDEX email_campaigns_created_by_idx ON public.email_campaigns USING btree (created_by)'),
 ('email_campaigns','email_campaigns_template_key_fkey','FOREIGN KEY (template_key) REFERENCES email_templates(template_key)','email_campaigns_template_key_idx','CREATE INDEX email_campaigns_template_key_idx ON public.email_campaigns USING btree (template_key)'),
 ('email_experiments','email_experiments_audience_id_fkey','FOREIGN KEY (audience_id) REFERENCES email_campaign_audiences(id) ON DELETE CASCADE','email_experiments_audience_id_idx','CREATE INDEX email_experiments_audience_id_idx ON public.email_experiments USING btree (audience_id)'),
 ('email_segment_versions','email_segment_versions_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segment_versions_created_by_idx','CREATE INDEX email_segment_versions_created_by_idx ON public.email_segment_versions USING btree (created_by)'),
 ('email_segments','email_segments_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segments_created_by_idx','CREATE INDEX email_segments_created_by_idx ON public.email_segments USING btree (created_by)'),
 ('email_segments','email_segments_updated_by_fkey','FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL','email_segments_updated_by_idx','CREATE INDEX email_segments_updated_by_idx ON public.email_segments USING btree (updated_by)'),
 ('email_subscription_tokens','email_subscription_tokens_confirmation_outbox_id_fkey','FOREIGN KEY (confirmation_outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL','email_subscription_tokens_confirmation_outbox_id_idx','CREATE INDEX email_subscription_tokens_confirmation_outbox_id_idx ON public.email_subscription_tokens USING btree (confirmation_outbox_id)'),
 ('email_subscription_tokens','email_subscription_tokens_requested_user_id_fkey','FOREIGN KEY (requested_user_id) REFERENCES auth.users(id) ON DELETE SET NULL','email_subscription_tokens_requested_user_id_idx','CREATE INDEX email_subscription_tokens_requested_user_id_idx ON public.email_subscription_tokens USING btree (requested_user_id)')
 ) x(table_name, constraint_name, constraint_definition, index_name, index_definition) LOOP
  IF pg_get_indexdef(to_regclass('public.'||r.index_name)) IS DISTINCT FROM r.index_definition
   OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_index i ON i.indrelid=c.conrelid
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam
    WHERE c.conrelid=to_regclass('public.'||r.table_name) AND c.conname=r.constraint_name
     AND i.indexrelid=to_regclass('public.'||r.index_name)
     AND i.indisvalid AND i.indisready AND i.indislive AND NOT i.indisunique
     AND i.indpred IS NULL AND i.indexprs IS NULL AND am.amname='btree'
     AND c.conkey=(string_to_array(i.indkey::text,' ')::smallint[])[1:array_length(c.conkey,1)]
   ) THEN RAISE EXCEPTION 'Missing complete FK index coverage: %',r.constraint_name; END IF;
 END LOOP;
END $verify$;
;
