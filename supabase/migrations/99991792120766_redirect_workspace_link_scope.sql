-- Scope managed links and their private inventory/policy/preview operations.
-- Static and automatic CMS inventory remains the explicit legacy workspace.
-- Tenant activation fences remain intact.

CREATE OR REPLACE FUNCTION public.redirect_inventory_records(p_manifest jsonb)
RETURNS TABLE(key text,row_id text,data jsonb) LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();
BEGIN
 RETURN QUERY SELECT v.key,v.row_id,v.data FROM public.redirect_inventory_database v
 WHERE CASE WHEN v.key LIKE 'redirects:%' THEN EXISTS(SELECT FROM public.redirects r WHERE r.id=(v.data->>'manualId')::uuid AND r.workspace_id=selected_workspace)
 ELSE selected_workspace='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid END
 UNION ALL SELECT value->>'id',value->>'id',value FROM jsonb_array_elements(p_manifest)
 WHERE selected_workspace='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND value->>'id' NOT LIKE 'redirects:%';
END $$;

CREATE OR REPLACE FUNCTION public.redirect_inventory_rank(p_principal uuid, p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();selected uuid[]; folder uuid; member uuid;
BEGIN
 IF p_key LIKE 'redirects:%' AND (p_key !~* '^redirects:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR NOT EXISTS(SELECT FROM public.redirects WHERE id::text=substring(p_key FROM 11) AND workspace_id=selected_workspace)) THEN RETURN 0;END IF;
 IF p_principal IS NOT NULL THEN
  SELECT redirect_ids INTO selected FROM public.redirect_api_tokens WHERE id=p_principal AND workspace_id=selected_workspace;
  IF selected IS NOT NULL AND NOT EXISTS(SELECT FROM unnest(selected) s WHERE p_key='redirects:'||s::text) THEN RETURN 0;END IF;
 END IF;
 member:=public.redirect_principal_member(p_principal);
 IF member IS NULL THEN PERFORM public.redirect_management_scope(p_principal,'links:read');RETURN 3;END IF;
 SELECT folder_id INTO folder FROM public.redirect_link_metadata WHERE redirect_key=p_key AND workspace_id=selected_workspace;
 RETURN public.redirect_folder_rank(member,folder);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_inventory_page(p_manifest jsonb, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after text DEFAULT NULL::text, p_principal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM public.redirect_management_scope(p_principal,'links:read');
 IF p_manifest IS NULL OR jsonb_typeof(p_manifest)<>'array' OR jsonb_array_length(p_manifest)>2000 OR p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_limit IS NULL OR p_limit NOT BETWEEN 0 AND 100 OR length(p_after)>4096 THEN RAISE EXCEPTION 'Invalid inventory page' USING ERRCODE='22023';END IF;
 WITH visible AS MATERIALIZED(
  SELECT r.*,m.folder_id,m.comment,m.is_archived,m.metadata_revision AS metadata_version FROM public.redirect_inventory_records(p_manifest) r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key=r.key AND m.workspace_id=selected_workspace
  WHERE public.redirect_inventory_rank(p_principal,r.key)>=1
   AND (NOT(p_filters?'excludeManaged') OR NOT coalesce((p_filters->>'excludeManaged')::boolean,false) OR NOT coalesce((r.data->>'isShortLink')::boolean,false))
   AND (NOT(p_filters?'search') OR strpos(lower(coalesce(r.data->>'source','')||' '||coalesce(r.data->>'target','')),lower(p_filters->>'search'))>0)
   AND (NOT(p_filters?'folderId') OR m.folder_id=(p_filters->>'folderId')::uuid)
   AND (NOT(p_filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key=r.key AND t.tag_id=(p_filters->>'tagId')::uuid))
   AND (NOT(p_filters?'origin') OR r.data->>'origin'=p_filters->>'origin')
   AND (NOT(p_filters?'kind') OR r.data->>'kind'=p_filters->>'kind')
   AND (NOT(p_filters?'isArchived') OR coalesce(m.is_archived,false)=(p_filters->>'isArchived')::boolean)
   AND (NOT(p_filters?'domainId') OR (p_filters->'domainId'='null' AND r.data->>'domainId' IS NULL) OR r.data->>'domainId'=p_filters->>'domainId')
 ), page AS MATERIALIZED(SELECT * FROM visible WHERE p_after IS NULL OR row_id COLLATE "C">p_after COLLATE "C" ORDER BY row_id COLLATE "C" LIMIT p_limit+1), shown AS MATERIALIZED(SELECT * FROM page ORDER BY row_id COLLATE "C" LIMIT p_limit)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'data',coalesce((SELECT jsonb_agg(data||jsonb_build_object('rowId',row_id,'folderId',folder_id,'comment',coalesce(comment,''),'isArchived',coalesce(is_archived,false),'metadataVersion',metadata_version,'canEditMetadata',public.redirect_inventory_rank(p_principal,key)>=2,'tagIds',coalesce((SELECT jsonb_agg(tag_id ORDER BY tag_id) FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key=shown.key),'[]')) ORDER BY row_id COLLATE "C") FROM shown),'[]'),'nextCursor',CASE WHEN p_limit>0 AND (SELECT count(*) FROM page)>p_limit THEN (SELECT row_id FROM shown ORDER BY row_id COLLATE "C" DESC LIMIT 1) END) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_inventory_metadata(p_manifest jsonb, p_key text, p_values jsonb DEFAULT NULL::jsonb, p_expected uuid DEFAULT NULL::uuid, p_principal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();saved public.redirect_link_metadata; folder uuid; member uuid; tags uuid[];
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM public.redirect_management_scope(p_principal,CASE WHEN p_values IS NULL THEN 'links:read' ELSE 'links:write' END);
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 4096 OR NOT EXISTS(SELECT FROM public.redirect_inventory_records(p_manifest) WHERE key=p_key) OR public.redirect_inventory_rank(p_principal,p_key)<(CASE WHEN p_values IS NULL THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Inventory record unavailable' USING ERRCODE='P0002';END IF;
 IF p_values IS NULL THEN SELECT * INTO saved FROM public.redirect_link_metadata WHERE workspace_id=selected_workspace AND redirect_key=p_key;
 ELSE
  IF jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('folderId','tagIds','comment','isArchived')) THEN RAISE EXCEPTION 'Invalid inventory metadata fields' USING ERRCODE='22023';END IF;
  SELECT * INTO saved FROM public.redirect_link_metadata WHERE workspace_id=selected_workspace AND redirect_key=p_key FOR UPDATE;
  IF saved.metadata_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Inventory metadata changed; reload before saving' USING ERRCODE='23505';END IF;
  member:=public.redirect_principal_member(p_principal);
  folder:=saved.folder_id;
  IF p_values?'folderId' THEN
   IF p_values->'folderId'<>'null' AND jsonb_typeof(p_values->'folderId')<>'string' THEN RAISE EXCEPTION 'Invalid folder ID' USING ERRCODE='22023';END IF;
   folder:=(p_values->>'folderId')::uuid;
   IF public.redirect_folder_rank(member,folder)<2 THEN RAISE EXCEPTION 'Destination folder edit access required' USING ERRCODE='42501';END IF;
  END IF;
  IF p_values?'comment' AND (jsonb_typeof(p_values->'comment')<>'string' OR length(p_values->>'comment')>10000) OR p_values?'isArchived' AND jsonb_typeof(p_values->'isArchived')<>'boolean' THEN RAISE EXCEPTION 'Invalid comment or archive flag' USING ERRCODE='22023';END IF;
  IF p_values?'tagIds' THEN
   IF jsonb_typeof(p_values->'tagIds')<>'array' OR jsonb_array_length(p_values->'tagIds')>100 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'tagIds') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023';END IF;
   SELECT coalesce(array_agg(DISTINCT value::uuid),ARRAY[]::uuid[]) INTO tags FROM jsonb_array_elements_text(p_values->'tagIds');
   IF EXISTS(SELECT FROM unnest(tags) t WHERE NOT EXISTS(SELECT FROM public.redirect_link_tags WHERE id=t AND workspace_id=selected_workspace)) THEN RAISE EXCEPTION 'Tag not found' USING ERRCODE='23503';END IF;
  END IF;
  INSERT INTO public.redirect_link_metadata AS m(workspace_id,redirect_key,folder_id,comment,is_archived) VALUES(selected_workspace,p_key,folder,coalesce(p_values->>'comment',saved.comment,''),coalesce((p_values->>'isArchived')::boolean,saved.is_archived,false))
  ON CONFLICT(redirect_key) DO UPDATE SET folder_id=excluded.folder_id,comment=excluded.comment,is_archived=excluded.is_archived,updated_at=clock_timestamp()
  WHERE m.workspace_id=selected_workspace AND m.metadata_revision IS NOT DISTINCT FROM p_expected RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory metadata changed; reload before saving' USING ERRCODE='23505';END IF;
  IF tags IS NOT NULL THEN
   DELETE FROM public.redirect_link_tag_assignments WHERE workspace_id=selected_workspace AND redirect_key=p_key;
   INSERT INTO public.redirect_link_tag_assignments(workspace_id,redirect_key,tag_id) SELECT selected_workspace,p_key,value FROM unnest(tags) value;
  END IF;
 END IF;
 RETURN jsonb_build_object('id',p_key,'folderId',saved.folder_id,'comment',coalesce(saved.comment,''),'isArchived',coalesce(saved.is_archived,false),'metadataVersion',saved.metadata_revision,'canEditMetadata',public.redirect_inventory_rank(p_principal,p_key)>=2,'tagIds',coalesce((SELECT jsonb_agg(tag_id ORDER BY tag_id) FROM public.redirect_link_tag_assignments WHERE workspace_id=selected_workspace AND redirect_key=p_key),'[]'));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_management_link(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH context AS MATERIALIZED(SELECT public.redirect_request_workspace() AS workspace)
 SELECT jsonb_build_object('id',r.id,'slug',r.slug,'target',r.target,'statusCode',r.status_code,
  'startsAt',r.start_at,'clickLimit',r.click_limit,'isEnabled',r.is_enabled,'isArchived',coalesce(m.is_archived,false),'queryMode',r.query_mode,'queryOverride',r.query_override,'utmDefaults',r.utm_defaults,
  'notes',r.notes,'expiresAt',r.end_at,'clicks',r.click_count,'updatedAt',r.updated_at,
  'isDomainRoot',r.is_domain_root,'domainId',r.domain_id,'domainHostname',r.domain_hostname,
  'shortUrl',CASE WHEN r.domain_id IS NULL THEN 'https://queer.guide/go/'||r.slug ELSE 'https://'||r.domain_hostname||'/'||CASE WHEN r.is_domain_root THEN '' ELSE r.slug END END,'folderId',m.folder_id,'comment',coalesce(m.comment,''),
  'tagIds',coalesce((SELECT jsonb_agg(a.tag_id ORDER BY a.tag_id) FROM public.redirect_link_tag_assignments a WHERE a.workspace_id=context.workspace AND a.redirect_key='redirects:'||r.id::text),'[]'::jsonb))
 FROM context CROSS JOIN public.redirects r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key='redirects:'||r.id::text AND m.workspace_id=context.workspace
 WHERE r.workspace_id=context.workspace AND r.id=p_id AND r.type='SHORT'
$function$;

CREATE OR REPLACE FUNCTION public.redirect_management_list(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[]; result jsonb;
BEGIN
 allowed:=public.redirect_management_scope(p_token_id,'links:read');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 0 AND 100 OR p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' THEN RAISE EXCEPTION 'Invalid link page' USING ERRCODE='22023'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT r.id FROM public.redirects r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key='redirects:'||r.id::text AND m.workspace_id=selected_workspace
  WHERE r.workspace_id=selected_workspace AND r.type='SHORT' AND (allowed IS NULL OR r.id=ANY(allowed))
   AND (NOT(p_filters?'domainId') OR r.domain_id IS NOT DISTINCT FROM (p_filters->>'domainId')::uuid)
   AND (NOT(p_filters?'ids') OR r.id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_filters->'ids')))
   AND (NOT(p_filters?'search') OR strpos(lower(coalesce(r.slug,'')||' '||r.target),lower(p_filters->>'search'))>0)
   AND (NOT(p_filters?'isArchived') OR coalesce(m.is_archived,false)=(p_filters->>'isArchived')::boolean)
   AND (NOT(p_filters?'isEnabled') OR r.is_enabled=(p_filters->>'isEnabled')::boolean)
   AND (NOT(p_filters?'folderId') OR m.folder_id=(p_filters->>'folderId')::uuid)
   AND (NOT(p_filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments a WHERE a.workspace_id=selected_workspace AND a.redirect_key='redirects:'||r.id::text AND a.tag_id=(p_filters->>'tagId')::uuid))
 ), page AS MATERIALIZED(SELECT id FROM filtered WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),
 shown AS MATERIALIZED(SELECT id FROM page ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM filtered),
  'data',coalesce((SELECT jsonb_agg(public.redirect_management_link(id)||jsonb_build_object('canEdit',public.redirect_can_write_link(p_token_id,id)) ORDER BY id) FROM shown),'[]'::jsonb),
  'nextCursor',CASE WHEN p_limit>0 AND (SELECT count(*) FROM page)>p_limit THEN (SELECT max(id::text) FROM shown) ELSE NULL END) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_management_mutate(p_operations jsonb, p_token_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor_id);allowed uuid[]; op jsonb; d jsonb; mode text; r public.redirects; patch jsonb;
 key text; folder uuid; tags uuid[]; comment_value text; created boolean; output jsonb:='[]'; attempt integer;
BEGIN
 allowed:=public.redirect_management_scope(p_token_id,'links:write');
 IF p_token_id IS NOT NULL THEN SELECT coalesce((SELECT created_by FROM public.redirect_api_tokens WHERE id=p_token_id AND workspace_id=selected_workspace),(SELECT user_id FROM public.redirect_workspace_members WHERE id=p_token_id AND workspace_id=selected_workspace)) INTO p_actor_id; END IF;
 IF p_operations IS NULL OR jsonb_typeof(p_operations)<>'array' OR jsonb_array_length(p_operations) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide 1–100 operations' USING ERRCODE='22023'; END IF;
 -- Serialize API batches to give upserts and mixed batches deterministic atomic behavior.
 PERFORM pg_advisory_xact_lock(471983092);
 FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
  mode:=op->>'operation'; d:=coalesce(op->'data','{}'); created:=false; r:=NULL;
  IF mode NOT IN('create','update','upsert','delete') OR mode IS NULL THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
  IF d->>'domainId' IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=(d->>'domainId')::uuid AND workspace_id=selected_workspace) THEN RAISE EXCEPTION 'Domain not found in this workspace' USING ERRCODE='P0002';END IF;
  IF mode IN('update','delete') THEN SELECT * INTO r FROM public.redirects WHERE workspace_id=selected_workspace AND id=(op->>'id')::uuid AND type='SHORT' FOR UPDATE;
  ELSIF mode='upsert' THEN SELECT * INTO r FROM public.redirects WHERE workspace_id=selected_workspace AND type='SHORT' AND domain_id IS NOT DISTINCT FROM (d->>'domainId')::uuid AND CASE WHEN coalesce((d->>'isDomainRoot')::boolean,false) THEN is_domain_root ELSE NOT is_domain_root AND slug=d->>'slug' END FOR UPDATE;
  END IF;
  IF mode IN('update','delete') AND r.id IS NULL THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002'; END IF;
  IF allowed IS NOT NULL AND r.id IS NOT NULL AND NOT(r.id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501';END IF;
  IF r.id IS NULL AND NOT public.redirect_can_create_in_folder(p_token_id,(d->>'folderId')::uuid) THEN RAISE EXCEPTION 'Cannot create links in this folder' USING ERRCODE='42501';END IF;
  IF d?'folderId' AND public.redirect_folder_rank(public.redirect_principal_member(p_token_id),(d->>'folderId')::uuid)<2 THEN RAISE EXCEPTION 'Destination folder requires edit access' USING ERRCODE='42501';END IF;
  IF mode='delete' THEN
   DELETE FROM public.redirect_link_metadata WHERE workspace_id=selected_workspace AND redirect_key='redirects:'||r.id::text;
   DELETE FROM public.redirects WHERE workspace_id=selected_workspace AND id=r.id;
   output:=output||jsonb_build_array(jsonb_build_object('operation',mode,'id',r.id,'deleted',true));
   CONTINUE;
  END IF;
  IF r.id IS NULL THEN
   IF length(d->>'target') NOT BETWEEN 1 AND 8192 OR d->>'target' IS NULL THEN RAISE EXCEPTION 'Destination required' USING ERRCODE='22023'; END IF;
   IF d?'slug' THEN
    INSERT INTO public.redirects(workspace_id,type,slug,target,match_kind,status_code,is_enabled,query_mode,preserve_query,created_by,domain_id,is_domain_root)
    VALUES(selected_workspace,'SHORT',d->>'slug',d->>'target','EXACT',302,true,'PRESERVE',true,p_actor_id,(d->>'domainId')::uuid,coalesce((d->>'isDomainRoot')::boolean,false)) RETURNING * INTO r;
   ELSE
    FOR attempt IN 1..5 LOOP
     INSERT INTO public.redirects(workspace_id,type,slug,target,match_kind,status_code,is_enabled,query_mode,preserve_query,created_by,domain_id,is_domain_root)
     VALUES(selected_workspace,'SHORT',left(replace(gen_random_uuid()::text,'-',''),12),d->>'target','EXACT',302,true,'PRESERVE',true,p_actor_id,(d->>'domainId')::uuid,coalesce((d->>'isDomainRoot')::boolean,false))
     ON CONFLICT DO NOTHING RETURNING * INTO r;
     EXIT WHEN r.id IS NOT NULL;
    END LOOP;
    IF r.id IS NULL THEN RAISE EXCEPTION 'Could not allocate a slug' USING ERRCODE='23505'; END IF;
   END IF;
   created:=true;
  END IF;
  patch:='{}';
  FOR key IN SELECT unnest(ARRAY['isDomainRoot','startsAt','clickLimit','notes','domainId','slug','target','statusCode','isEnabled','queryMode','queryOverride','utmDefaults','expiresAt']) LOOP
   IF d?key THEN patch:=patch||jsonb_build_object(CASE key WHEN 'isDomainRoot' THEN 'is_domain_root' WHEN 'startsAt' THEN 'start_at' WHEN 'clickLimit' THEN 'click_limit' WHEN 'domainId' THEN 'domain_id' WHEN 'statusCode' THEN 'status_code' WHEN 'isEnabled' THEN 'is_enabled' WHEN 'queryMode' THEN 'query_mode' WHEN 'queryOverride' THEN 'query_override' WHEN 'utmDefaults' THEN 'utm_defaults' WHEN 'expiresAt' THEN 'end_at' ELSE key END,d->key); END IF;
  END LOOP;
  r:=jsonb_populate_record(r,patch);
  IF r.click_limit IS NOT NULL AND r.click_limit<1 OR (created OR d?'startsAt' OR d?'expiresAt') AND r.start_at IS NOT NULL AND r.end_at IS NOT NULL AND r.end_at<=r.start_at OR (created OR d?'notes') AND length(r.notes)>10000 THEN RAISE EXCEPTION 'Invalid schedule, visit limit or notes' USING ERRCODE='22023';END IF;
  UPDATE public.redirects SET is_domain_root=r.is_domain_root,start_at=r.start_at,click_limit=r.click_limit,notes=r.notes,domain_id=r.domain_id,slug=r.slug,target=r.target,status_code=r.status_code,is_enabled=r.is_enabled,
   query_mode=r.query_mode,preserve_query=r.query_mode<>'DROP',query_override=r.query_override,utm_defaults=r.utm_defaults,end_at=r.end_at,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=r.id;
  IF d?'expiresAt' THEN
   UPDATE public.redirect_link_policies SET policy=CASE WHEN r.end_at IS NULL THEN policy-'expires_at' ELSE policy||jsonb_build_object('expires_at',r.end_at) END,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND redirect_id=r.id;
  END IF;
  key:='redirects:'||r.id::text;
  IF created OR d?'folderId' OR d?'tagIds' OR d?'comment' THEN
   SELECT m.folder_id,m.comment INTO folder,comment_value FROM public.redirect_link_metadata m WHERE m.workspace_id=selected_workspace AND m.redirect_key=key;
   IF d?'folderId' THEN folder:=(d->>'folderId')::uuid; END IF;
   IF d?'comment' THEN comment_value:=d->>'comment'; END IF;
   IF d?'tagIds' THEN SELECT coalesce(array_agg(DISTINCT value::uuid),ARRAY[]::uuid[]) INTO tags FROM jsonb_array_elements_text(d->'tagIds');
   ELSE SELECT coalesce(array_agg(tag_id),ARRAY[]::uuid[]) INTO tags FROM public.redirect_link_tag_assignments WHERE workspace_id=selected_workspace AND redirect_key=key;
   END IF;
   IF EXISTS(SELECT FROM unnest(tags) t WHERE NOT EXISTS(SELECT FROM public.redirect_link_tags WHERE id=t AND workspace_id=selected_workspace)) THEN RAISE EXCEPTION 'Tag not found in this workspace' USING ERRCODE='23503';END IF;
   INSERT INTO public.redirect_link_metadata AS metadata(workspace_id,redirect_key,folder_id,comment) VALUES(selected_workspace,key,folder,coalesce(comment_value,''))
    ON CONFLICT(redirect_key) DO UPDATE SET folder_id=excluded.folder_id,comment=excluded.comment,updated_at=clock_timestamp() WHERE metadata.workspace_id=selected_workspace;
   IF NOT FOUND THEN RAISE EXCEPTION 'Link metadata is unavailable in this workspace' USING ERRCODE='23505';END IF;
   DELETE FROM public.redirect_link_tag_assignments WHERE workspace_id=selected_workspace AND redirect_key=key;
   INSERT INTO public.redirect_link_tag_assignments(workspace_id,redirect_key,tag_id) SELECT selected_workspace,key,unnest(tags);
  END IF;
  IF d?'isArchived' THEN
   INSERT INTO public.redirect_link_metadata AS metadata(workspace_id,redirect_key,is_archived) VALUES(selected_workspace,key,(d->>'isArchived')::boolean)
   ON CONFLICT(redirect_key) DO UPDATE SET is_archived=excluded.is_archived,updated_at=clock_timestamp() WHERE metadata.workspace_id=selected_workspace;
   IF NOT FOUND THEN RAISE EXCEPTION 'Link metadata is unavailable in this workspace' USING ERRCODE='23505';END IF;
  END IF;
  output:=output||jsonb_build_array(jsonb_build_object('operation',mode,'created',created,'link',public.redirect_management_link(r.id)));
 END LOOP;
 RETURN output;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_policy_resource(p_redirect_id uuid, p_action text, p_patch jsonb DEFAULT '{}'::jsonb, p_password_hash jsonb DEFAULT NULL::jsonb, p_change_password boolean DEFAULT false, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[]; link public.redirects; saved public.redirect_link_policies; merged jsonb; setting record;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('get','patch') THEN RAISE EXCEPTION 'Invalid policy action' USING ERRCODE='22023'; END IF;
 allowed:=public.redirect_management_scope(p_token_id,CASE WHEN p_action='get' THEN 'links:read' ELSE 'links:write' END);
 IF allowed IS NOT NULL AND NOT(p_redirect_id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501'; END IF;
 SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed short link not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO saved FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=p_redirect_id;
 merged:=coalesce(saved.policy,'{}')-'expires_at';
 IF p_action='patch' THEN
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch-ARRAY['preview','cloaked','track_conversions','device_targets','geo_targets','experiment','expires_at','expired_target']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid policy fields' USING ERRCODE='22023'; END IF;
  FOR setting IN SELECT key,value FROM jsonb_each(p_patch-'expires_at') LOOP
   merged:=CASE WHEN setting.value='null'::jsonb THEN merged-setting.key ELSE merged||jsonb_build_object(setting.key,setting.value) END;
  END LOOP;
  INSERT INTO public.redirect_link_policies(workspace_id,redirect_id,policy,password_hash)
  VALUES(selected_workspace,p_redirect_id,merged,CASE WHEN p_change_password THEN nullif(p_password_hash,'null'::jsonb) ELSE NULL END)
  ON CONFLICT(redirect_id) DO UPDATE SET policy=excluded.policy,password_hash=CASE WHEN p_change_password THEN excluded.password_hash ELSE redirect_link_policies.password_hash END,updated_at=clock_timestamp() WHERE redirect_link_policies.workspace_id=selected_workspace
  RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link policy is unavailable in this workspace' USING ERRCODE='23505';END IF;
  UPDATE public.redirects SET end_at=CASE WHEN p_patch?'expires_at' THEN (p_patch->>'expires_at')::timestamptz ELSE end_at END,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=p_redirect_id RETURNING * INTO link;
 END IF;
 RETURN jsonb_build_object('policy',(coalesce(saved.policy,'{}')-'expires_at')||jsonb_strip_nulls(jsonb_build_object('expires_at',link.end_at)),'hasPassword',coalesce(saved.has_password,false));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_presentation(p_redirect_id uuid, p_action text, p_values jsonb DEFAULT '{}'::jsonb, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[]; existing public.redirect_link_policies; merged jsonb;
BEGIN
 IF p_action NOT IN('get','check','patch') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid presentation action' USING ERRCODE='22023'; END IF;
 allowed:=public.redirect_management_scope(p_token_id,CASE WHEN p_action='get' THEN 'links:read' ELSE 'links:write' END);
 IF allowed IS NOT NULL AND NOT(p_redirect_id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed link not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO existing FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=p_redirect_id;
 IF p_action='check' THEN RETURN '{}'::jsonb; END IF;
 IF p_action<>'get' THEN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['preview','cloaked']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid presentation values' USING ERRCODE='22023'; END IF;
  merged:=coalesce(existing.policy,'{}');
   IF p_values?'preview' THEN merged:=CASE WHEN p_values->'preview'='null'::jsonb THEN merged-'preview' ELSE merged||jsonb_build_object('preview',p_values->'preview') END; END IF;
   IF p_values?'cloaked' THEN merged:=merged||jsonb_build_object('cloaked',p_values->'cloaked'); END IF;
  INSERT INTO public.redirect_link_policies(workspace_id,redirect_id,policy) VALUES(selected_workspace,p_redirect_id,merged)
  ON CONFLICT(redirect_id) DO UPDATE SET policy=excluded.policy,updated_at=clock_timestamp() WHERE redirect_link_policies.workspace_id=selected_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link presentation is unavailable in this workspace' USING ERRCODE='23505';END IF;
 END IF;
 RETURN jsonb_build_object('preview',CASE WHEN p_action='get' THEN existing.policy->'preview' ELSE merged->'preview' END,'cloaked',coalesce(CASE WHEN p_action='get' THEN existing.policy->'cloaked' ELSE merged->'cloaked' END,'false'));
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_preview(p_redirect_id uuid, p_token_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor_id);allowed uuid[]; destination text; key text; cap integer; used integer; started timestamptz; now_at timestamptz:=clock_timestamp();
BEGIN
 allowed:=public.redirect_management_scope(p_token_id,'links:write');
 IF allowed IS NOT NULL AND NOT(p_redirect_id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501'; END IF;
 IF p_token_id IS NULL AND p_actor_id IS NULL THEN RAISE EXCEPTION 'Actor is required' USING ERRCODE='22023'; END IF;
 SELECT target INTO destination FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed link not found' USING ERRCODE='P0002'; END IF;
 FOREACH key IN ARRAY ARRAY['global','actor:'||coalesce(p_token_id,p_actor_id)::text,'link:'||p_redirect_id::text] LOOP
  cap:=CASE WHEN key='global' THEN 60 WHEN key LIKE 'actor:%' THEN 10 ELSE 5 END;
  INSERT INTO public.redirect_preview_requests AS r VALUES(key,now_at,1)
  ON CONFLICT(bucket) DO UPDATE SET
   window_started_at=CASE WHEN r.window_started_at<=now_at-interval '1 hour' THEN now_at ELSE r.window_started_at END,
   attempts=CASE WHEN r.window_started_at<=now_at-interval '1 hour' THEN 1 ELSE least(r.attempts+1,cap+1) END
  RETURNING attempts,window_started_at INTO used,started;
  IF used>cap THEN RETURN jsonb_build_object('retryAfter',greatest(1,ceil(extract(epoch FROM started+interval '1 hour'-clock_timestamp()))::integer)); END IF;
 END LOOP;
 DELETE FROM public.redirect_preview_requests WHERE bucket IN(SELECT bucket FROM public.redirect_preview_requests WHERE window_started_at<now_at-interval '1 day' LIMIT 100 FOR UPDATE SKIP LOCKED);
 RETURN jsonb_build_object('target',destination,'retryAfter',0);
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_policy_password(p_redirect_id uuid, p_token_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor_id);allowed uuid[]; key text; cap integer; used integer; started timestamptz; now_at timestamptz:=clock_timestamp();
BEGIN
 allowed:=public.redirect_management_scope(p_token_id,'links:write');
 IF allowed IS NOT NULL AND NOT(p_redirect_id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501'; END IF;
 IF p_token_id IS NULL AND p_actor_id IS NULL THEN RAISE EXCEPTION 'Actor is required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed short link not found' USING ERRCODE='P0002'; END IF;
 FOREACH key IN ARRAY ARRAY['global','actor:'||coalesce(p_token_id,p_actor_id)::text,'link:'||p_redirect_id::text] LOOP
  cap:=CASE WHEN key='global' THEN 100 ELSE 20 END;
  INSERT INTO public.redirect_policy_password_limits AS r VALUES(key,now_at,1) ON CONFLICT(bucket) DO UPDATE SET
   window_started_at=CASE WHEN r.window_started_at<=now_at-interval '1 hour' THEN now_at ELSE r.window_started_at END,
   attempts=CASE WHEN r.window_started_at<=now_at-interval '1 hour' THEN 1 ELSE least(r.attempts+1,cap+1) END
  RETURNING attempts,window_started_at INTO used,started;
  IF used>cap THEN RETURN greatest(1,ceil(extract(epoch FROM started+interval '1 hour'-clock_timestamp()))::integer); END IF;
 END LOOP;
 DELETE FROM public.redirect_policy_password_limits WHERE bucket IN(SELECT bucket FROM public.redirect_policy_password_limits WHERE window_started_at<now_at-interval '1 day' LIMIT 100 FOR UPDATE SKIP LOCKED);
 RETURN 0;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_scoped_variant_performance(p_redirect_id uuid, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[]; result jsonb;
BEGIN
 allowed:=public.redirect_management_scope(p_token_id,'links:read');
 IF allowed IS NOT NULL AND NOT(p_redirect_id=ANY(allowed)) THEN RAISE EXCEPTION 'Link is outside credential scope' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT') THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) INTO result FROM public.redirect_variant_performance(p_redirect_id) p;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_linked_domains(p_token_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();allowed uuid[];result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 allowed:=public.redirect_management_scope(p_token_id,'links:read');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid domain page' USING ERRCODE='22023';END IF;
 WITH visible AS MATERIALIZED(
  SELECT r.domain_id,r.domain_hostname FROM public.redirects r WHERE r.workspace_id=selected_workspace AND r.type='SHORT' AND(allowed IS NULL OR r.id=ANY(allowed))
 ),domains AS MATERIALIZED(
  SELECT domain_id AS id,domain_hostname AS hostname,count(*) AS link_count FROM visible WHERE domain_id IS NOT NULL GROUP BY domain_id,domain_hostname
 ),page AS MATERIALIZED(SELECT * FROM domains WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),
 shown AS MATERIALIZED(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'hostname',hostname,'linkCount',link_count) ORDER BY id) FROM shown),'[]'::jsonb),
 'revision',md5((SELECT count(*)::text FROM visible WHERE domain_id IS NULL)||'|'||coalesce((SELECT string_agg(id::text||':'||hostname||':'||link_count::text,',' ORDER BY id) FROM domains),'')),
 'count',(SELECT count(*) FROM domains),'builtinCount',(SELECT count(*) FROM visible WHERE domain_id IS NULL),
 'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT max(id::text) FROM shown) ELSE NULL END) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_password_branding_actor(p_actor uuid, p_principal uuid, p_link uuid, p_write boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);allowed uuid[];t public.redirect_api_tokens;member public.redirect_workspace_members;actor uuid;principal_key text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_write IS NULL THEN RAISE EXCEPTION 'Invalid access mode' USING ERRCODE='22023';END IF;
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_principal IS NULL THEN
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  actor:=p_actor;principal_key:='owner:'||actor::text;
 ELSE
  SELECT * INTO t FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal FOR SHARE;
  IF t.id IS NOT NULL THEN
   actor:=t.created_by;principal_key:='key:'||t.id::text;
   IF t.member_id IS NULL THEN
    PERFORM 1 FROM public.user_roles WHERE user_id=actor AND role='admin' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Key owner access changed' USING ERRCODE='42501';END IF;
   END IF;
  ELSE
   SELECT * INTO member FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND active AND user_id=p_actor FOR SHARE;
   IF member.id IS NULL THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
   actor:=p_actor;principal_key:='member:'||member.id::text;
  END IF;
 END IF;
 allowed:=public.redirect_management_scope(p_principal,CASE WHEN p_write THEN 'links:write' ELSE 'links:read' END);
 PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_link AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed)) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed link not found or access changed' USING ERRCODE='P0002';END IF;
 IF p_write AND NOT public.redirect_can_write_link(p_principal,p_link) THEN RAISE EXCEPTION 'Link edit access required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('actor',actor,'principalKey',principal_key);
END $function$;
