-- Private selection requires an active workspace; resource and registry
-- activation fences remain closed until immutable UI context is complete.
CREATE OR REPLACE FUNCTION public.redirect_request_workspace(p_actor uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE headers jsonb;selected uuid;actor uuid;raw text;
BEGIN
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 raw:=headers->>'x-qg-redirect-workspace';
 IF raw IS NOT NULL AND raw !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Provide one valid Redirects workspace ID' USING ERRCODE='22023';END IF;
 selected:=coalesce(raw::uuid,'58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid);
 actor:=nullif(headers->>'x-qg-redirect-session-actor','')::uuid;
 IF p_actor IS NOT NULL AND actor IS NOT NULL AND actor<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected AND status='active') THEN RAISE EXCEPTION 'This Redirects workspace is not available' USING ERRCODE='42501';END IF;
 RETURN selected;
END $function$;
CREATE OR REPLACE FUNCTION public.redirect_workspace_context(p_actor uuid, p_workspace uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'links:read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);w public.redirect_workspaces;m public.redirect_workspace_members;request_actor uuid;context jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Invalid workspace session' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 request_actor:=nullif(context->>'x-qg-redirect-session-actor','')::uuid;
 IF request_actor IS NOT NULL AND request_actor<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.redirect_workspaces WHERE id=coalesce(p_workspace,selected_workspace) AND id=selected_workspace AND status='active' FOR SHARE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'This workspace is not available' USING ERRCODE='42501';END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF FOUND THEN RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',NULL,'role','owner','label',NULL));END IF;
 SELECT * INTO m FROM public.redirect_workspace_members WHERE workspace_id=w.id AND user_id=p_actor AND kind='user' AND active FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace access is required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',m.id,'role',m.role,'label',m.label));
END $function$;
CREATE FUNCTION public.redirect_token_workspace(p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE workspace uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT t.workspace_id INTO workspace FROM public.redirect_api_tokens t JOIN public.redirect_workspaces w ON w.id=t.workspace_id AND w.status='active' WHERE t.token_hash=p_hash AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp();
 RETURN workspace;
END $$;
REVOKE ALL ON FUNCTION public.redirect_token_workspace(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_token_workspace(text) TO service_role;

-- Folder rank retains the principal that established scope. An Owner key is
-- not a NULL account session. Callers retain their operation-scope/link checks.
CREATE FUNCTION redirect_internal.principal_folder_rank(p_principal uuid,p_folder uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE workspace uuid:=public.redirect_request_workspace();member uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_folder IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE workspace_id=workspace AND id=p_folder) THEN RETURN 0;END IF;
 member:=public.redirect_principal_member(p_principal);
 IF member IS NOT NULL THEN RETURN public.redirect_folder_rank(member,p_folder);END IF;
 IF p_principal IS NULL THEN PERFORM public.redirect_management_scope(NULL,'workspace:read');END IF;
 RETURN 3;
END $$;
REVOKE ALL ON FUNCTION redirect_internal.principal_folder_rank(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.principal_folder_rank(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.redirect_can_create_in_folder(p_principal uuid, p_folder uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid; selected uuid[];key_scopes text[];
BEGIN
 IF p_principal IS NOT NULL THEN SELECT redirect_ids,scopes INTO selected,key_scopes FROM public.redirect_api_tokens WHERE id=p_principal AND workspace_id=selected_workspace;IF selected IS NOT NULL OR key_scopes IS NOT NULL AND NOT('links:write'=ANY(key_scopes)) THEN RETURN false;END IF;END IF;
 member:=public.redirect_principal_member(p_principal);
 RETURN redirect_internal.principal_folder_rank(p_principal,p_folder)>=2;
END $function$;
CREATE OR REPLACE FUNCTION public.redirect_can_write_link(p_principal uuid, p_link uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid; folder uuid; scopes text[];selected uuid[];
BEGIN
 IF NOT EXISTS(SELECT FROM public.redirects WHERE id=p_link AND workspace_id=selected_workspace) THEN RETURN false;END IF;
 IF p_principal IS NOT NULL THEN SELECT t.scopes,t.redirect_ids INTO scopes,selected FROM public.redirect_api_tokens t WHERE id=p_principal AND workspace_id=selected_workspace;IF scopes IS NOT NULL AND NOT('links:write'=ANY(scopes)) OR selected IS NOT NULL AND NOT(p_link=ANY(selected)) THEN RETURN false;END IF;END IF;
 member:=public.redirect_principal_member(p_principal);
 SELECT folder_id INTO folder FROM public.redirect_link_metadata WHERE workspace_id=selected_workspace AND redirect_key='redirects:'||p_link::text;
 RETURN redirect_internal.principal_folder_rank(p_principal,folder)>=2;
END $function$;
CREATE OR REPLACE FUNCTION public.redirect_folder_access(p_folder uuid, p_values jsonb DEFAULT NULL::jsonb, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid; entry jsonb;
BEGIN
 PERFORM public.redirect_management_scope(p_token_id,CASE WHEN p_values IS NULL THEN 'workspace:read' ELSE 'workspace:write' END);
 member:=public.redirect_principal_member(p_token_id);
 IF redirect_internal.principal_folder_rank(p_token_id,p_folder)<3 THEN RAISE EXCEPTION 'Folder owner access is required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=selected_workspace) THEN RAISE EXCEPTION 'Folder not found' USING ERRCODE='P0002';END IF;
 IF p_values IS NOT NULL THEN
  IF jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('defaultPermission','overrides')) THEN RAISE EXCEPTION 'Invalid access settings' USING ERRCODE='22023';END IF;
  IF p_values?'defaultPermission' THEN
   IF (p_values->>'defaultPermission') IS NULL OR p_values->>'defaultPermission' NOT IN('none','view','edit') THEN RAISE EXCEPTION 'Invalid default permission' USING ERRCODE='22023';END IF;
   UPDATE public.redirect_link_folders SET default_permission=p_values->>'defaultPermission' WHERE id=p_folder AND workspace_id=selected_workspace;
  END IF;
  IF p_values?'overrides' THEN
   IF jsonb_typeof(p_values->'overrides')<>'array' OR jsonb_array_length(p_values->'overrides')>100 THEN RAISE EXCEPTION 'Provide up to 100 overrides' USING ERRCODE='22023';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_values->'overrides') LOOP
    IF jsonb_typeof(entry)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(entry) k WHERE k NOT IN('memberId','permission')) OR NOT(entry?'memberId') OR NOT(entry?'permission') THEN RAISE EXCEPTION 'Invalid override' USING ERRCODE='22023';END IF;
    IF entry->'permission'='null'::jsonb THEN DELETE FROM public.redirect_folder_members WHERE workspace_id=selected_workspace AND folder_id=p_folder AND member_id=(entry->>'memberId')::uuid;
    ELSE
     IF entry->>'permission' NOT IN('none','view','edit','owner') THEN RAISE EXCEPTION 'Invalid permission' USING ERRCODE='22023';END IF;
     INSERT INTO public.redirect_folder_members(workspace_id,folder_id,member_id,permission) VALUES(selected_workspace,p_folder,(entry->>'memberId')::uuid,entry->>'permission') ON CONFLICT(folder_id,member_id) DO UPDATE SET permission=excluded.permission;
    END IF;
   END LOOP;
  END IF;
 END IF;
 RETURN jsonb_build_object('folderId',p_folder,'defaultPermission',(SELECT default_permission FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=selected_workspace),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'label',m.label,'kind',m.kind,'role',m.role,'active',m.active,'permission',a.permission) ORDER BY m.label,m.id) FROM public.redirect_workspace_members m LEFT JOIN public.redirect_folder_members a ON a.member_id=m.id AND a.folder_id=p_folder AND a.workspace_id=selected_workspace WHERE m.workspace_id=selected_workspace),'[]'::jsonb));
END $function$;
CREATE OR REPLACE FUNCTION public.redirect_folder_capabilities(p_folder uuid, p_principal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();rank integer; scopes text[];
BEGIN
 rank:=redirect_internal.principal_folder_rank(p_principal,p_folder);
 SELECT t.scopes INTO scopes FROM public.redirect_api_tokens t WHERE id=p_principal AND t.workspace_id=selected_workspace;
 RETURN jsonb_build_object('canEdit',rank>=2 AND (scopes IS NULL OR 'links:write'=ANY(scopes)),'canRename',rank>=2 AND (scopes IS NULL OR 'workspace:write'=ANY(scopes)),'canManage',rank>=3 AND (scopes IS NULL OR 'workspace:write'=ANY(scopes)));
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
   IF redirect_internal.principal_folder_rank(p_principal,folder)<2 THEN RAISE EXCEPTION 'Destination folder edit access required' USING ERRCODE='42501';END IF;
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
  IF d?'folderId' AND redirect_internal.principal_folder_rank(p_token_id,(d->>'folderId')::uuid)<2 THEN RAISE EXCEPTION 'Destination folder requires edit access' USING ERRCODE='42501';END IF;
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
