-- Stage one of tenant isolation. New tenant data remains fenced until all RPCs,
-- public readers, workers, token/session contexts and relationships are scoped.
CREATE TABLE public.redirect_workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
 is_legacy boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'provisioning' CHECK(status IN('provisioning','active')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(is_legacy=(id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid)),
 CHECK(status='provisioning' OR is_legacy)
);
INSERT INTO public.redirect_workspaces(id,name,slug,is_legacy,status)
VALUES('58aa4340-8f21-4b7f-9a10-90be2da89c01','Queer Guide','queer-guide',true,'active');
ALTER TABLE public.redirect_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_workspaces FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.redirect_workspaces TO service_role;
CREATE FUNCTION public.redirect_workspace_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.is_legacy THEN RAISE EXCEPTION 'The legacy workspace identity cannot be removed' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.is_legacy IS DISTINCT FROM OLD.is_legacy OR OLD.is_legacy AND NEW.status<>'active') THEN RAISE EXCEPTION 'Workspace identity is immutable' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.redirect_workspace_identity_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_workspace_identity_guard() TO service_role;
CREATE TRIGGER redirect_workspace_identity_guard BEFORE UPDATE OR DELETE ON public.redirect_workspaces FOR EACH ROW EXECUTE FUNCTION public.redirect_workspace_identity_guard();

-- Explicit inventory rather than discovering arbitrary public tables at deploy.
-- Constant defaults assign existing rows without deriving tenancy from created_by.
DO $$
DECLARE resource text;
BEGIN
 FOREACH resource IN ARRAY ARRAY[
  'redirect_access_mail',
  'redirect_access_requests',
  'redirect_api_tokens',
  'redirect_customer_profiles',
  'redirect_domain_connect_operations',
  'redirect_domain_instruction_mail',
  'redirect_domain_jobs',
  'redirect_domain_preferences',
  'redirect_domains',
  'redirect_events',
  'redirect_folder_members',
  'redirect_link_conversions',
  'redirect_link_customers',
  'redirect_link_folders',
  'redirect_link_metadata',
  'redirect_link_policies',
  'redirect_link_tag_assignments',
  'redirect_link_tags',
  'redirect_native_apps',
  'redirect_native_handoff_receipts',
  'redirect_password_attempts',
  'redirect_password_branding',
  'redirect_policy_password_limits',
  'redirect_preview_requests',
  'redirect_qr_assets',
  'redirect_qr_image_creation_log',
  'redirect_qr_image_links',
  'redirect_qr_styles',
  'redirect_report_budgets',
  'redirect_report_shares',
  'redirect_saved_reports',
  'redirect_utm_templates',
  'redirect_webhook_attempts',
  'redirect_webhook_budgets',
  'redirect_webhook_deliveries',
  'redirect_webhook_events',
  'redirect_webhooks',
  'redirect_workspace_invitations',
  'redirect_workspace_members',
  'redirects'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id uuid NOT NULL DEFAULT %L::uuid REFERENCES public.redirect_workspaces(id) ON DELETE RESTRICT, ADD CONSTRAINT %I CHECK(workspace_id=%L::uuid)',resource,'58aa4340-8f21-4b7f-9a10-90be2da89c01',resource||'_pending_tenant_fence','58aa4340-8f21-4b7f-9a10-90be2da89c01');
 END LOOP;
END $$;

-- Cross-resource relationships retain their existing deletion behavior while
-- requiring the same workspace. Keep the original globally unique identifiers
-- until every caller is scoped. Transfer can defer these relationships atomically.
ALTER TABLE public.redirect_access_requests ADD CONSTRAINT redirect_access_requests_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_link_folders ADD CONSTRAINT redirect_link_folders_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_workspace_members ADD CONSTRAINT redirect_workspace_members_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_link_customers ADD CONSTRAINT redirect_link_customers_customer_key_workspace_unique UNIQUE(workspace_id,customer_key);
ALTER TABLE public.redirect_domains ADD CONSTRAINT redirect_domains_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirects ADD CONSTRAINT redirects_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_events ADD CONSTRAINT redirect_events_click_id_workspace_unique UNIQUE(workspace_id,click_id);
ALTER TABLE public.redirect_link_metadata ADD CONSTRAINT redirect_link_metadata_redirect_key_workspace_unique UNIQUE(workspace_id,redirect_key);
ALTER TABLE public.redirect_link_tags ADD CONSTRAINT redirect_link_tags_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_native_apps ADD CONSTRAINT redirect_native_apps_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_qr_assets ADD CONSTRAINT redirect_qr_assets_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_qr_image_links ADD CONSTRAINT redirect_qr_image_links_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_api_tokens ADD CONSTRAINT redirect_api_tokens_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_saved_reports ADD CONSTRAINT redirect_saved_reports_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_webhook_deliveries ADD CONSTRAINT redirect_webhook_deliveries_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_webhook_events ADD CONSTRAINT redirect_webhook_events_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_webhooks ADD CONSTRAINT redirect_webhooks_id_workspace_unique UNIQUE(workspace_id,id);
ALTER TABLE public.redirect_access_mail DROP CONSTRAINT redirect_access_mail_request_id_fkey, ADD CONSTRAINT redirect_access_mail_request_id_fkey FOREIGN KEY(workspace_id,request_id) REFERENCES public.redirect_access_requests(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_access_requests DROP CONSTRAINT redirect_access_requests_folder_id_fkey, ADD CONSTRAINT redirect_access_requests_folder_id_fkey FOREIGN KEY(workspace_id,folder_id) REFERENCES public.redirect_link_folders(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_access_requests DROP CONSTRAINT redirect_access_requests_member_id_fkey, ADD CONSTRAINT redirect_access_requests_member_id_fkey FOREIGN KEY(workspace_id,member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_api_tokens DROP CONSTRAINT redirect_api_tokens_member_id_fkey, ADD CONSTRAINT redirect_api_tokens_member_id_fkey FOREIGN KEY(workspace_id,member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_customer_profiles DROP CONSTRAINT redirect_customer_profiles_customer_key_fkey, ADD CONSTRAINT redirect_customer_profiles_customer_key_fkey FOREIGN KEY(workspace_id,customer_key) REFERENCES public.redirect_link_customers(workspace_id,customer_key) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_domain_connect_operations DROP CONSTRAINT redirect_domain_connect_operations_domain_id_fkey, ADD CONSTRAINT redirect_domain_connect_operations_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_domain_instruction_mail DROP CONSTRAINT redirect_domain_instruction_mail_domain_id_fkey, ADD CONSTRAINT redirect_domain_instruction_mail_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_domain_jobs DROP CONSTRAINT redirect_domain_jobs_domain_id_fkey, ADD CONSTRAINT redirect_domain_jobs_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_domain_preferences DROP CONSTRAINT redirect_domain_preferences_domain_id_fkey, ADD CONSTRAINT redirect_domain_preferences_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE SET NULL (domain_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_redirect_id_fkey, ADD CONSTRAINT redirect_events_redirect_id_fkey FOREIGN KEY(workspace_id,redirect_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_folder_members DROP CONSTRAINT redirect_folder_members_folder_id_fkey, ADD CONSTRAINT redirect_folder_members_folder_id_fkey FOREIGN KEY(workspace_id,folder_id) REFERENCES public.redirect_link_folders(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_folder_members DROP CONSTRAINT redirect_folder_members_member_id_fkey, ADD CONSTRAINT redirect_folder_members_member_id_fkey FOREIGN KEY(workspace_id,member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_conversions DROP CONSTRAINT redirect_link_conversions_click_id_fkey, ADD CONSTRAINT redirect_link_conversions_click_id_fkey FOREIGN KEY(workspace_id,click_id) REFERENCES public.redirect_events(workspace_id,click_id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_customers DROP CONSTRAINT redirect_link_customers_click_id_fkey, ADD CONSTRAINT redirect_link_customers_click_id_fkey FOREIGN KEY(workspace_id,click_id) REFERENCES public.redirect_events(workspace_id,click_id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_metadata DROP CONSTRAINT redirect_link_metadata_folder_id_fkey, ADD CONSTRAINT redirect_link_metadata_folder_id_fkey FOREIGN KEY(workspace_id,folder_id) REFERENCES public.redirect_link_folders(workspace_id,id) ON DELETE SET NULL (folder_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_policies DROP CONSTRAINT redirect_link_policies_redirect_id_fkey, ADD CONSTRAINT redirect_link_policies_redirect_id_fkey FOREIGN KEY(workspace_id,redirect_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_tag_assignments DROP CONSTRAINT redirect_link_tag_assignments_redirect_key_fkey, ADD CONSTRAINT redirect_link_tag_assignments_redirect_key_fkey FOREIGN KEY(workspace_id,redirect_key) REFERENCES public.redirect_link_metadata(workspace_id,redirect_key) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_link_tag_assignments DROP CONSTRAINT redirect_link_tag_assignments_tag_id_fkey, ADD CONSTRAINT redirect_link_tag_assignments_tag_id_fkey FOREIGN KEY(workspace_id,tag_id) REFERENCES public.redirect_link_tags(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_native_apps DROP CONSTRAINT redirect_native_apps_domain_id_fkey, ADD CONSTRAINT redirect_native_apps_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_native_handoff_receipts DROP CONSTRAINT redirect_native_handoff_receipts_app_binding_fkey, ADD CONSTRAINT redirect_native_handoff_receipts_app_binding_fkey FOREIGN KEY(workspace_id,app_binding) REFERENCES public.redirect_native_apps(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_native_handoff_receipts DROP CONSTRAINT redirect_native_handoff_receipts_click_id_fkey, ADD CONSTRAINT redirect_native_handoff_receipts_click_id_fkey FOREIGN KEY(workspace_id,click_id) REFERENCES public.redirect_events(workspace_id,click_id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_native_handoff_receipts DROP CONSTRAINT redirect_native_handoff_receipts_redirect_id_fkey, ADD CONSTRAINT redirect_native_handoff_receipts_redirect_id_fkey FOREIGN KEY(workspace_id,redirect_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_password_attempts DROP CONSTRAINT redirect_password_attempts_redirect_id_fkey, ADD CONSTRAINT redirect_password_attempts_redirect_id_fkey FOREIGN KEY(workspace_id,redirect_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_password_branding DROP CONSTRAINT redirect_password_branding_link_id_fkey, ADD CONSTRAINT redirect_password_branding_link_id_fkey FOREIGN KEY(workspace_id,link_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_password_branding DROP CONSTRAINT redirect_password_branding_logo_asset_id_fkey, ADD CONSTRAINT redirect_password_branding_logo_asset_id_fkey FOREIGN KEY(workspace_id,logo_asset_id) REFERENCES public.redirect_qr_assets(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_assets DROP CONSTRAINT redirect_qr_assets_domain_id_fkey, ADD CONSTRAINT redirect_qr_assets_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE SET NULL (domain_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_assets DROP CONSTRAINT redirect_qr_assets_password_link_id_fkey, ADD CONSTRAINT redirect_qr_assets_password_link_id_fkey FOREIGN KEY(workspace_id,password_link_id) REFERENCES public.redirects(workspace_id,id) ON DELETE SET NULL (password_link_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_assets DROP CONSTRAINT redirect_qr_assets_qr_image_id_fkey, ADD CONSTRAINT redirect_qr_assets_qr_image_id_fkey FOREIGN KEY(workspace_id,qr_image_id) REFERENCES public.redirect_qr_image_links(workspace_id,id) ON DELETE SET NULL (qr_image_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_image_links DROP CONSTRAINT redirect_qr_image_links_creator_key_id_fkey, ADD CONSTRAINT redirect_qr_image_links_creator_key_id_fkey FOREIGN KEY(workspace_id,creator_key_id) REFERENCES public.redirect_api_tokens(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_image_links DROP CONSTRAINT redirect_qr_image_links_creator_member_id_fkey, ADD CONSTRAINT redirect_qr_image_links_creator_member_id_fkey FOREIGN KEY(workspace_id,creator_member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_image_links DROP CONSTRAINT redirect_qr_image_links_link_id_fkey, ADD CONSTRAINT redirect_qr_image_links_link_id_fkey FOREIGN KEY(workspace_id,link_id) REFERENCES public.redirects(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_image_links DROP CONSTRAINT redirect_qr_image_links_logo_asset_id_fkey, ADD CONSTRAINT redirect_qr_image_links_logo_asset_id_fkey FOREIGN KEY(workspace_id,logo_asset_id) REFERENCES public.redirect_qr_assets(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_styles DROP CONSTRAINT redirect_qr_styles_domain_id_fkey, ADD CONSTRAINT redirect_qr_styles_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_qr_styles DROP CONSTRAINT redirect_qr_styles_logo_asset_id_fkey, ADD CONSTRAINT redirect_qr_styles_logo_asset_id_fkey FOREIGN KEY(workspace_id,logo_asset_id) REFERENCES public.redirect_qr_assets(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_report_shares DROP CONSTRAINT redirect_report_shares_report_id_fkey, ADD CONSTRAINT redirect_report_shares_report_id_fkey FOREIGN KEY(workspace_id,report_id) REFERENCES public.redirect_saved_reports(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_webhook_attempts DROP CONSTRAINT redirect_webhook_attempts_delivery_id_fkey, ADD CONSTRAINT redirect_webhook_attempts_delivery_id_fkey FOREIGN KEY(workspace_id,delivery_id) REFERENCES public.redirect_webhook_deliveries(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_webhook_deliveries DROP CONSTRAINT redirect_webhook_deliveries_event_id_fkey, ADD CONSTRAINT redirect_webhook_deliveries_event_id_fkey FOREIGN KEY(workspace_id,event_id) REFERENCES public.redirect_webhook_events(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_webhook_deliveries DROP CONSTRAINT redirect_webhook_deliveries_webhook_id_fkey, ADD CONSTRAINT redirect_webhook_deliveries_webhook_id_fkey FOREIGN KEY(workspace_id,webhook_id) REFERENCES public.redirect_webhooks(workspace_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirect_workspace_invitations DROP CONSTRAINT redirect_workspace_invitations_member_id_fkey, ADD CONSTRAINT redirect_workspace_invitations_member_id_fkey FOREIGN KEY(workspace_id,member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE SET NULL (member_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_domain_id_fkey, ADD CONSTRAINT redirects_domain_id_fkey FOREIGN KEY(workspace_id,domain_id) REFERENCES public.redirect_domains(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

-- New APIs can discover the explicit legacy identity without expanding access.
-- A provisioning workspace never gets a principal while old global RPCs exist.
CREATE FUNCTION public.redirect_workspace_context(p_actor uuid,p_workspace uuid DEFAULT NULL,p_scope text DEFAULT 'links:read') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE w public.redirect_workspaces;m public.redirect_workspace_members;request_actor uuid;context jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Invalid workspace session' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 request_actor:=nullif(context->>'x-qg-redirect-session-actor','')::uuid;
 IF request_actor IS NOT NULL AND request_actor<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.redirect_workspaces WHERE id=coalesce(p_workspace,'58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid) AND is_legacy AND status='active' FOR SHARE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'This workspace is not available' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF FOUND THEN RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',NULL,'role','owner','label',NULL));END IF;
 SELECT * INTO m FROM public.redirect_workspace_members WHERE workspace_id=w.id AND user_id=p_actor AND kind='user' AND active FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace access is required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',m.id,'role',m.role,'label',m.label));
END $$;
REVOKE ALL ON FUNCTION public.redirect_workspace_context(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_workspace_context(uuid,uuid,text) TO service_role;
