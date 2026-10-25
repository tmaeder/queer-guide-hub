-- Globally unique opaque capabilities select their saved resource workspace.
-- Only active workspaces can publish; owner/member/key and version/password/
-- folder/revocation checks remain unchanged. Private tenant activation and all
-- resource-write fences remain closed by their separate activation guards.
CREATE OR REPLACE FUNCTION public.redirect_public_qr_image(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.redirect_qr_image_links;allowed uuid[];link public.redirects;url text;style jsonb;logo jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE token_hash=p_hash AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=redirect_qr_image_links.workspace_id AND w.status='active') AND publication_state='published' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
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
;
CREATE OR REPLACE FUNCTION public.redirect_public_report_check(p_id uuid, p_client_hash text, p_password_attempt boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.redirect_report_shares;retry integer;bucket text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE id=p_id AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=redirect_report_shares.workspace_id AND w.status='active') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 PERFORM public.redirect_report_share_ids(s.id);
 IF p_client_hash IS NULL OR p_client_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid client hash' USING ERRCODE='22023';END IF;
 FOREACH bucket IN ARRAY ARRAY['view-global:'||s.id::text,'view:'||s.id::text||':'||p_client_hash] LOOP
  retry:=public.redirect_report_budget(bucket,CASE WHEN bucket LIKE 'view-global:%' THEN 2000 ELSE 60 END,900);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
 END LOOP;
 IF p_password_attempt AND s.password_hash IS NOT NULL THEN
  retry:=public.redirect_report_budget('password-global:'||s.id::text,1000,900);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
  retry:=public.redirect_report_budget('password:'||s.id::text||':'||p_client_hash,10,900);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
 END IF;
 DELETE FROM public.redirect_report_budgets target WHERE target.bucket IN(SELECT b.bucket FROM public.redirect_report_budgets b WHERE window_at<clock_timestamp()-interval '1 day' ORDER BY window_at LIMIT 100 FOR UPDATE SKIP LOCKED);
 RETURN jsonb_build_object('id',s.id,'version',s.version,'passwordHash',s.password_hash);
END $function$
;
CREATE OR REPLACE FUNCTION public.redirect_public_report_read(p_id uuid, p_version uuid, p_password_verified boolean, p_dates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.redirect_report_shares;ids uuid[];filters jsonb;key text;value text;
 earliest timestamptz;latest timestamptz;selected_start timestamptz;selected_end timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE id=p_id AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=redirect_report_shares.workspace_id AND w.status='active') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 IF p_version IS DISTINCT FROM s.version OR (s.password_hash IS NOT NULL AND NOT coalesce(p_password_verified,false)) THEN RAISE EXCEPTION 'Dashboard access changed' USING ERRCODE='42501';END IF;
 ids:=public.redirect_report_share_ids(s.id);filters:=s.filters;
 IF p_dates IS NULL OR jsonb_typeof(p_dates)<>'object' OR p_dates-ARRAY['start','end']::text[]<>'{}' THEN RAISE EXCEPTION 'Only start and end dates are supported' USING ERRCODE='22023';END IF;
 earliest:=nullif(filters->>'start','')::timestamptz;latest:=nullif(filters->>'end','')::timestamptz;
 FOREACH key IN ARRAY ARRAY['start','end'] LOOP
  IF p_dates?key THEN
   value:=p_dates->>key;
   IF jsonb_typeof(p_dates->key)<>'string' OR value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' THEN RAISE EXCEPTION 'Use UTC ISO dates' USING ERRCODE='22023';END IF;
   filters:=jsonb_set(filters,ARRAY[key],to_jsonb(value::timestamptz));
  END IF;
 END LOOP;
 selected_start:=nullif(filters->>'start','')::timestamptz;selected_end:=nullif(filters->>'end','')::timestamptz;
 IF (earliest IS NOT NULL AND (selected_start IS NULL OR selected_start<earliest)) OR
    (latest IS NOT NULL AND (selected_end IS NULL OR selected_end>latest)) OR
    (selected_start IS NOT NULL AND selected_end IS NOT NULL AND selected_start>=selected_end) THEN
  RAISE EXCEPTION 'Choose dates within the published reporting period, with start before end' USING ERRCODE='22023';
 END IF;
 IF NOT s.include_conversions THEN filters:=filters||'{"event":"click"}'::jsonb;END IF;
 RETURN jsonb_build_object('allowIndexing',s.allow_indexing AND s.password_hash IS NULL,'title',s.title,'includeConversions',s.include_conversions,'linkCount',cardinality(ids),'scopeMode',s.scope_mode,'expiresAt',s.expires_at,
 'dateRange',jsonb_build_object('start',selected_start,'end',selected_end,'earliest',earliest,'latest',latest),
 'report',redirect_internal.analytics_report_for_workspace(s.workspace_id,filters,ids));
END $function$
;
CREATE OR REPLACE FUNCTION public.redirect_report_share_ids(p_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid;s public.redirect_report_shares;principal uuid;allowed uuid[];ids uuid[];owner boolean:=false;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE id=p_id AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=redirect_report_shares.workspace_id AND w.status='active') FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 selected_workspace:=s.workspace_id;
 PERFORM 1 WHERE redirect_internal.workspace_owner(s.workspace_id,s.owner_user_id);
 owner:=FOUND;
 IF NOT owner THEN
  IF s.requires_workspace_owner THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  SELECT id INTO principal FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND user_id=s.owner_user_id AND active AND kind='user' AND role='member' FOR SHARE;
  IF principal IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  allowed:=redirect_internal.principal_link_scope(s.workspace_id,principal,'events:read');
 END IF;
 SELECT coalesce(array_agg(d.id),ARRAY[]::uuid[]) INTO ids FROM public.redirects d LEFT JOIN public.redirect_link_metadata m ON m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||d.id::text
 LEFT JOIN public.redirect_link_folders f ON f.workspace_id=s.workspace_id AND f.id=m.folder_id
 LEFT JOIN public.redirect_folder_members a ON a.workspace_id=s.workspace_id AND a.folder_id=f.id AND a.member_id=principal
 WHERE d.workspace_id=selected_workspace AND d.type='SHORT' AND (s.scope_mode='folder' OR d.id=ANY(s.link_ids))
 AND (allowed IS NULL OR d.id=ANY(allowed)) AND (owner OR m.folder_id IS NULL OR coalesce(a.permission,f.default_permission) IN('edit','owner'))
 AND (NOT(s.filters?'folderId') OR m.folder_id=(s.filters->>'folderId')::uuid)
 AND (NOT(s.filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||d.id::text AND t.tag_id=(s.filters->>'tagId')::uuid))
 AND (NOT(s.filters?'linkIds') OR d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(s.filters->'linkIds')));
 IF NOT owner AND cardinality(ids)=0 THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 RETURN ids;
END $function$
;
