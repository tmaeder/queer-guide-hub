-- Scope private QR images/styles and saved reports/shares to the selected workspace.
-- Public token reads remain restricted to the sole active legacy workspace until
-- public tenant resolution and owner models are converted. Activation fences stay.

CREATE OR REPLACE FUNCTION public.redirect_qr_image_draft(p_actor uuid, p_principal uuid, p_image uuid)
 RETURNS redirect_qr_image_links
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_qr_image_links;allowed uuid[];key text;is_key boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'links:read');
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  key:='owner:'||p_actor::text;
 ELSE
  allowed:=public.redirect_management_scope(p_principal,'links:read');
  is_key:=EXISTS(SELECT FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal);
  IF NOT is_key AND NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND active AND user_id=p_actor) THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
  key:=CASE WHEN is_key THEN 'key:' ELSE 'member:' END||p_principal::text;
 END IF;
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE workspace_id=selected_workspace AND id=p_image AND principal_key=key AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR UPDATE;
 IF r.id IS NULL OR r.publication_state<>'pending' OR r.draft_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'QR image draft expired or is unavailable' USING ERRCODE='P0002';END IF;
 IF r.link_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirects WHERE workspace_id=selected_workspace AND id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed))) THEN RAISE EXCEPTION 'Link is no longer accessible' USING ERRCODE='42501';END IF;
 RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_image_resource(p_action text, p_actor uuid DEFAULT NULL::uuid, p_principal uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT NULL::jsonb, p_hash text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);v_principal_key text;member_id uuid;key_id uuid;allowed uuid[];link public.redirects;r public.redirect_qr_image_links;effective jsonb;overrides jsonb;url text;expires timestamptz;rows jsonb;next_id uuid;owner boolean:=p_principal IS NULL;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','list','revoke') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid QR image action' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF owner THEN
  PERFORM public.redirect_management_scope(NULL,'links:read');
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  v_principal_key:='owner:'||p_actor::text;
 ELSE
  allowed:=public.redirect_management_scope(p_principal,'links:read');
  SELECT id INTO key_id FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal;
  IF key_id IS NULL THEN
   SELECT id INTO member_id FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND user_id=p_actor AND active;
   IF member_id IS NULL THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
  END IF;
  v_principal_key:=CASE WHEN key_id IS NOT NULL THEN 'key:' ELSE 'member:' END||p_principal::text;
 END IF;
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid image page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_qr_image_link_json(id) ORDER BY id),'[]') INTO rows
  FROM(SELECT id FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND(owner OR q.principal_key=v_principal_key) AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit) page;
  IF jsonb_array_length(rows)=p_limit THEN
   next_id:=(rows->(p_limit-1)->>'id')::uuid;
   IF NOT EXISTS(SELECT FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND(owner OR q.principal_key=v_principal_key) AND id>next_id) THEN next_id:=NULL;END IF;
  END IF;
  RETURN jsonb_build_object('data',rows,'nextCursor',next_id);
 END IF;
 IF p_action='revoke' THEN
  IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['version']::text[]<>'{}' OR NOT(p_values?'version') THEN RAISE EXCEPTION 'Provide the current image version' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND id=p_id AND(owner OR q.principal_key=v_principal_key) FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'QR image link not found' USING ERRCODE='P0002';END IF;
  IF r.version IS DISTINCT FROM (p_values->>'version')::uuid THEN RAISE EXCEPTION 'QR image link changed; reload before revoking' USING ERRCODE='23505';END IF;
  IF r.revoked_at IS NULL THEN UPDATE public.redirect_qr_image_links SET revoked_at=clock_timestamp(),version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=r.id;END IF;
  RETURN public.redirect_qr_image_link_json(r.id);
 END IF;
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['linkId','url','label','expiresAt','style','logoMode','purpose','entryQuery']::text[]<>'{}' OR ((p_values?'linkId')=(p_values?'url')) THEN RAISE EXCEPTION 'Choose a link or an explicit URL' USING ERRCODE='22023';END IF;
 IF p_values?'purpose' AND (jsonb_typeof(p_values->'purpose')<>'string' OR coalesce(p_values->>'purpose','') NOT IN('visit','install')) OR p_values->>'purpose'='install' AND NOT(p_values?'linkId') THEN RAISE EXCEPTION 'Choose visit or app installation for a managed link' USING ERRCODE='22023';END IF;
 IF p_values?'linkId' THEN
  SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=(p_values->>'linkId')::uuid AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
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
 IF (SELECT count(*) FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND q.principal_key=v_principal_key AND revoked_at IS NULL AND(publication_state='published' OR draft_expires_at>clock_timestamp()) AND(expires_at IS NULL OR expires_at>clock_timestamp()))>=100 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log q WHERE q.workspace_id=selected_workspace AND q.principal_key=v_principal_key AND created_at>clock_timestamp()-interval '1 hour')>=60 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log WHERE created_at>clock_timestamp()-interval '1 hour')>=600 THEN
  RETURN jsonb_build_object('retryAfter',3600);
 END IF;
 INSERT INTO public.redirect_qr_image_links(workspace_id,token_hash,creator_user_id,creator_member_id,creator_key_id,principal_key,link_id,encoded_url,purpose,entry_query,label,style,logo_mode,expires_at,publication_state,draft_expires_at)
 VALUES(selected_workspace,p_hash,CASE WHEN owner THEN p_actor END,member_id,key_id,v_principal_key,link.id,url,coalesce(p_values->>'purpose','visit'),coalesce(p_values->>'entryQuery',''),coalesce(btrim(p_values->>'label'),'QR image'),overrides,coalesce(p_values->>'logoMode','inherit'),expires,CASE WHEN p_values->>'logoMode'='custom' THEN 'pending' ELSE 'published' END,CASE WHEN p_values->>'logoMode'='custom' THEN clock_timestamp()+interval '15 minutes' END)
 RETURNING * INTO r;
 RETURN public.redirect_qr_image_link_json(r.id);
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_qr_image_logo(p_actor uuid, p_principal uuid, p_image uuid, p_version uuid, p_mime text, p_bytes integer, p_width integer, p_height integer, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_qr_image_links;asset public.redirect_qr_assets;domain uuid;style jsonb;url text;
BEGIN
 r:=public.redirect_qr_image_draft(p_actor,p_principal,p_image);
 IF r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'QR image draft changed; upload was not reserved' USING ERRCODE='23505';END IF;
 IF p_mime IS NULL OR p_mime NOT IN('image/png','image/jpeg') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 1500000 OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1024 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid logo metadata' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND requested_principal=r.principal_key AND created_at>clock_timestamp()-interval '1 hour')>=60 OR
 (p_actor IS NOT NULL AND(SELECT count(*) FROM public.redirect_qr_assets WHERE requested_by=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=60) OR
 (SELECT count(*) FROM public.redirect_qr_assets WHERE created_at>clock_timestamp()-interval '1 hour')>=600 OR
 (SELECT count(*) FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND qr_image_id=r.id AND state='pending' AND expires_at>clock_timestamp())>=3 THEN RETURN jsonb_build_object('retryAfter',900);END IF;
 IF r.link_id IS NOT NULL THEN SELECT domain_id INTO domain FROM public.redirects WHERE workspace_id=selected_workspace AND id=r.link_id;url:=public.redirect_management_link(r.link_id)->>'shortUrl';ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=public.redirect_qr_effective_style(domain)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'QR image branding is invalid' USING ERRCODE='22023';END IF;
 INSERT INTO public.redirect_qr_assets(workspace_id,target_scope,requested_by,requested_principal,qr_image_id,expected_version,mime,bytes,width,height,sha256,expires_at,next_cleanup_at)
 VALUES(selected_workspace,'image:'||r.id::text,p_actor,r.principal_key,r.id,r.version,p_mime,p_bytes,p_width,p_height,p_sha256,r.draft_expires_at,r.draft_expires_at) RETURNING * INTO asset;
 RETURN jsonb_build_object('id',asset.id,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END,'profile',jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style));
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_qr_image_logo(p_actor uuid, p_principal uuid, p_image uuid, p_asset uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_qr_image_links;asset public.redirect_qr_assets;
BEGIN
 r:=public.redirect_qr_image_draft(p_actor,p_principal,p_image);
 SELECT * INTO asset FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND id=p_asset FOR UPDATE;
 IF asset.id IS NULL OR asset.state<>'pending' OR asset.qr_image_id IS DISTINCT FROM r.id OR asset.requested_principal IS DISTINCT FROM r.principal_key OR asset.target_scope<>'image:'||r.id::text OR asset.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Artwork reservation expired or does not match this draft' USING ERRCODE='22023';END IF;
 IF r.version IS DISTINCT FROM asset.expected_version THEN RAISE EXCEPTION 'QR image draft changed; upload was not attached' USING ERRCODE='23505';END IF;
 UPDATE public.redirect_qr_assets SET state='active',next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=selected_workspace AND id=asset.id;
 UPDATE public.redirect_qr_image_links SET logo_asset_id=asset.id,publication_state='published',draft_expires_at=NULL,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=r.id;
 RETURN public.redirect_qr_image_link_json(r.id);
END $function$;

CREATE OR REPLACE FUNCTION public.log_redirect_qr_image_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN INSERT INTO public.redirect_qr_image_creation_log(workspace_id,id,principal_key,created_at) VALUES(NEW.workspace_id,NEW.id,NEW.principal_key,NEW.created_at);RETURN NULL;END $function$;

CREATE OR REPLACE FUNCTION public.release_redirect_qr_image_artwork()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF OLD.logo_asset_id IS NOT NULL AND(TG_OP='DELETE' OR NEW.revoked_at IS NOT NULL OR NEW.logo_asset_id IS DISTINCT FROM OLD.logo_asset_id) THEN
  UPDATE public.redirect_qr_assets SET next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=OLD.workspace_id AND id=OLD.logo_asset_id AND state='active';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF NEW.revoked_at IS NOT NULL THEN NEW.logo_asset_id:=NULL;END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_image_link_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',id,'label',label,'purpose',purpose,'linkId',link_id,'version',version,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'style',style,'logoMode',logo_mode,'state',publication_state,'logoAsset',public.redirect_qr_asset_json(logo_asset_id))
 FROM public.redirect_qr_image_links WHERE workspace_id=public.redirect_request_workspace() AND id=p_id;
$function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_asset_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',id,'key',id::text||CASE WHEN mime='image/png' THEN '.png' ELSE '.jpg' END,'mime',mime,'bytes',bytes,'width',width,'height',height,'sha256',sha256)
 FROM public.redirect_qr_assets WHERE workspace_id=public.redirect_request_workspace() AND id=p_id AND state='active';
$function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_effective_style(p_domain uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT '{"dots":"square","border":"square","center":"square","foreground":"#111111","background":"#ffffff"}'::jsonb
 ||coalesce((SELECT style FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND scope='workspace'),'{}')
 ||coalesce((SELECT style FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND domain_id=p_domain),'{}');
$function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_style_json(p_domain uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('version',(SELECT version FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND scope=coalesce('domain:'||p_domain::text,'workspace')),
 'style',coalesce((SELECT style FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND scope=coalesce('domain:'||p_domain::text,'workspace')),'{}'),
 'effectiveStyle',public.redirect_qr_effective_style(p_domain),'domainId',p_domain,
 'logoMode',coalesce((SELECT logo_mode FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND scope=coalesce('domain:'||p_domain::text,'workspace')),'inherit'),
 'logoAsset',public.redirect_qr_asset_json((SELECT logo_asset_id FROM public.redirect_qr_styles WHERE workspace_id=public.redirect_request_workspace() AND scope=coalesce('domain:'||p_domain::text,'workspace'))))||public.redirect_qr_effective_logo(p_domain);
$function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_effective_logo(p_domain uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();r public.redirect_qr_styles;source text:='domain';asset jsonb;
BEGIN
 IF p_domain IS NOT NULL THEN SELECT * INTO r FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND domain_id=p_domain;END IF;
 IF r.scope IS NULL OR r.logo_mode='inherit' THEN SELECT * INTO r FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND scope='workspace';source:='workspace';END IF;
 IF r.logo_mode='none' THEN RETURN jsonb_build_object('effectiveLogo',NULL,'logoSource','hidden');END IF;
 IF r.logo_mode='custom' THEN
  asset:=public.redirect_qr_asset_json(r.logo_asset_id);
  IF asset IS NULL THEN RAISE EXCEPTION 'Saved QR logo is unavailable; review owner logo settings' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('effectiveLogo',asset,'logoSource',source);
 END IF;
 RETURN jsonb_build_object('effectiveLogo',NULL,'logoSource','default');
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_style_resource(p_actor uuid, p_domain uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);key text:=coalesce('domain:'||p_domain::text,'workspace');r public.redirect_qr_styles;next_style jsonb;candidate uuid;next_mode text;next_asset uuid;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 IF p_domain IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_domain) THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 SELECT * INTO r FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND scope=key FOR UPDATE;
 IF p_values IS NOT NULL AND p_values<>'null'::jsonb THEN
  IF jsonb_typeof(p_values)<>'object' OR NOT(p_values?'version') OR NOT(p_values?'style' OR p_values?'logoMode' OR p_values?'clearLogo') OR p_values-ARRAY['version','style','logoMode','clearLogo']::text[]<>'{}' OR p_values?'style' AND jsonb_typeof(p_values->'style') NOT IN('object','null') OR p_values?'logoMode' AND coalesce(p_values->>'logoMode','') NOT IN('inherit','none','custom') OR p_values?'clearLogo' AND jsonb_typeof(p_values->'clearLogo')<>'boolean' THEN RAISE EXCEPTION 'Provide the current version and appearance overrides' USING ERRCODE='22023';END IF;
  IF r.version IS DISTINCT FROM (p_values->>'version')::uuid THEN RAISE EXCEPTION 'QR style changed; reload before saving' USING ERRCODE='23505';END IF;
  IF jsonb_typeof(p_values->'style')='object' AND (p_values->'style')-ARRAY['dots','border','center','foreground','background']::text[]<>'{}' THEN RAISE EXCEPTION 'Unknown QR appearance field' USING ERRCODE='22023';END IF;
  next_style:=CASE WHEN NOT(p_values?'style') THEN coalesce(r.style,'{}') WHEN p_values->'style'='null'::jsonb THEN '{}'::jsonb ELSE jsonb_strip_nulls(coalesce(r.style,'{}')||(p_values->'style')) END;
  next_asset:=CASE WHEN coalesce((p_values->>'clearLogo')::boolean,false) THEN NULL ELSE r.logo_asset_id END;
  next_mode:=coalesce(p_values->>'logoMode',CASE WHEN coalesce((p_values->>'clearLogo')::boolean,false) THEN 'inherit' ELSE r.logo_mode END,'inherit');
  IF next_mode='custom' AND (next_asset IS NULL OR NOT EXISTS(SELECT FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND id=next_asset AND state='active' AND target_scope=key)) THEN RAISE EXCEPTION 'Upload a logo for this scope before choosing custom' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_qr_styles(workspace_id,scope,domain_id,style,logo_mode,logo_asset_id) VALUES(selected_workspace,key,p_domain,next_style,next_mode,next_asset)
  ON CONFLICT(scope) DO UPDATE SET style=excluded.style,logo_mode=excluded.logo_mode,logo_asset_id=excluded.logo_asset_id,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE redirect_qr_styles.workspace_id=selected_workspace RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR style is unavailable in this workspace' USING ERRCODE='23505';END IF;
  IF NOT public.redirect_qr_style_valid(public.redirect_qr_effective_style()) THEN RAISE EXCEPTION 'Use supported shapes and dark-on-light colors with at least 4.5:1 contrast' USING ERRCODE='22023';END IF;
  FOR candidate IN SELECT domain_id FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND domain_id IS NOT NULL LOOP
   IF NOT public.redirect_qr_style_valid(public.redirect_qr_effective_style(candidate)) THEN RAISE EXCEPTION 'An effective domain QR style is invalid; adjust its overrides or choose stronger contrast' USING ERRCODE='22023';END IF;
  END LOOP;
 END IF;
 RETURN public.redirect_qr_style_json(p_domain);
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_qr_logo(p_actor uuid, p_domain uuid, p_version uuid, p_mime text, p_bytes integer, p_width integer, p_height integer, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);key text:=coalesce('domain:'||p_domain::text,'workspace');current_version uuid;asset public.redirect_qr_assets;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 IF p_domain IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_domain) THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 SELECT version INTO current_version FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND scope=key FOR UPDATE;
 IF EXISTS(SELECT FROM public.redirect_qr_styles WHERE scope=key AND workspace_id<>selected_workspace) THEN RAISE EXCEPTION 'QR style is unavailable in this workspace' USING ERRCODE='23505';END IF;
 IF current_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'QR style changed; reload before uploading' USING ERRCODE='23505';END IF;
 IF p_mime IS NULL OR p_mime NOT IN('image/png','image/jpeg') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 1500000 OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1024 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid logo metadata' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_qr_assets WHERE requested_by=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=60 OR (SELECT count(*) FROM public.redirect_qr_assets WHERE created_at>clock_timestamp()-interval '1 hour')>=600 OR (SELECT count(*) FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND target_scope=key AND state='pending' AND expires_at>clock_timestamp())>=3 THEN RETURN jsonb_build_object('retryAfter',900);END IF;
 INSERT INTO public.redirect_qr_assets(workspace_id,target_scope,domain_id,requested_by,expected_version,mime,bytes,width,height,sha256) VALUES(selected_workspace,key,p_domain,p_actor,p_version,p_mime,p_bytes,p_width,p_height,p_sha256) RETURNING * INTO asset;
 RETURN jsonb_build_object('id',asset.id,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END);
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_qr_logo(p_actor uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);asset public.redirect_qr_assets;current_version uuid;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 SELECT * INTO asset FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF asset.id IS NULL OR asset.requested_by IS DISTINCT FROM p_actor OR asset.state<>'pending' OR asset.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Upload reservation expired; reload and upload again' USING ERRCODE='22023';END IF;
 IF asset.target_scope<>coalesce('domain:'||asset.domain_id::text,'workspace') THEN RAISE EXCEPTION 'Upload scope no longer exists' USING ERRCODE='P0002';END IF;
 SELECT version INTO current_version FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND scope=asset.target_scope FOR UPDATE;
 IF current_version IS DISTINCT FROM asset.expected_version THEN RAISE EXCEPTION 'QR style changed; upload was not attached' USING ERRCODE='23505';END IF;
 UPDATE public.redirect_qr_assets SET state='active',next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=selected_workspace AND id=asset.id;
 INSERT INTO public.redirect_qr_styles(workspace_id,scope,domain_id,logo_mode,logo_asset_id) VALUES(selected_workspace,asset.target_scope,asset.domain_id,'custom',asset.id)
 ON CONFLICT(scope) DO UPDATE SET logo_mode='custom',logo_asset_id=excluded.logo_asset_id,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE redirect_qr_styles.workspace_id=selected_workspace;
 IF NOT FOUND THEN RAISE EXCEPTION 'QR style is unavailable in this workspace' USING ERRCODE='23505';END IF;
 RETURN public.redirect_qr_style_json(asset.domain_id);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_styles_for_links(p_ids uuid[], p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[];link public.redirects;link_id uuid;result jsonb:='[]';
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 allowed:=public.redirect_management_scope(p_token_id,'links:read');
 IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 100 OR array_position(p_ids,NULL) IS NOT NULL OR cardinality(p_ids)<>(SELECT count(DISTINCT value) FROM unnest(p_ids) value) THEN RAISE EXCEPTION 'Choose 1–100 distinct link IDs' USING ERRCODE='22023';END IF;
 FOREACH link_id IN ARRAY p_ids LOOP
  SELECT * INTO link FROM public.redirects WHERE redirects.workspace_id=selected_workspace AND redirects.id=link_id AND type='SHORT' AND(allowed IS NULL OR redirects.id=ANY(allowed));
  IF link.id IS NULL THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
  result:=result||jsonb_build_array(jsonb_build_object('id',link.id,'style',public.redirect_qr_effective_style(link.domain_id),
   'source',CASE WHEN EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND domain_id=link.domain_id AND style<>'{}') THEN 'domain' WHEN EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND scope='workspace' AND style<>'{}') THEN 'workspace' ELSE 'default' END)||public.redirect_qr_effective_logo(link.domain_id));
 END LOOP;
 RETURN result;
END $function$;

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
   PERFORM 1 FROM public.user_roles WHERE user_id=r.creator_user_id AND role='admin' FOR SHARE;
   IF NOT FOUND THEN RETURN NULL;END IF;
  ELSE allowed:=public.redirect_management_scope(coalesce(r.creator_key_id,r.creator_member_id),'links:read');END IF;
 EXCEPTION WHEN insufficient_privilege THEN RETURN NULL;
 END;
 IF r.link_id IS NOT NULL THEN
  SELECT * INTO link FROM public.redirects WHERE workspace_id=r.workspace_id AND id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RETURN NULL;END IF;
  url:=public.redirect_management_link(link.id)->>'shortUrl';
 ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=public.redirect_qr_effective_style(link.domain_id)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'Saved QR branding is invalid; review its settings' USING ERRCODE='22023';END IF;
 logo:=CASE WHEN r.logo_mode='none' THEN jsonb_build_object('effectiveLogo',NULL,'logoSource','hidden') WHEN r.logo_mode='custom' THEN jsonb_build_object('effectiveLogo',public.redirect_qr_asset_json(r.logo_asset_id),'logoSource','custom') ELSE public.redirect_qr_effective_logo(link.domain_id) END;
 IF r.logo_mode='custom' AND(logo->'effectiveLogo'='null'::jsonb OR logo->'effectiveLogo' IS NULL) THEN RAISE EXCEPTION 'Custom QR artwork is unavailable' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style)||logo;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_report_actor(p_actor uuid, p_principal uuid, p_write boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);
BEGIN
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'events:read');
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM public.redirect_management_scope(p_principal,'events:read');
  IF NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND user_id=p_actor AND kind='user' AND active) THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_saved_report_resource(p_action text, p_actor uuid, p_principal uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_saved_reports;result jsonb;allowed uuid[];view_mode text;can_publish boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','get','create','patch','delete','run') THEN RAISE EXCEPTION 'Invalid report action' USING ERRCODE='22023';END IF;
 PERFORM public.redirect_report_actor(p_actor,p_principal,p_action IN('create','patch','delete'));
 can_publish:=EXISTS(SELECT FROM public.user_roles WHERE user_id=p_actor AND role='admin');
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid report page' USING ERRCODE='22023';END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['view']::text[]<>'{}' OR p_values?'view' AND(jsonb_typeof(p_values->'view')<>'string' OR coalesce(p_values->>'view','') NOT IN('personal','team','all')) THEN RAISE EXCEPTION 'Invalid report view' USING ERRCODE='22023';END IF;
  view_mode:=coalesce(p_values->>'view','personal');
  WITH all_rows AS MATERIALIZED(SELECT * FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND((view_mode IN('personal','all') AND owner_user_id=p_actor) OR(view_mode IN('team','all') AND visibility='team' AND EXISTS(SELECT FROM public.user_roles WHERE user_id=owner_user_id AND role='admin')))),
  page AS MATERIALIZED(SELECT * FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce(jsonb_agg((CASE WHEN owner_user_id=p_actor THEN to_jsonb(shown) ELSE to_jsonb(shown)-'owner_user_id' END)||jsonb_build_object('canEdit',owner_user_id=p_actor) ORDER BY id),'[]'::jsonb),'canPublishToTeam',can_publish,'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN max(id::text) ELSE NULL END) INTO result FROM shown;
  RETURN result;
 END IF;
 IF p_action<>'create' THEN
  SELECT * INTO r FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND id=p_id AND(owner_user_id=p_actor OR(p_action IN('get','run') AND visibility='team' AND EXISTS(SELECT FROM public.user_roles WHERE user_id=owner_user_id AND role='admin')));
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002';END IF;
 END IF;
 IF p_action='get' THEN RETURN(CASE WHEN r.owner_user_id=p_actor THEN to_jsonb(r) ELSE to_jsonb(r)-'owner_user_id' END)||jsonb_build_object('canEdit',r.owner_user_id=p_actor);END IF;
 IF p_action='run' THEN allowed:=public.redirect_management_scope(p_principal,'events:read');SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO allowed FROM public.redirects WHERE workspace_id=selected_workspace AND(allowed IS NULL OR id=ANY(allowed));RETURN public.redirect_analytics_report(r.filters,allowed);END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND id=r.id;RETURN jsonb_build_object('id',r.id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['name','filters','version','visibility']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid report fields' USING ERRCODE='22023';END IF;
 IF p_action='patch' AND (p_values->>'version')::uuid IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Report changed; reload before saving' USING ERRCODE='23505';END IF;
 IF p_values?'visibility' AND(jsonb_typeof(p_values->'visibility')<>'string' OR coalesce(p_values->>'visibility','') NOT IN('private','team')) THEN RAISE EXCEPTION 'Invalid report visibility' USING ERRCODE='22023';END IF;
 IF coalesce(p_values->>'visibility',r.visibility,'private')='team' AND NOT can_publish THEN RAISE EXCEPTION 'Workspace owner required to publish a team report' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_saved_reports(workspace_id,owner_user_id,name,filters,visibility) VALUES(selected_workspace,p_actor,btrim(p_values->>'name'),p_values->'filters',coalesce(p_values->>'visibility','private')) RETURNING * INTO r;
 ELSE
  UPDATE public.redirect_saved_reports SET visibility=coalesce(p_values->>'visibility',visibility),name=CASE WHEN p_values?'name' THEN btrim(p_values->>'name') ELSE name END,filters=CASE WHEN p_values?'filters' THEN p_values->'filters' ELSE filters END,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=r.id RETURNING * INTO r;
 END IF;
 -- Validate SQL filter semantics without exposing any unscoped data.
 PERFORM public.redirect_analytics_report(r.filters,ARRAY[]::uuid[]);
 RETURN to_jsonb(r)||jsonb_build_object('canEdit',true);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_report_share_ids(p_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();s public.redirect_report_shares;principal uuid;allowed uuid[];ids uuid[];owner boolean:=false;
BEGIN
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id=selected_workspace AND id=p_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=s.owner_user_id AND role='admin' FOR SHARE;
 owner:=FOUND;
 IF NOT owner THEN
  IF s.requires_workspace_owner THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  SELECT id INTO principal FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND user_id=s.owner_user_id AND active AND kind='user' AND role='member' FOR SHARE;
  IF principal IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  allowed:=public.redirect_management_scope(principal,'events:read');
 END IF;
 SELECT coalesce(array_agg(d.id),ARRAY[]::uuid[]) INTO ids FROM public.redirects d LEFT JOIN public.redirect_link_metadata m ON m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||d.id::text
 WHERE d.workspace_id=selected_workspace AND d.type='SHORT' AND (s.scope_mode='folder' OR d.id=ANY(s.link_ids))
 AND (allowed IS NULL OR d.id=ANY(allowed)) AND (owner OR public.redirect_folder_rank(principal,m.folder_id)>=2)
 AND (NOT(s.filters?'folderId') OR m.folder_id=(s.filters->>'folderId')::uuid)
 AND (NOT(s.filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||d.id::text AND t.tag_id=(s.filters->>'tagId')::uuid))
 AND (NOT(s.filters?'linkIds') OR d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(s.filters->'linkIds')));
 IF NOT owner AND cardinality(ids)=0 THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 RETURN ids;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_report_share_resource(p_action text, p_actor uuid, p_principal uuid, p_report uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_password_hash jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_saved_reports;s public.redirect_report_shares;ids uuid[];allowed uuid[];requires_owner boolean;result jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','create','revoke') THEN RAISE EXCEPTION 'Invalid share action' USING ERRCODE='22023';END IF;
 PERFORM public.redirect_report_actor(p_actor,p_principal,p_action<>'list');
 SELECT * INTO r FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND id=p_report AND owner_user_id=p_actor;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002';END IF;
 IF p_action='list' THEN
  SELECT jsonb_build_object('data',coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'scopeMode',scope_mode,'linkCount',cardinality(link_ids),'allowIndexing',allow_indexing,'includeConversions',include_conversions,'hasPassword',password_hash IS NOT NULL,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at) ORDER BY created_at DESC,id),'[]'::jsonb)) INTO result FROM public.redirect_report_shares WHERE workspace_id=selected_workspace AND report_id=r.id;
  RETURN result;
 END IF;
 IF p_action='revoke' THEN
  UPDATE public.redirect_report_shares SET revoked_at=coalesce(revoked_at,clock_timestamp()),version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=p_id AND report_id=r.id RETURNING * INTO s;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Share not found' USING ERRCODE='P0002';END IF;
  RETURN jsonb_build_object('id',s.id,'revoked',true);
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['title','reportVersion','includeConversions','expiresAt','scopeMode','allowIndexing']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid share fields' USING ERRCODE='22023';END IF;
 IF (p_values->>'reportVersion')::uuid IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Report changed; review before sharing' USING ERRCODE='23505';END IF;
 requires_owner:=NOT(r.filters?'linkIds' AND jsonb_array_length(r.filters->'linkIds')=1 AND NOT(r.filters?'folderId') AND NOT(r.filters?'tagId'));
 IF requires_owner AND p_principal IS NOT NULL THEN RAISE EXCEPTION 'Workspace owners must publish folder or multi-link reports' USING ERRCODE='42501';END IF;
 IF p_principal IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND role='member') THEN RAISE EXCEPTION 'Edit access is required to publish' USING ERRCODE='42501';END IF;
 allowed:=public.redirect_management_scope(p_principal,'links:write');
 SELECT coalesce(array_agg(d.id),ARRAY[]::uuid[]) INTO ids FROM public.redirects d LEFT JOIN public.redirect_link_metadata m ON m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||d.id::text
 WHERE d.workspace_id=selected_workspace AND d.type='SHORT' AND (allowed IS NULL OR d.id=ANY(allowed))
 AND (NOT(r.filters?'linkIds') OR d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(r.filters->'linkIds')))
 AND (NOT(r.filters?'folderId') OR m.folder_id=(r.filters->>'folderId')::uuid)
 AND (NOT(r.filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||d.id::text AND t.tag_id=(r.filters->>'tagId')::uuid));
 IF cardinality(ids)=0 AND coalesce(p_values->>'scopeMode','snapshot')<>'folder' THEN RAISE EXCEPTION 'Choose links you can edit before publishing' USING ERRCODE='42501';END IF;
 IF (p_values->>'scopeMode')='folder' AND (p_principal IS NOT NULL OR NOT(r.filters?'folderId') OR r.filters?'linkIds') THEN RAISE EXCEPTION 'Dynamic folder sharing requires a workspace owner and folder filter' USING ERRCODE='42501';END IF;
 IF NOT coalesce((p_values->>'includeConversions')::boolean,false) AND r.filters->>'event' IN('lead','sale') THEN RAISE EXCEPTION 'Enable conversion sharing or choose a click report' USING ERRCODE='22023';END IF;
 IF coalesce((p_values->>'allowIndexing')::boolean,false) AND nullif(p_password_hash,'null'::jsonb) IS NOT NULL THEN RAISE EXCEPTION 'Password-protected dashboards cannot be indexed' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_report_shares WHERE workspace_id=selected_workspace AND report_id=r.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))>=20 THEN RAISE EXCEPTION 'Revoke an existing share before creating another' USING ERRCODE='22023';END IF;
 INSERT INTO public.redirect_report_shares(workspace_id,report_id,owner_user_id,title,filters,link_ids,requires_workspace_owner,scope_mode,include_conversions,password_hash,expires_at,allow_indexing)
 VALUES(selected_workspace,r.id,p_actor,btrim(p_values->>'title'),r.filters,ids,requires_owner,coalesce(p_values->>'scopeMode','snapshot'),coalesce((p_values->>'includeConversions')::boolean,false),nullif(p_password_hash,'null'::jsonb),(p_values->>'expiresAt')::timestamptz,coalesce((p_values->>'allowIndexing')::boolean,false)) RETURNING * INTO s;
 RETURN jsonb_build_object('id',s.id,'title',s.title,'linkCount',cardinality(s.link_ids),'scopeMode',s.scope_mode,'allowIndexing',s.allow_indexing,'includeConversions',s.include_conversions,'hasPassword',s.password_hash IS NOT NULL,'expiresAt',s.expires_at);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_public_report_check(p_id uuid, p_client_hash text, p_password_attempt boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.redirect_report_shares;retry integer;bucket text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND id=p_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
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
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_public_report_read(p_id uuid, p_version uuid, p_password_verified boolean, p_dates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.redirect_report_shares;ids uuid[];filters jsonb;key text;value text;
 earliest timestamptz;latest timestamptz;selected_start timestamptz;selected_end timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND id=p_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
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
 'report',public.redirect_analytics_report(filters,ids));
END $function$;
