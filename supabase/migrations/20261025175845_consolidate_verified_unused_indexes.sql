-- Reviewed zero-scan indexes with equivalent retained leading keys, operator
-- classes, collations, ordering, included columns and identical predicates.
-- HypoPG: all 26 probe plans retain the same estimated cost with these hidden.
-- Production: execute DROP INDEX CONCURRENTLY before applying this migration;
-- IF EXISTS lets migration history record the already completed online work.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $guard$
DECLARE r record; old_index oid; replacement oid; drop_oids oid[]; lost text;
BEGIN
 SELECT array_agg(x::regclass::oid) FILTER(WHERE to_regclass(x) IS NOT NULL)
 INTO drop_oids FROM unnest(ARRAY['public.idx_city_review_queue_open','public.idx_fk_redirect_domain_connect_operations_workspace_i_628ac1a2','public.idx_fk_redirect_domain_instruction_mail_workspace_id_ea44e62f','public.idx_fk_redirect_domain_jobs_workspace_id_268bf7a5','public.marketplace_listings_link_work_idx','public.idx_fk_redirect_password_branding_workspace_id_84137e05','public.idx_fk_redirect_report_shares_workspace_id_1a99320b','public.idx_fk_redirect_webhook_attempts_workspace_id_72e52240','public.idx_fk_redirect_workspace_invitations_workspace_id_1abd6d4c','public.idx_fk_redirect_link_policies_workspace_id_86bdbe13','public.idx_fk_redirect_password_attempts_workspace_id_3cfaf36e','public.idx_fk_redirect_folder_members_workspace_id_815ed3c0','public.idx_fk_redirect_access_mail_workspace_id_f6bf30da']) x;
 FOR r IN SELECT * FROM (VALUES
    ('public.idx_city_review_queue_open','public.uq_city_review_queue_open','CREATE INDEX idx_city_review_queue_open ON public.city_review_queue_legacy USING btree (city_id, field) WHERE (status = ''open''::text)','CREATE UNIQUE INDEX uq_city_review_queue_open ON public.city_review_queue_legacy USING btree (city_id, field) WHERE (status = ''open''::text)'),
    ('public.idx_fk_redirect_domain_connect_operations_workspace_i_628ac1a2','public.idx_fk_redirect_domain_connect_operations_workspace_i_0f08eb0e','CREATE INDEX idx_fk_redirect_domain_connect_operations_workspace_i_628ac1a2 ON public.redirect_domain_connect_operations USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_domain_connect_operations_workspace_i_0f08eb0e ON public.redirect_domain_connect_operations USING btree (workspace_id, domain_id)'),
    ('public.idx_fk_redirect_domain_instruction_mail_workspace_id_ea44e62f','public.idx_fk_redirect_domain_instruction_mail_workspace_id__ff18fe43','CREATE INDEX idx_fk_redirect_domain_instruction_mail_workspace_id_ea44e62f ON public.redirect_domain_instruction_mail USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_domain_instruction_mail_workspace_id__ff18fe43 ON public.redirect_domain_instruction_mail USING btree (workspace_id, domain_id)'),
    ('public.idx_fk_redirect_domain_jobs_workspace_id_268bf7a5','public.idx_fk_redirect_domain_jobs_workspace_id_domain_id_6329863d','CREATE INDEX idx_fk_redirect_domain_jobs_workspace_id_268bf7a5 ON public.redirect_domain_jobs USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_domain_jobs_workspace_id_domain_id_6329863d ON public.redirect_domain_jobs USING btree (workspace_id, domain_id)'),
    ('public.marketplace_listings_link_work_idx','public.marketplace_link_stale_idx','CREATE INDEX marketplace_listings_link_work_idx ON public.marketplace_listings USING btree (link_checked_at NULLS FIRST, id) WHERE (status = ''active''::text)','CREATE INDEX marketplace_link_stale_idx ON public.marketplace_listings USING btree (link_checked_at NULLS FIRST, id, last_seen_at) WHERE (status = ''active''::text)'),
    ('public.idx_fk_redirect_password_branding_workspace_id_84137e05','public.idx_fk_redirect_password_branding_workspace_id_logo_a_083ee035','CREATE INDEX idx_fk_redirect_password_branding_workspace_id_84137e05 ON public.redirect_password_branding USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_password_branding_workspace_id_logo_a_083ee035 ON public.redirect_password_branding USING btree (workspace_id, logo_asset_id)'),
    ('public.idx_fk_redirect_report_shares_workspace_id_1a99320b','public.idx_fk_redirect_report_shares_workspace_id_report_id_339af6b1','CREATE INDEX idx_fk_redirect_report_shares_workspace_id_1a99320b ON public.redirect_report_shares USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_report_shares_workspace_id_report_id_339af6b1 ON public.redirect_report_shares USING btree (workspace_id, report_id)'),
    ('public.idx_fk_redirect_webhook_attempts_workspace_id_72e52240','public.idx_fk_redirect_webhook_attempts_workspace_id_deliver_c20df254','CREATE INDEX idx_fk_redirect_webhook_attempts_workspace_id_72e52240 ON public.redirect_webhook_attempts USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_webhook_attempts_workspace_id_deliver_c20df254 ON public.redirect_webhook_attempts USING btree (workspace_id, delivery_id)'),
    ('public.idx_fk_redirect_workspace_invitations_workspace_id_1abd6d4c','public.idx_fk_redirect_workspace_invitations_workspace_id_me_6146e2ba','CREATE INDEX idx_fk_redirect_workspace_invitations_workspace_id_1abd6d4c ON public.redirect_workspace_invitations USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_workspace_invitations_workspace_id_me_6146e2ba ON public.redirect_workspace_invitations USING btree (workspace_id, member_id)'),
    ('public.idx_fk_redirect_link_policies_workspace_id_86bdbe13','public.idx_fk_redirect_link_policies_workspace_id_redirect_i_576f664f','CREATE INDEX idx_fk_redirect_link_policies_workspace_id_86bdbe13 ON public.redirect_link_policies USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_link_policies_workspace_id_redirect_i_576f664f ON public.redirect_link_policies USING btree (workspace_id, redirect_id)'),
    ('public.idx_fk_redirect_password_attempts_workspace_id_3cfaf36e','public.idx_fk_redirect_password_attempts_workspace_id_redire_ed32e052','CREATE INDEX idx_fk_redirect_password_attempts_workspace_id_3cfaf36e ON public.redirect_password_attempts USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_password_attempts_workspace_id_redire_ed32e052 ON public.redirect_password_attempts USING btree (workspace_id, redirect_id)'),
    ('public.idx_fk_redirect_folder_members_workspace_id_815ed3c0','public.idx_fk_redirect_folder_members_workspace_id_member_id_46d8af46','CREATE INDEX idx_fk_redirect_folder_members_workspace_id_815ed3c0 ON public.redirect_folder_members USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_folder_members_workspace_id_member_id_46d8af46 ON public.redirect_folder_members USING btree (workspace_id, member_id)'),
    ('public.idx_fk_redirect_access_mail_workspace_id_f6bf30da','public.idx_fk_redirect_access_mail_workspace_id_request_id_21ee818d','CREATE INDEX idx_fk_redirect_access_mail_workspace_id_f6bf30da ON public.redirect_access_mail USING btree (workspace_id)','CREATE INDEX idx_fk_redirect_access_mail_workspace_id_request_id_21ee818d ON public.redirect_access_mail USING btree (workspace_id, request_id)')
 ) AS reviewed(drop_name,keep_name,drop_definition,keep_definition) LOOP
  old_index:=to_regclass(r.drop_name); replacement:=to_regclass(r.keep_name);
  IF replacement IS NULL OR pg_get_indexdef(replacement) IS DISTINCT FROM r.keep_definition
    OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=replacement AND indisvalid AND indisready) THEN
   RAISE EXCEPTION 'Retained index is absent or changed: %',r.keep_name;
  END IF;
  IF old_index IS NULL THEN CONTINUE; END IF;
  IF pg_get_indexdef(old_index) IS DISTINCT FROM r.drop_definition THEN
   RAISE EXCEPTION 'Drop candidate changed: %',r.drop_name;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=old_index AND (indisunique OR indisprimary OR indisexclusion OR indisreplident))
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=old_index)
    OR EXISTS(SELECT 1 FROM pg_depend WHERE refclassid='pg_class'::regclass AND refobjid=old_index) THEN
   RAISE EXCEPTION 'Protected index dependency: %',r.drop_name;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_stat_all_indexes WHERE indexrelid=old_index AND idx_scan>0) THEN
   RAISE EXCEPTION 'Candidate has acquired real usage; re-review: %',r.drop_name;
  END IF;
 END LOOP;
 SELECT string_agg(k.conname,', ') INTO lost FROM pg_constraint k WHERE k.contype='f'
  AND EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=k.conrelid AND i.indisvalid
    AND k.conkey=(string_to_array(i.indkey::text,' ')::smallint[])[1:array_length(k.conkey,1)])
  AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=k.conrelid AND i.indisvalid
    AND NOT(i.indexrelid=ANY(coalesce(drop_oids,ARRAY[]::oid[])))
    AND k.conkey=(string_to_array(i.indkey::text,' ')::smallint[])[1:array_length(k.conkey,1)]);
 IF lost IS NOT NULL THEN RAISE EXCEPTION 'Foreign-key coverage would be lost: %',lost; END IF;
END $guard$;

-- Retained: public.uq_city_review_queue_open
DROP INDEX IF EXISTS "public"."idx_city_review_queue_open";
-- Retained: public.idx_fk_redirect_domain_connect_operations_workspace_i_0f08eb0e
DROP INDEX IF EXISTS "public"."idx_fk_redirect_domain_connect_operations_workspace_i_628ac1a2";
-- Retained: public.idx_fk_redirect_domain_instruction_mail_workspace_id__ff18fe43
DROP INDEX IF EXISTS "public"."idx_fk_redirect_domain_instruction_mail_workspace_id_ea44e62f";
-- Retained: public.idx_fk_redirect_domain_jobs_workspace_id_domain_id_6329863d
DROP INDEX IF EXISTS "public"."idx_fk_redirect_domain_jobs_workspace_id_268bf7a5";
-- Retained: public.marketplace_link_stale_idx
DROP INDEX IF EXISTS "public"."marketplace_listings_link_work_idx";
-- Retained: public.idx_fk_redirect_password_branding_workspace_id_logo_a_083ee035
DROP INDEX IF EXISTS "public"."idx_fk_redirect_password_branding_workspace_id_84137e05";
-- Retained: public.idx_fk_redirect_report_shares_workspace_id_report_id_339af6b1
DROP INDEX IF EXISTS "public"."idx_fk_redirect_report_shares_workspace_id_1a99320b";
-- Retained: public.idx_fk_redirect_webhook_attempts_workspace_id_deliver_c20df254
DROP INDEX IF EXISTS "public"."idx_fk_redirect_webhook_attempts_workspace_id_72e52240";
-- Retained: public.idx_fk_redirect_workspace_invitations_workspace_id_me_6146e2ba
DROP INDEX IF EXISTS "public"."idx_fk_redirect_workspace_invitations_workspace_id_1abd6d4c";
-- Retained: public.idx_fk_redirect_link_policies_workspace_id_redirect_i_576f664f
DROP INDEX IF EXISTS "public"."idx_fk_redirect_link_policies_workspace_id_86bdbe13";
-- Retained: public.idx_fk_redirect_password_attempts_workspace_id_redire_ed32e052
DROP INDEX IF EXISTS "public"."idx_fk_redirect_password_attempts_workspace_id_3cfaf36e";
-- Retained: public.idx_fk_redirect_folder_members_workspace_id_member_id_46d8af46
DROP INDEX IF EXISTS "public"."idx_fk_redirect_folder_members_workspace_id_815ed3c0";
-- Retained: public.idx_fk_redirect_access_mail_workspace_id_request_id_21ee818d
DROP INDEX IF EXISTS "public"."idx_fk_redirect_access_mail_workspace_id_f6bf30da";
