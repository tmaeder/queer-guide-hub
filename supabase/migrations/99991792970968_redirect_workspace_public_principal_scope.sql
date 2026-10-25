-- Resolve public creator access from authoritative resource workspace identity.
-- Private requests retain their selector and legacy internal compatibility.
-- No workspace activation fences or public grants change.
CREATE FUNCTION redirect_internal.principal_link_scope(p_workspace uuid,p_token_id uuid,p_scope text,p_session_actor uuid DEFAULT NULL,p_legacy_internal boolean DEFAULT false) RETURNS uuid[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
DECLARE t public.redirect_api_tokens; member public.redirect_workspace_members; member_key uuid; ids uuid[]; required_rank integer;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_scope IS NULL OR p_scope NOT IN('links:read','links:write','events:read','workspace:read','workspace:write','conversions:write') THEN RAISE EXCEPTION 'Invalid permission scope' USING ERRCODE='22023';END IF;
 IF p_scope LIKE '%:write' THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_workspace IS NULL OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=p_workspace AND status='active') THEN RAISE EXCEPTION 'Active workspace required' USING ERRCODE='42501';END IF;

 IF p_token_id IS NULL THEN
  IF p_session_actor IS NULL AND NOT(p_legacy_internal AND p_workspace='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid) THEN RAISE EXCEPTION 'Explicit owner account context required' USING ERRCODE='42501';END IF;
  IF p_session_actor IS NOT NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(p_workspace,p_session_actor);
   IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO t FROM public.redirect_api_tokens WHERE id=p_token_id AND workspace_id=p_workspace FOR SHARE;
 IF t.id IS NOT NULL THEN
  IF t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR NOT(p_scope=ANY(t.scopes)) THEN RAISE EXCEPTION 'Credential expired, revoked or missing scope' USING ERRCODE='42501';END IF;
  IF p_scope LIKE 'workspace:%' AND t.redirect_ids IS NOT NULL THEN RAISE EXCEPTION 'Workspace permissions require an unrestricted credential' USING ERRCODE='42501';END IF;
  IF t.member_id IS NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(t.workspace_id,t.created_by);
   IF NOT FOUND THEN RAISE EXCEPTION 'Credential owner access is no longer active' USING ERRCODE='42501';END IF;
   IF t.redirect_ids IS NULL THEN RETURN NULL;END IF;
   SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO ids FROM public.redirects WHERE workspace_id=p_workspace AND id=ANY(t.redirect_ids);
   RETURN ids;
  END IF;
  member_key:=t.member_id;
 ELSE
  IF p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Session scope is not allowed' USING ERRCODE='42501';END IF;
  member_key:=p_token_id;
 END IF;
 SELECT * INTO member FROM public.redirect_workspace_members WHERE id=member_key AND workspace_id=p_workspace AND active AND (t.id IS NOT NULL OR kind='user') FOR SHARE;
 IF t.id IS NULL AND p_session_actor IS NOT NULL AND member.user_id IS DISTINCT FROM p_session_actor THEN RAISE EXCEPTION 'Session membership does not match the authenticated account' USING ERRCODE='42501';END IF;
 IF member.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace membership is inactive or missing' USING ERRCODE='42501';END IF;
 required_rank:=CASE WHEN p_scope LIKE '%:write' THEN 2 ELSE 1 END;
 SELECT coalesce(array_agg(r.id),ARRAY[]::uuid[]) INTO ids
 FROM public.redirects r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key='redirects:'||r.id::text AND m.workspace_id=p_workspace
 LEFT JOIN public.redirect_link_folders f ON f.id=m.folder_id AND f.workspace_id=p_workspace
 LEFT JOIN public.redirect_folder_members a ON a.folder_id=f.id AND a.member_id=member.id AND a.workspace_id=p_workspace
 WHERE r.workspace_id=p_workspace AND (r.type='SHORT' OR m.folder_id IS NOT NULL) AND (t.redirect_ids IS NULL OR r.id=ANY(t.redirect_ids))
 AND least(CASE WHEN member.role='viewer' THEN 1 ELSE 3 END,
  CASE WHEN m.folder_id IS NULL THEN 2 ELSE CASE coalesce(a.permission,f.default_permission) WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END END)>=required_rank;
 RETURN ids;
END $function$;
REVOKE ALL ON FUNCTION redirect_internal.principal_link_scope(uuid,uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.principal_link_scope(uuid,uuid,text,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_management_scope(p_token_id uuid,p_scope text) RETURNS uuid[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();request_context jsonb;actor uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 request_context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 actor:=nullif(request_context->>'x-qg-redirect-session-actor','')::uuid;
 RETURN redirect_internal.principal_link_scope(selected_workspace,p_token_id,p_scope,actor,true);
END $$;

CREATE OR REPLACE FUNCTION public.redirect_public_qr_image(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.redirect_qr_image_links;allowed uuid[];link public.redirects;url text;style jsonb;logo jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND token_hash=p_hash AND publication_state='published' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF r.id IS NULL THEN RETURN NULL;END IF;
 BEGIN
  IF r.creator_user_id IS NOT NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(r.workspace_id,r.creator_user_id);
   IF NOT FOUND THEN RETURN NULL;END IF;
  ELSE allowed:=redirect_internal.principal_link_scope(r.workspace_id,coalesce(r.creator_key_id,r.creator_member_id),'links:read');END IF;
 EXCEPTION WHEN insufficient_privilege THEN RETURN NULL;
 END;
 IF r.link_id IS NOT NULL THEN
  SELECT * INTO link FROM public.redirects WHERE workspace_id=r.workspace_id AND id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RETURN NULL;END IF;
  url:=CASE WHEN link.domain_id IS NULL THEN 'https://queer.guide/go/'||link.slug ELSE 'https://'||link.domain_hostname||'/'||CASE WHEN link.is_domain_root THEN '' ELSE link.slug END END;
 ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=redirect_internal.qr_style_for_workspace(r.workspace_id,link.domain_id)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'Saved QR branding is invalid; review its settings' USING ERRCODE='22023';END IF;
 logo:=CASE WHEN r.logo_mode='none' THEN jsonb_build_object('effectiveLogo',NULL,'logoSource','hidden') WHEN r.logo_mode='custom' THEN jsonb_build_object('effectiveLogo',redirect_internal.qr_asset_for_workspace(r.workspace_id,r.logo_asset_id),'logoSource','custom') ELSE redirect_internal.qr_logo_for_workspace(r.workspace_id,link.domain_id) END;
 IF r.logo_mode='custom' AND(logo->'effectiveLogo'='null'::jsonb OR logo->'effectiveLogo' IS NULL) THEN RAISE EXCEPTION 'Custom QR artwork is unavailable' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style)||logo;
END $function$
