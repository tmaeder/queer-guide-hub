-- Public QR entry URLs never contain handoff capabilities or app consent.
-- Existing profiles retain visit behavior; current link/creator ACL checks remain.
ALTER TABLE public.redirect_qr_image_links ADD COLUMN purpose text NOT NULL DEFAULT 'visit',
 ADD COLUMN entry_query text NOT NULL DEFAULT '',
 ADD CONSTRAINT redirect_qr_image_purpose CHECK(purpose IN('visit','install') AND(purpose<>'install' OR link_id IS NOT NULL)),
 ADD CONSTRAINT redirect_qr_image_entry_query CHECK(octet_length(entry_query)<=2048 AND cardinality(string_to_array(entry_query,'&'))<=32 AND(purpose='install' OR entry_query='')
 AND(entry_query='' OR entry_query ~ '^([A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)(&[A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)*$')
 AND entry_query !~* '(^|&)(pw|password|qg_click_id|qg_handoff|qg_app_choice|qg_handoff_(token|app|action)|x-qg-handoff-(token|app|action))=');

CREATE OR REPLACE FUNCTION public.redirect_qr_image_link_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',id,'label',label,'purpose',purpose,'linkId',link_id,'version',version,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'style',style,'logoMode',logo_mode,'state',publication_state,'logoAsset',public.redirect_qr_asset_json(logo_asset_id))
 FROM public.redirect_qr_image_links WHERE id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.redirect_qr_image_resource(p_action text,p_actor uuid DEFAULT NULL,p_principal uuid DEFAULT NULL,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT NULL,p_hash text DEFAULT NULL,p_limit integer DEFAULT 100,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_principal_key text;member_id uuid;key_id uuid;allowed uuid[];link public.redirects;r public.redirect_qr_image_links;effective jsonb;overrides jsonb;url text;expires timestamptz;rows jsonb;next_id uuid;owner boolean:=p_principal IS NULL;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','list','revoke') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid QR image action' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF owner THEN
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  v_principal_key:='owner:'||p_actor::text;
 ELSE
  allowed:=public.redirect_management_scope(p_principal,'links:read');
  SELECT id INTO key_id FROM public.redirect_api_tokens WHERE id=p_principal;
  IF key_id IS NULL THEN
   SELECT id INTO member_id FROM public.redirect_workspace_members WHERE id=p_principal AND kind='user' AND user_id=p_actor AND active;
   IF member_id IS NULL THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
  END IF;
  v_principal_key:=CASE WHEN key_id IS NOT NULL THEN 'key:' ELSE 'member:' END||p_principal::text;
 END IF;
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid image page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_qr_image_link_json(id) ORDER BY id),'[]') INTO rows
  FROM(SELECT id FROM public.redirect_qr_image_links q WHERE(owner OR q.principal_key=v_principal_key) AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit) page;
  IF jsonb_array_length(rows)=p_limit THEN
   next_id:=(rows->(p_limit-1)->>'id')::uuid;
   IF NOT EXISTS(SELECT FROM public.redirect_qr_image_links q WHERE(owner OR q.principal_key=v_principal_key) AND id>next_id) THEN next_id:=NULL;END IF;
  END IF;
  RETURN jsonb_build_object('data',rows,'nextCursor',next_id);
 END IF;
 IF p_action='revoke' THEN
  IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['version']::text[]<>'{}' OR NOT(p_values?'version') THEN RAISE EXCEPTION 'Provide the current image version' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.redirect_qr_image_links q WHERE id=p_id AND(owner OR q.principal_key=v_principal_key) FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'QR image link not found' USING ERRCODE='P0002';END IF;
  IF r.version IS DISTINCT FROM (p_values->>'version')::uuid THEN RAISE EXCEPTION 'QR image link changed; reload before revoking' USING ERRCODE='23505';END IF;
  IF r.revoked_at IS NULL THEN UPDATE public.redirect_qr_image_links SET revoked_at=clock_timestamp(),version=gen_random_uuid() WHERE id=r.id;END IF;
  RETURN public.redirect_qr_image_link_json(r.id);
 END IF;
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['linkId','url','label','expiresAt','style','logoMode','purpose','entryQuery']::text[]<>'{}' OR ((p_values?'linkId')=(p_values?'url')) THEN RAISE EXCEPTION 'Choose a link or an explicit URL' USING ERRCODE='22023';END IF;
 IF p_values?'purpose' AND (jsonb_typeof(p_values->'purpose')<>'string' OR coalesce(p_values->>'purpose','') NOT IN('visit','install')) OR p_values->>'purpose'='install' AND NOT(p_values?'linkId') THEN RAISE EXCEPTION 'Choose visit or app installation for a managed link' USING ERRCODE='22023';END IF;
 IF p_values?'linkId' THEN
  SELECT * INTO link FROM public.redirects WHERE id=(p_values->>'linkId')::uuid AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
 ELSE
  IF NOT owner THEN RAISE EXCEPTION 'Explicit URL images require workspace owner access' USING ERRCODE='42501';END IF;
  url:=p_values->>'url';
  IF url IS NULL OR octet_length(url)>2048 OR url ~ '[[:space:][:cntrl:]]' OR url !~ '^https?://[^/@?#[:space:]]+([/?#]|$)' THEN RAISE EXCEPTION 'Provide an HTTP(S) URL without credentials up to 2048 bytes' USING ERRCODE='22023';END IF;
 END IF;
 IF p_values?'entryQuery' AND(jsonb_typeof(p_values->'entryQuery')<>'string' OR coalesce(p_values->>'purpose','visit')<>'install') THEN RAISE EXCEPTION 'Entry query requires app installation' USING ERRCODE='22023';END IF;
 IF cardinality(string_to_array(coalesce(p_values->>'entryQuery',''),'&'))>32 OR octet_length(coalesce(p_values->>'entryQuery',''))>2048 OR(coalesce(p_values->>'entryQuery','')<>'' AND p_values->>'entryQuery' !~ '^([A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)(&[A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)*$') OR coalesce(p_values->>'entryQuery','') ~* '(^|&)(pw|password|qg_click_id|qg_handoff|qg_app_choice|qg_handoff_(token|app|action)|x-qg-handoff-(token|app|action))=' THEN RAISE EXCEPTION 'Provide a public campaign query without credentials or handoff fields' USING ERRCODE='22023';END IF;
 IF p_values->>'purpose'='install' AND octet_length(public.redirect_management_link(link.id)->>'shortUrl')+octet_length(coalesce(p_values->>'entryQuery',''))+20>2048 THEN RAISE EXCEPTION 'Install entry URL exceeds 2048 bytes' USING ERRCODE='22023';END IF;
 IF p_values?'expiresAt' AND p_values->'expiresAt'<>'null'::jsonb THEN
  expires:=(p_values->>'expiresAt')::timestamptz;
  IF NOT isfinite(expires) OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Choose expiry within one year or no expiry' USING ERRCODE='22023';END IF;
 END IF;
 IF p_values?'label' AND(jsonb_typeof(p_values->'label')<>'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100) OR p_values?'logoMode' AND coalesce(p_values->>'logoMode','') NOT IN('inherit','none','custom') OR p_values?'style' AND jsonb_typeof(p_values->'style') NOT IN('object','null') THEN RAISE EXCEPTION 'Invalid image branding fields' USING ERRCODE='22023';END IF;
 IF coalesce(nullif(p_values->'style','null'::jsonb),'{}')-ARRAY['dots','border','center','foreground','background']::text[]<>'{}' THEN RAISE EXCEPTION 'Unknown image appearance field' USING ERRCODE='22023';END IF;
 overrides:=jsonb_strip_nulls(coalesce(nullif(p_values->'style','null'::jsonb),'{}'));
 effective:=public.redirect_qr_effective_style(link.domain_id)||overrides;
 IF NOT public.redirect_qr_style_valid(effective) THEN RAISE EXCEPTION 'Use supported shapes and dark-on-light colors with at least 4.5:1 contrast' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_qr_image_links q WHERE q.principal_key=v_principal_key AND revoked_at IS NULL AND(publication_state='published' OR draft_expires_at>clock_timestamp()) AND(expires_at IS NULL OR expires_at>clock_timestamp()))>=100 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log q WHERE q.principal_key=v_principal_key AND created_at>clock_timestamp()-interval '1 hour')>=60 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log WHERE created_at>clock_timestamp()-interval '1 hour')>=600 THEN
  RETURN jsonb_build_object('retryAfter',3600);
 END IF;
 INSERT INTO public.redirect_qr_image_links(token_hash,creator_user_id,creator_member_id,creator_key_id,principal_key,link_id,encoded_url,purpose,entry_query,label,style,logo_mode,expires_at,publication_state,draft_expires_at)
 VALUES(p_hash,CASE WHEN owner THEN p_actor END,member_id,key_id,v_principal_key,link.id,url,coalesce(p_values->>'purpose','visit'),coalesce(p_values->>'entryQuery',''),coalesce(btrim(p_values->>'label'),'QR image'),overrides,coalesce(p_values->>'logoMode','inherit'),expires,CASE WHEN p_values->>'logoMode'='custom' THEN 'pending' ELSE 'published' END,CASE WHEN p_values->>'logoMode'='custom' THEN clock_timestamp()+interval '15 minutes' END)
 RETURNING * INTO r;
 RETURN public.redirect_qr_image_link_json(r.id);
END $$;

CREATE OR REPLACE FUNCTION public.redirect_public_qr_image(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.redirect_qr_image_links;allowed uuid[];link public.redirects;url text;style jsonb;logo jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE token_hash=p_hash AND publication_state='published' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF r.id IS NULL THEN RETURN NULL;END IF;
 BEGIN
  IF r.creator_user_id IS NOT NULL THEN
   PERFORM 1 FROM public.user_roles WHERE user_id=r.creator_user_id AND role='admin' FOR SHARE;
   IF NOT FOUND THEN RETURN NULL;END IF;
  ELSE allowed:=public.redirect_management_scope(coalesce(r.creator_key_id,r.creator_member_id),'links:read');END IF;
 EXCEPTION WHEN insufficient_privilege THEN RETURN NULL;
 END;
 IF r.link_id IS NOT NULL THEN
  SELECT * INTO link FROM public.redirects WHERE id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RETURN NULL;END IF;
  url:=public.redirect_management_link(link.id)->>'shortUrl';
 ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=public.redirect_qr_effective_style(link.domain_id)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'Saved QR branding is invalid; review its settings' USING ERRCODE='22023';END IF;
 logo:=CASE WHEN r.logo_mode='none' THEN jsonb_build_object('effectiveLogo',NULL,'logoSource','hidden') WHEN r.logo_mode='custom' THEN jsonb_build_object('effectiveLogo',public.redirect_qr_asset_json(r.logo_asset_id),'logoSource','custom') ELSE public.redirect_qr_effective_logo(link.domain_id) END;
 IF r.logo_mode='custom' AND(logo->'effectiveLogo'='null'::jsonb OR logo->'effectiveLogo' IS NULL) THEN RAISE EXCEPTION 'Custom QR artwork is unavailable' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style)||logo;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_qr_image_logo(p_actor uuid,p_principal uuid,p_image uuid,p_version uuid,p_mime text,p_bytes integer,p_width integer,p_height integer,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.redirect_qr_image_links;asset public.redirect_qr_assets;domain uuid;style jsonb;url text;
BEGIN
 r:=public.redirect_qr_image_draft(p_actor,p_principal,p_image);
 IF r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'QR image draft changed; upload was not reserved' USING ERRCODE='23505';END IF;
 IF p_mime IS NULL OR p_mime NOT IN('image/png','image/jpeg') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 1500000 OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1024 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid logo metadata' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_qr_assets WHERE requested_principal=r.principal_key AND created_at>clock_timestamp()-interval '1 hour')>=60 OR
 (p_actor IS NOT NULL AND(SELECT count(*) FROM public.redirect_qr_assets WHERE requested_by=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=60) OR
 (SELECT count(*) FROM public.redirect_qr_assets WHERE created_at>clock_timestamp()-interval '1 hour')>=600 OR
 (SELECT count(*) FROM public.redirect_qr_assets WHERE qr_image_id=r.id AND state='pending' AND expires_at>clock_timestamp())>=3 THEN RETURN jsonb_build_object('retryAfter',900);END IF;
 IF r.link_id IS NOT NULL THEN SELECT domain_id INTO domain FROM public.redirects WHERE id=r.link_id;url:=public.redirect_management_link(r.link_id)->>'shortUrl';ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=public.redirect_qr_effective_style(domain)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'QR image branding is invalid' USING ERRCODE='22023';END IF;
 INSERT INTO public.redirect_qr_assets(target_scope,requested_by,requested_principal,qr_image_id,expected_version,mime,bytes,width,height,sha256,expires_at,next_cleanup_at)
 VALUES('image:'||r.id::text,p_actor,r.principal_key,r.id,r.version,p_mime,p_bytes,p_width,p_height,p_sha256,r.draft_expires_at,r.draft_expires_at) RETURNING * INTO asset;
 RETURN jsonb_build_object('id',asset.id,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END,'profile',jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style));
END $$;
