-- Convert core workspace administration and ACL primitives before tenant activation.
-- Resource activation fences remain intact. Other resource families are separate follow-through.

-- Selection is not authorization. This private invoker helper also runs inside
-- the existing service-only invitation inbox definer; callers retain role/grant
-- checks. Do not lock here before callers take the shared/exclusive ACL lock.
CREATE FUNCTION public.redirect_request_workspace(p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE headers jsonb;selected uuid;actor uuid;raw text;
BEGIN
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 raw:=headers->>'x-qg-redirect-workspace';
 IF raw IS NOT NULL AND raw !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Provide one valid Redirects workspace ID' USING ERRCODE='22023';END IF;
 selected:=coalesce(raw::uuid,'58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid);
 actor:=nullif(headers->>'x-qg-redirect-session-actor','')::uuid;
 IF p_actor IS NOT NULL AND actor IS NOT NULL AND actor<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected AND is_legacy AND status='active') THEN RAISE EXCEPTION 'This Redirects workspace is not available' USING ERRCODE='42501';END IF;
 RETURN selected;
END $$;
REVOKE ALL ON FUNCTION public.redirect_request_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_request_workspace(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_principal_member(p_principal uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();t public.redirect_api_tokens;m public.redirect_workspace_members;
BEGIN
 IF p_principal IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO t FROM public.redirect_api_tokens WHERE id=p_principal AND workspace_id=selected_workspace;
 IF t.id IS NOT NULL THEN
  IF t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Credential is no longer active' USING ERRCODE='42501';END IF;
  IF t.member_id IS NULL THEN
   IF NOT EXISTS(SELECT FROM public.user_roles WHERE user_id=t.created_by AND role='admin') THEN RAISE EXCEPTION 'Credential owner access is no longer active' USING ERRCODE='42501';END IF;
   RETURN NULL;
  END IF;
  SELECT * INTO m FROM public.redirect_workspace_members WHERE id=t.member_id AND workspace_id=selected_workspace AND active;
 ELSE
  SELECT * INTO m FROM public.redirect_workspace_members WHERE id=p_principal AND workspace_id=selected_workspace AND kind='user' AND active;
  IF m.id IS NOT NULL THEN PERFORM public.redirect_request_workspace(m.user_id);END IF;
 END IF;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Principal is not active in this workspace' USING ERRCODE='42501';END IF;
 RETURN m.id;
END $$;

CREATE OR REPLACE FUNCTION public.redirect_management_scope(p_token_id uuid, p_scope text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();t public.redirect_api_tokens; member public.redirect_workspace_members; member_key uuid; ids uuid[]; required_rank integer; session_actor uuid; request_context jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_scope IS NULL OR p_scope NOT IN('links:read','links:write','events:read','workspace:read','workspace:write','conversions:write') THEN RAISE EXCEPTION 'Invalid permission scope' USING ERRCODE='22023';END IF;
 IF p_scope LIKE '%:write' THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 request_context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 session_actor:=nullif(request_context->>'x-qg-redirect-session-actor','')::uuid;
 IF p_token_id IS NULL THEN
  IF session_actor IS NOT NULL THEN
   PERFORM 1 FROM public.user_roles WHERE user_id=session_actor AND role='admin' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO t FROM public.redirect_api_tokens WHERE id=p_token_id AND workspace_id=selected_workspace FOR SHARE;
 IF t.id IS NOT NULL THEN
  IF t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR NOT(p_scope=ANY(t.scopes)) THEN RAISE EXCEPTION 'Credential expired, revoked or missing scope' USING ERRCODE='42501';END IF;
  IF p_scope LIKE 'workspace:%' AND t.redirect_ids IS NOT NULL THEN RAISE EXCEPTION 'Workspace permissions require an unrestricted credential' USING ERRCODE='42501';END IF;
  IF t.member_id IS NULL THEN
   PERFORM 1 FROM public.user_roles WHERE user_id=t.created_by AND role='admin' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Credential owner access is no longer active' USING ERRCODE='42501';END IF;
   IF t.redirect_ids IS NULL THEN RETURN NULL;END IF;
   SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO ids FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(t.redirect_ids);
   RETURN ids;
  END IF;
  member_key:=t.member_id;
 ELSE
  IF p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Session scope is not allowed' USING ERRCODE='42501';END IF;
  member_key:=p_token_id;
 END IF;
 SELECT * INTO member FROM public.redirect_workspace_members WHERE id=member_key AND workspace_id=selected_workspace AND active AND (t.id IS NOT NULL OR kind='user') FOR SHARE;
 IF t.id IS NULL AND session_actor IS NOT NULL AND member.user_id IS DISTINCT FROM session_actor THEN RAISE EXCEPTION 'Session membership does not match the authenticated account' USING ERRCODE='42501';END IF;
 IF member.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace membership is inactive or missing' USING ERRCODE='42501';END IF;
 required_rank:=CASE WHEN p_scope LIKE '%:write' THEN 2 ELSE 1 END;
 SELECT coalesce(array_agg(r.id),ARRAY[]::uuid[]) INTO ids
 FROM public.redirects r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key='redirects:'||r.id::text AND m.workspace_id=selected_workspace
 LEFT JOIN public.redirect_link_folders f ON f.id=m.folder_id AND f.workspace_id=selected_workspace
 LEFT JOIN public.redirect_folder_members a ON a.folder_id=f.id AND a.member_id=member.id AND a.workspace_id=selected_workspace
 WHERE r.workspace_id=selected_workspace AND (r.type='SHORT' OR m.folder_id IS NOT NULL) AND (t.redirect_ids IS NULL OR r.id=ANY(t.redirect_ids))
 AND least(CASE WHEN member.role='viewer' THEN 1 ELSE 3 END,
  CASE WHEN m.folder_id IS NULL THEN 2 ELSE CASE coalesce(a.permission,f.default_permission) WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END END)>=required_rank;
 RETURN ids;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_folder_rank(p_member uuid, p_folder uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();workspace_role text; active_member boolean; setting text; score integer;
BEGIN
 IF p_folder IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=selected_workspace) THEN RETURN 0;END IF;
 IF p_member IS NULL THEN PERFORM public.redirect_management_scope(NULL,'workspace:read');RETURN 3;END IF;
 SELECT role,active INTO workspace_role,active_member FROM public.redirect_workspace_members WHERE id=p_member AND workspace_id=selected_workspace;
 IF NOT coalesce(active_member,false) THEN RETURN 0;END IF;
 IF p_folder IS NULL THEN score:=2;
 ELSE
  SELECT coalesce(a.permission,f.default_permission) INTO setting FROM public.redirect_link_folders f LEFT JOIN public.redirect_folder_members a ON a.folder_id=f.id AND a.member_id=p_member AND a.workspace_id=selected_workspace WHERE f.id=p_folder AND f.workspace_id=selected_workspace;
  score:=CASE setting WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END;
 END IF;
 RETURN CASE WHEN workspace_role='viewer' THEN least(score,1) ELSE score END;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_session_principal(p_user_id uuid, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_user_id);member public.redirect_workspace_members;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO member FROM public.redirect_workspace_members WHERE user_id=p_user_id AND workspace_id=selected_workspace AND kind='user' AND active;
 IF member.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace access is required' USING ERRCODE='42501';END IF;
 IF p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Session scope is not allowed' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('id',member.id,'label',member.label,'role',member.role);
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
 SELECT * INTO w FROM public.redirect_workspaces WHERE id=coalesce(p_workspace,selected_workspace) AND id=selected_workspace AND is_legacy AND status='active' FOR SHARE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'This workspace is not available' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF FOUND THEN RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',NULL,'role','owner','label',NULL));END IF;
 SELECT * INTO m FROM public.redirect_workspace_members WHERE workspace_id=w.id AND user_id=p_actor AND kind='user' AND active FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace access is required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',m.id,'role',m.role,'label',m.label));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_member_administration(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);saved public.redirect_workspace_members; rows jsonb; total bigint;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);
 ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','update','delete') THEN RAISE EXCEPTION 'Invalid membership operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid member page' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO total FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') INTO rows FROM(SELECT id,user_id,kind,label,role,active,created_at FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',rows,'count',total);
 END IF;
 IF p_action IN('update','delete') AND p_id IS NULL OR p_action='create' AND p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid member ID' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN
  DELETE FROM public.redirect_workspace_members WHERE id=p_id AND workspace_id=selected_workspace RETURNING * INTO saved;
  RETURN jsonb_build_object('id',p_id,'deleted',saved.id IS NOT NULL);
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','role','active','kind','user_id') OR (p_action='update' AND k IN('kind','user_id'))) THEN RAISE EXCEPTION 'Invalid membership fields' USING ERRCODE='22023';END IF;
 IF (p_action='create' OR p_values?'label') AND (jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Member label must be 1–100 characters' USING ERRCODE='22023';END IF;
 IF p_values?'role' AND (jsonb_typeof(p_values->'role') IS DISTINCT FROM 'string' OR p_values->>'role' NOT IN('member','viewer')) OR p_values?'active' AND jsonb_typeof(p_values->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid member role or status' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  IF jsonb_typeof(p_values->'kind') IS DISTINCT FROM 'string' OR p_values->>'kind' NOT IN('user','machine') OR (p_values->>'kind'='user' AND (jsonb_typeof(p_values->'user_id') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT FROM auth.users WHERE id=(p_values->>'user_id')::uuid))) OR (p_values->>'kind'='machine' AND coalesce(p_values->'user_id','null'::jsonb)<>'null'::jsonb) THEN RAISE EXCEPTION 'Choose an existing account UUID or a machine member' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_members(workspace_id,label,role,active,kind,user_id) VALUES(selected_workspace,btrim(p_values->>'label'),coalesce(p_values->>'role','member'),coalesce((p_values->>'active')::boolean,true),p_values->>'kind',nullif(p_values->>'user_id','')::uuid) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_workspace_members SET label=CASE WHEN p_values?'label' THEN btrim(p_values->>'label') ELSE label END,role=CASE WHEN p_values?'role' THEN p_values->>'role' ELSE role END,active=CASE WHEN p_values?'active' THEN (p_values->>'active')::boolean ELSE active END WHERE id=p_id AND workspace_id=selected_workspace RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='P0002';END IF;
 END IF;
 RETURN to_jsonb(saved);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_token_administration(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);scopes_value text[]; ids uuid[]; member uuid; expiry timestamptz; saved_id uuid; rows jsonb; total bigint;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','revoke') OR (p_action='revoke' AND p_id IS NULL) OR (p_action<>'revoke' AND p_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid credential operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid credential page' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO total FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace;
  SELECT coalesce(jsonb_agg(public.redirect_token_metadata(r.id) ORDER BY r.created_at DESC,r.id DESC),'[]') INTO rows FROM(SELECT id,created_at FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',rows,'count',total);
 END IF;
 IF p_action='revoke' THEN
  UPDATE public.redirect_api_tokens SET revoked_at=clock_timestamp() WHERE id=p_id AND workspace_id=selected_workspace AND revoked_at IS NULL RETURNING id INTO saved_id;
  RETURN jsonb_build_object('revoked',saved_id IS NOT NULL);
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('name','expires_at','scopes','redirect_ids','member_id','token_hash','prefix')) THEN RAISE EXCEPTION 'Invalid credential fields' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'name')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide a credential name (1–100 characters)' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'token_hash') IS DISTINCT FROM 'string' OR p_values->>'token_hash' !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_values->'prefix') IS DISTINCT FROM 'string' OR p_values->>'prefix' !~ '^qg_redirect_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Invalid server credential digest' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'expires_at') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid credential expiry' USING ERRCODE='22023';END IF;
 expiry:=(p_values->>'expires_at')::timestamptz;
 IF NOT isfinite(expiry) OR expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Credentials must expire within one year' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'scopes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_values->'scopes') NOT BETWEEN 1 AND 6 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'scopes') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid credential permissions' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT value ORDER BY value) INTO scopes_value FROM jsonb_array_elements_text(p_values->'scopes');
 IF NOT(scopes_value<@ARRAY['links:read','links:write','workspace:read','workspace:write','events:read','conversions:write']::text[]) THEN RAISE EXCEPTION 'Invalid credential permissions' USING ERRCODE='22023';END IF;
 IF coalesce(p_values->'redirect_ids','null'::jsonb)<>'null'::jsonb THEN
  IF jsonb_typeof(p_values->'redirect_ids')<>'array' OR jsonb_array_length(p_values->'redirect_ids') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'redirect_ids') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid link scope' USING ERRCODE='22023';END IF;
  SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO ids FROM jsonb_array_elements_text(p_values->'redirect_ids');
  IF 'workspace:read'=ANY(scopes_value) OR 'workspace:write'=ANY(scopes_value) THEN RAISE EXCEPTION 'Workspace permissions require an unrestricted credential' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(ids) AND type='SHORT' ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(ids) AND type='SHORT')<>cardinality(ids) THEN RAISE EXCEPTION 'One or more managed links were not found' USING ERRCODE='22023';END IF;
 END IF;
 IF coalesce(p_values->'member_id','null'::jsonb)<>'null'::jsonb THEN
  IF jsonb_typeof(p_values->'member_id')<>'string' THEN RAISE EXCEPTION 'Invalid member binding' USING ERRCODE='22023';END IF;
  member:=(p_values->>'member_id')::uuid;
  PERFORM 1 FROM public.redirect_workspace_members WHERE id=member AND workspace_id=selected_workspace AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active workspace member required' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO public.redirect_api_tokens(workspace_id,name,token_hash,prefix,scopes,redirect_ids,member_id,created_by,expires_at) VALUES(selected_workspace,btrim(p_values->>'name'),p_values->>'token_hash',p_values->>'prefix',scopes_value,ids,member,p_actor,expiry) RETURNING id INTO saved_id;
 RETURN public.redirect_token_metadata(saved_id);
END $function$;

CREATE OR REPLACE FUNCTION public.authenticate_redirect_api_token(p_hash text, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();t public.redirect_api_tokens;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_scope LIKE '%:write' THEN PERFORM pg_advisory_xact_lock(471983093);
 ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 SELECT * INTO t FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND token_hash=p_hash
 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND p_scope=ANY(scopes) FOR UPDATE;
 IF t.id IS NULL THEN RETURN NULL;END IF;
 BEGIN
  PERFORM public.redirect_management_scope(t.id,p_scope);
 EXCEPTION WHEN insufficient_privilege THEN
  -- Permission revocation is an authentication denial, just like expiry.
  -- Resource functions still raise 42501 on later scope changes.
  RETURN NULL;
 END;
 UPDATE public.redirect_api_tokens SET last_used_at=now() WHERE id=t.id AND workspace_id=selected_workspace;
 RETURN jsonb_build_object('id',t.id,'redirect_ids',t.redirect_ids,'scopes',t.scopes);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_token_metadata(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',id,'name',name,'prefix',prefix,'scopes',scopes,'redirect_ids',redirect_ids,'member_id',member_id,'created_at',created_at,'expires_at',expires_at,'revoked_at',revoked_at,'last_used_at',last_used_at) FROM public.redirect_api_tokens WHERE id=p_id AND workspace_id=public.redirect_request_workspace();
$function$;

CREATE OR REPLACE FUNCTION public.redirect_workspace_invitation(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_hash text DEFAULT NULL::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);saved public.redirect_workspace_invitations; membership public.redirect_workspace_members; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF p_actor IS NULL OR p_action IS NULL OR p_action NOT IN('list','create','revoke','accept') THEN RAISE EXCEPTION 'Invalid invitation operation' USING ERRCODE='22023';END IF;
 IF p_action<>'accept' THEN
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]') INTO result FROM(SELECT id,email,label,role,created_at,expires_at,expires_at<=clock_timestamp() AS expired,revoked_at,accepted_at,member_id FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace));
 ELSIF p_action='revoke' THEN
  UPDATE public.redirect_workspace_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_id AND workspace_id=selected_workspace AND accepted_at IS NULL;
  RETURN jsonb_build_object('id',p_id,'revoked',FOUND);
 ELSIF p_action='create' THEN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('email','label','role')) OR jsonb_typeof(p_values->'email') IS DISTINCT FROM 'string' OR jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100 OR length(btrim(p_values->>'email'))>254 OR btrim(p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_values->>'role' IS NULL OR p_values->>'role' NOT IN('member','viewer') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation fields' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND created_by=p_actor AND created_at>now()-interval '1 hour')>=20 OR (SELECT count(*) FROM public.redirect_workspace_invitations WHERE created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'Invitation creation limit reached; try later' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_invitations(workspace_id,email,label,role,token_hash,created_by) VALUES(selected_workspace,lower(btrim(p_values->>'email')),btrim(p_values->>'label'),p_values->>'role',p_hash,p_actor) RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
 END IF;
 SELECT * INTO saved FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND ((p_hash IS NOT NULL AND token_hash=p_hash) OR (p_hash IS NULL AND id=p_id)) FOR UPDATE;
 IF saved.id IS NULL OR saved.revoked_at IS NOT NULL OR saved.expires_at<=clock_timestamp() OR NOT public.redirect_invitation_recipient(p_actor,saved.email) OR NOT EXISTS(SELECT FROM public.user_roles WHERE user_id=saved.created_by AND role='admin') OR (saved.accepted_at IS NOT NULL AND saved.accepted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 SELECT * INTO membership FROM public.redirect_workspace_members WHERE user_id=p_actor AND workspace_id=selected_workspace FOR UPDATE;
 IF membership.id IS NOT NULL AND NOT membership.active THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF saved.accepted_at IS NOT NULL AND (membership.id IS NULL OR membership.id IS DISTINCT FROM saved.member_id) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF membership.id IS NULL THEN
  INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES(selected_workspace,p_actor,'user',saved.label,saved.role) RETURNING * INTO membership;
 END IF;
 UPDATE public.redirect_workspace_invitations SET accepted_by=p_actor,accepted_at=coalesce(accepted_at,clock_timestamp()),member_id=membership.id WHERE id=saved.id AND workspace_id=selected_workspace;
 RETURN jsonb_build_object('memberId',membership.id,'role',membership.role,'accepted',true);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_invitation_inbox(p_actor uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
 WITH verified AS MATERIALIZED(SELECT lower(email) AS email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL),
 visible AS MATERIALIZED(SELECT i.id,i.label,i.role,i.expires_at,i.created_at FROM public.redirect_workspace_invitations i JOIN verified account ON account.email=i.email WHERE i.workspace_id=selected_workspace AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() AND EXISTS(SELECT FROM public.user_roles WHERE user_id=i.created_by AND role='admin')),
 page AS(SELECT * FROM visible ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'data',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]')) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_folder_capabilities(p_folder uuid, p_principal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();rank integer; scopes text[];
BEGIN
 rank:=public.redirect_folder_rank(public.redirect_principal_member(p_principal),p_folder);
 SELECT t.scopes INTO scopes FROM public.redirect_api_tokens t WHERE id=p_principal AND t.workspace_id=selected_workspace;
 RETURN jsonb_build_object('canEdit',rank>=2 AND (scopes IS NULL OR 'links:write'=ANY(scopes)),'canRename',rank>=2 AND (scopes IS NULL OR 'workspace:write'=ANY(scopes)),'canManage',rank>=3 AND (scopes IS NULL OR 'workspace:write'=ANY(scopes)));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_folder_owners(p_folder uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH context AS MATERIALIZED(SELECT public.redirect_request_workspace() AS workspace)
 SELECT r.user_id FROM public.user_roles r,context WHERE r.role='admin' AND EXISTS(SELECT FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=context.workspace)
 UNION SELECT m.user_id FROM public.redirect_folder_members f JOIN public.redirect_workspace_members m ON m.id=f.member_id CROSS JOIN context
 WHERE f.workspace_id=context.workspace AND m.workspace_id=context.workspace AND f.folder_id=p_folder AND f.permission='owner' AND m.kind='user' AND m.active AND m.role='member'
$function$;

CREATE OR REPLACE FUNCTION public.redirect_folder_access(p_folder uuid, p_values jsonb DEFAULT NULL::jsonb, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid; entry jsonb;
BEGIN
 PERFORM public.redirect_management_scope(p_token_id,CASE WHEN p_values IS NULL THEN 'workspace:read' ELSE 'workspace:write' END);
 member:=public.redirect_principal_member(p_token_id);
 IF public.redirect_folder_rank(member,p_folder)<3 THEN RAISE EXCEPTION 'Folder owner access is required' USING ERRCODE='42501';END IF;
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

CREATE OR REPLACE FUNCTION public.redirect_can_create_in_folder(p_principal uuid, p_folder uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid; selected uuid[];key_scopes text[];
BEGIN
 IF p_principal IS NOT NULL THEN SELECT redirect_ids,scopes INTO selected,key_scopes FROM public.redirect_api_tokens WHERE id=p_principal AND workspace_id=selected_workspace;IF selected IS NOT NULL OR key_scopes IS NOT NULL AND NOT('links:write'=ANY(key_scopes)) THEN RETURN false;END IF;END IF;
 member:=public.redirect_principal_member(p_principal);
 RETURN public.redirect_folder_rank(member,p_folder)>=2;
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
 RETURN public.redirect_folder_rank(member,folder)>=2;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_workspace_resource(p_kind text, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();table_name text; scope_ids uuid[]; rows jsonb; count_value bigint; result jsonb; changed uuid; member uuid; member_role text;
BEGIN
 IF p_kind NOT IN('folders','tags','templates') OR p_action NOT IN('list','get','create','update','delete') OR p_kind IS NULL OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid workspace operation' USING ERRCODE='22023'; END IF;
 scope_ids:=public.redirect_management_scope(p_token_id,CASE WHEN p_action IN('list','get') THEN 'workspace:read' ELSE 'workspace:write' END);
 member:=public.redirect_principal_member(p_token_id);
 IF member IS NOT NULL THEN
  SELECT role INTO member_role FROM public.redirect_workspace_members WHERE id=member AND workspace_id=selected_workspace;
  IF p_action NOT IN('list','get') AND (p_kind<>'folders' OR member_role='viewer' OR (p_action<>'create' AND public.redirect_folder_rank(member,p_id)<CASE WHEN p_action='update' THEN 2 ELSE 3 END)) THEN RAISE EXCEPTION 'Folder owner access is required' USING ERRCODE='42501';END IF;
  IF p_action='delete' AND EXISTS(SELECT FROM public.redirect_link_metadata WHERE folder_id=p_id AND workspace_id=selected_workspace) THEN RAISE EXCEPTION 'Move links before deleting this folder' USING ERRCODE='22023';END IF;
 END IF;
 table_name:=CASE p_kind WHEN 'folders' THEN 'redirect_link_folders' WHEN 'tags' THEN 'redirect_link_tags' ELSE 'redirect_utm_templates' END;
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid resource page' USING ERRCODE='22023'; END IF;
  EXECUTE format('WITH records AS MATERIALIZED(SELECT * FROM public.%I WHERE workspace_id=$5 AND ($3 IS NULL OR $4<>''folders'' OR public.redirect_folder_rank($3,id)>=1)), page AS(SELECT * FROM records WHERE $1 IS NULL OR id>$1 ORDER BY id LIMIT $2+1) SELECT (SELECT count(*) FROM records),coalesce(jsonb_agg(to_jsonb(page) ORDER BY id),''[]''::jsonb) FROM page',table_name)
   INTO count_value,rows USING p_after,p_limit,member,p_kind,selected_workspace;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO result FROM jsonb_array_elements(rows) WITH ORDINALITY e(value,ordinal) WHERE ordinal<=p_limit;
  IF p_kind='folders' THEN SELECT coalesce(jsonb_agg(value||public.redirect_folder_capabilities((value->>'id')::uuid,p_token_id) ORDER BY ordinal),'[]'::jsonb) INTO result FROM jsonb_array_elements(result) WITH ORDINALITY e(value,ordinal);END IF;
  RETURN jsonb_build_object('data',result,'count',count_value,'nextCursor',CASE WHEN jsonb_array_length(rows)>p_limit THEN result->(p_limit-1)->>'id' ELSE NULL END);
 END IF;
 IF p_action='get' THEN
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 AND workspace_id=$2',table_name) INTO result USING p_id,selected_workspace;
  IF result IS NULL OR (member IS NOT NULL AND p_kind='folders' AND public.redirect_folder_rank(member,p_id)<1) THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='P0002'; END IF;
  IF p_kind='folders' THEN result:=result||public.redirect_folder_capabilities(p_id,p_token_id);END IF;
  RETURN result;
 END IF;
 IF p_action IN('update','delete') THEN
  EXECUTE format('SELECT id FROM public.%I WHERE id=$1 AND workspace_id=$2 FOR UPDATE',table_name) INTO changed USING p_id,selected_workspace;
  IF changed IS NULL THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='P0002'; END IF;
 END IF;
 IF p_action='delete' THEN
  EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND workspace_id=$2',table_name) USING p_id,selected_workspace;
  RETURN jsonb_build_object('id',p_id,'deleted',true);
 END IF;
 IF p_action='create' THEN
  IF p_kind='folders' THEN INSERT INTO public.redirect_link_folders(workspace_id,name,description) VALUES(selected_workspace,p_values->>'name',coalesce(p_values->>'description','')) RETURNING to_jsonb(redirect_link_folders.*) INTO result;
  ELSIF p_kind='tags' THEN INSERT INTO public.redirect_link_tags(workspace_id,name,color) VALUES(selected_workspace,p_values->>'name',coalesce(p_values->>'color','gray')) RETURNING to_jsonb(redirect_link_tags.*) INTO result;
  ELSE INSERT INTO public.redirect_utm_templates(workspace_id,name,parameters) VALUES(selected_workspace,p_values->>'name',coalesce(p_values->'parameters','{}')) RETURNING to_jsonb(redirect_utm_templates.*) INTO result;
  END IF;
 ELSE
  IF p_kind='folders' THEN UPDATE public.redirect_link_folders SET name=CASE WHEN p_values?'name' THEN p_values->>'name' ELSE name END,description=CASE WHEN p_values?'description' THEN p_values->>'description' ELSE description END WHERE id=p_id AND workspace_id=selected_workspace RETURNING to_jsonb(redirect_link_folders.*) INTO result;
  ELSIF p_kind='tags' THEN UPDATE public.redirect_link_tags SET name=CASE WHEN p_values?'name' THEN p_values->>'name' ELSE name END,color=CASE WHEN p_values?'color' THEN p_values->>'color' ELSE color END WHERE id=p_id AND workspace_id=selected_workspace RETURNING to_jsonb(redirect_link_tags.*) INTO result;
  ELSE UPDATE public.redirect_utm_templates SET name=CASE WHEN p_values?'name' THEN p_values->>'name' ELSE name END,parameters=CASE WHEN p_values?'parameters' THEN p_values->'parameters' ELSE parameters END WHERE id=p_id AND workspace_id=selected_workspace RETURNING to_jsonb(redirect_utm_templates.*) INTO result;
  END IF;
 END IF;
 IF p_action='create' AND p_kind='folders' AND member IS NOT NULL THEN INSERT INTO public.redirect_folder_members(workspace_id,folder_id,member_id,permission) VALUES(selected_workspace,(result->>'id')::uuid,member,'owner');END IF;
 IF p_kind='folders' THEN result:=result||public.redirect_folder_capabilities((result->>'id')::uuid,p_token_id);END IF;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_access_notify(p_request uuid, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();r public.redirect_access_requests; recipient uuid; url text;
BEGIN
 SELECT * INTO STRICT r FROM public.redirect_access_requests WHERE id=p_request AND workspace_id=selected_workspace;
 url:='/links-workspace?accessRequests='||CASE WHEN p_event='requested' THEN 'review' ELSE 'mine' END;
 FOR recipient IN SELECT user_id FROM public.redirect_folder_owners(r.folder_id) WHERE p_event='requested'
 UNION SELECT user_id FROM public.redirect_workspace_members WHERE id=r.member_id AND workspace_id=selected_workspace AND p_event IN('approved','denied') LOOP
  INSERT INTO public.notifications(user_id,type,title,content,action_url,related_id,metadata)
  VALUES(recipient,'system',CASE WHEN p_event='requested' THEN 'Link folder edit request' ELSE 'Link folder access request updated' END,
   'Open the link workspace to review this access request.',url,r.id,jsonb_build_object('redirect_access_request',r.id,'event',p_event,'redirect_workspace',selected_workspace));
  INSERT INTO public.redirect_access_mail(workspace_id,request_id,recipient_user_id,recipient_email,event)
  SELECT selected_workspace,r.id,recipient,u.email,p_event FROM public.redirect_access_recipient(recipient) u
  ON CONFLICT(request_id,recipient_user_id,event) DO NOTHING;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_access_request(p_action text, p_principal uuid, p_id uuid DEFAULT NULL::uuid, p_folder uuid DEFAULT NULL::uuid, p_message text DEFAULT ''::text, p_permission text DEFAULT 'edit'::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);member public.redirect_workspace_members;r public.redirect_access_requests; last_at timestamptz; rate integer; actor uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 PERFORM public.redirect_management_scope(p_principal,'workspace:read');
 IF p_principal IS NOT NULL THEN
  SELECT * INTO member FROM public.redirect_workspace_members WHERE id=p_principal AND workspace_id=selected_workspace AND active AND kind='user';
  IF member.id IS NULL THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='create' THEN
  IF member.id IS NULL OR public.redirect_folder_rank(member.id,p_folder)<>1 THEN RAISE EXCEPTION 'A view-only folder is required' USING ERRCODE='42501';END IF;
  IF p_message IS NULL OR length(p_message)>1000 THEN RAISE EXCEPTION 'Message exceeds 1,000 characters' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.redirect_access_requests WHERE workspace_id=selected_workspace AND folder_id=p_folder AND member_id=member.id AND status='pending';
  IF r.id IS NOT NULL THEN RETURN to_jsonb(r)||jsonb_build_object('duplicate',true);END IF;
  SELECT max(created_at),count(*) INTO last_at,rate FROM public.redirect_access_requests WHERE workspace_id=selected_workspace AND member_id=member.id AND created_at>clock_timestamp()-interval '1 day' AND folder_id=p_folder;
  IF rate>0 THEN RETURN jsonb_build_object('retryAfter',greatest(1,ceil(extract(epoch FROM last_at+interval '1 day'-clock_timestamp()))::int));END IF;
  SELECT count(*) INTO rate FROM public.redirect_access_requests WHERE workspace_id=selected_workspace AND member_id=member.id AND created_at>clock_timestamp()-interval '1 day';
  IF rate>=10 THEN RETURN jsonb_build_object('retryAfter',86400);END IF;
  IF NOT EXISTS(SELECT FROM public.redirect_folder_owners(p_folder)) THEN RAISE EXCEPTION 'No folder administrator is available; contact a workspace administrator' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_access_requests(workspace_id,folder_id,member_id,message) VALUES(selected_workspace,p_folder,member.id,btrim(p_message)) RETURNING * INTO r;
  PERFORM public.redirect_access_notify(r.id,'requested');
  RETURN to_jsonb(r);
 END IF;
 SELECT * INTO r FROM public.redirect_access_requests WHERE id=p_id AND workspace_id=selected_workspace FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002';END IF;
 IF p_action='cancel' THEN
  IF member.id IS NULL OR r.member_id<>member.id THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002';END IF;
 ELSIF p_action IN('approve','deny') THEN
  IF public.redirect_folder_rank(member.id,r.folder_id)<3 THEN RAISE EXCEPTION 'Folder owner access is required' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'Invalid request action' USING ERRCODE='22023';END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Request was already resolved' USING ERRCODE='23505';END IF;
 IF p_action='approve' THEN
  IF p_permission IS NULL OR p_permission NOT IN('edit','owner') THEN RAISE EXCEPTION 'Choose edit or owner access' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE id=r.member_id AND workspace_id=selected_workspace AND active AND role='member') THEN RAISE EXCEPTION 'A workspace administrator must activate or upgrade the viewer membership before approval' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_folder_members(workspace_id,folder_id,member_id,permission) VALUES(selected_workspace,r.folder_id,r.member_id,p_permission) ON CONFLICT(folder_id,member_id) DO UPDATE SET permission=excluded.permission;
 END IF;
 actor:=coalesce(member.user_id,p_actor);
 UPDATE public.redirect_access_requests SET status=CASE p_action WHEN 'approve' THEN 'approved' WHEN 'deny' THEN 'denied' ELSE 'cancelled' END,
  granted_permission=CASE WHEN p_action='approve' THEN p_permission ELSE NULL END,decided_by=actor,updated_at=clock_timestamp() WHERE id=r.id AND workspace_id=selected_workspace RETURNING * INTO r;
 UPDATE public.redirect_access_mail SET state='cancelled',updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND request_id=r.id AND event='requested' AND state IN('queued','leased');
 IF p_action IN('approve','deny') THEN PERFORM public.redirect_access_notify(r.id,r.status);END IF;
 RETURN to_jsonb(r);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_access_requests_page(p_principal uuid, p_view text DEFAULT 'mine'::text, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();member uuid;rows jsonb;total bigint;next_id text;
BEGIN
 PERFORM public.redirect_management_scope(p_principal,'workspace:read');
 IF p_view IS NULL OR p_view NOT IN('mine','review') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid request page' USING ERRCODE='22023';END IF;
 IF p_principal IS NOT NULL THEN SELECT id INTO member FROM public.redirect_workspace_members WHERE id=p_principal AND workspace_id=selected_workspace AND kind='user' AND active;IF member IS NULL THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;END IF;
 WITH visible AS MATERIALIZED(
  SELECT r.*,CASE WHEN public.redirect_folder_rank(member,r.folder_id)>=1 THEN f.name ELSE 'Restricted folder' END AS folder_name,m.label AS member_label,m.role AS member_role,m.active AS member_active
  FROM public.redirect_access_requests r JOIN public.redirect_link_folders f ON f.id=r.folder_id AND f.workspace_id=selected_workspace JOIN public.redirect_workspace_members m ON m.id=r.member_id AND m.workspace_id=selected_workspace
  WHERE r.workspace_id=selected_workspace AND ((p_view='mine' AND r.member_id=member) OR (p_view='review' AND r.status='pending' AND public.redirect_folder_rank(member,r.folder_id)>=3))
 ),page AS MATERIALIZED(SELECT * FROM visible WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT (SELECT count(*) FROM visible),coalesce(jsonb_agg(to_jsonb(shown) ORDER BY id),'[]'::jsonb),CASE WHEN (SELECT count(*) FROM page)>p_limit THEN max(id::text) ELSE NULL END INTO total,rows,next_id FROM shown;
 RETURN jsonb_build_object('data',rows,'count',total,'nextCursor',next_id);
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_access_mail(p_from text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();job public.redirect_access_mail; request public.redirect_access_requests; valid boolean; result jsonb:='[]';
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_from IS NULL OR length(p_from) NOT BETWEEN 3 AND 320 OR p_from ~ E'[\r\n]' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid mail claim' USING ERRCODE='22023';END IF;
 FOR job IN SELECT * FROM public.redirect_access_mail WHERE workspace_id=selected_workspace AND ((state='queued' AND next_attempt_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO request FROM public.redirect_access_requests WHERE id=job.request_id AND workspace_id=selected_workspace;
  SELECT EXISTS(SELECT FROM public.redirect_access_recipient(job.recipient_user_id) u WHERE u.email=job.recipient_email) INTO valid;
  valid:=valid AND CASE WHEN job.event='requested' THEN request.status='pending' AND EXISTS(SELECT FROM public.redirect_folder_owners(request.folder_id) WHERE user_id=job.recipient_user_id)
   ELSE request.status=job.event AND EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=request.member_id AND user_id=job.recipient_user_id AND active) END;
  IF NOT coalesce(valid,false) THEN UPDATE public.redirect_access_mail SET state='cancelled',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace;CONTINUE;END IF;
  IF job.attempts>=8 OR job.first_attempt_at<clock_timestamp()-interval '23 hours' THEN UPDATE public.redirect_access_mail SET state='failed',last_error='Delivery retry window elapsed',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace;CONTINUE;END IF;
  UPDATE public.redirect_access_mail SET state='leased',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),from_address=coalesce(from_address,p_from),updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace RETURNING * INTO job;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'leaseId',job.lease_id,'email',job.recipient_email,'from',job.from_address,'event',job.event));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_access_mail(p_id uuid, p_lease uuid, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_retry boolean DEFAULT true, p_retry_after integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();job public.redirect_access_mail;
BEGIN
 SELECT * INTO job FROM public.redirect_access_mail WHERE id=p_id AND workspace_id=selected_workspace AND state='leased' AND lease_id=p_lease FOR UPDATE;
 IF job.id IS NULL THEN RETURN false;END IF;
 IF p_provider_id IS NOT NULL AND length(p_provider_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid provider receipt' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_access_mail SET state=CASE WHEN p_provider_id IS NOT NULL THEN 'sent' WHEN p_retry AND attempts<8 AND first_attempt_at>clock_timestamp()-interval '23 hours' THEN 'queued' ELSE 'failed' END,
  next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(3600,30*(2^greatest(0,attempts-1))::integer),least(82800,greatest(0,coalesce(p_retry_after,0))))),
  provider_id=p_provider_id,last_error=CASE WHEN p_provider_id IS NULL THEN left(coalesce(p_error,'Email delivery unavailable'),200) ELSE NULL END,
  lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_id AND workspace_id=selected_workspace;
 RETURN true;
END $function$;

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
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',resource);
  EXECUTE format('CREATE POLICY redirect_legacy_direct_access ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(workspace_id=%L::uuid) WITH CHECK(workspace_id=%L::uuid)',resource,'58aa4340-8f21-4b7f-9a10-90be2da89c01','58aa4340-8f21-4b7f-9a10-90be2da89c01');
 END LOOP;
END $$;

-- Preserve final authorization after account-context verification returns.
CREATE OR REPLACE FUNCTION public.record_redirect_conversion(p_event jsonb,p_token_id uuid DEFAULT NULL,p_registered_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 visit public.redirect_events; token public.redirect_api_tokens; saved public.redirect_link_conversions;
 event_click uuid := nullif(p_event->>'clickId','')::uuid;
 customer text := nullif(p_event->>'customerExternalId','');
 event_kind text := p_event->>'kind'; event_key text := p_event->>'eventId';
 event_amount numeric := nullif(p_event->>'amount','')::numeric;
 event_currency text := nullif(p_event->>'currency','');
 event_time timestamptz := coalesce(nullif(p_event->>'occurredAt','')::timestamptz,now());
 inserted uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 -- Native signups have separate verified-account/timing checks. Manual account
 -- conversions must recheck current owner state at the write boundary.
 IF p_token_id IS NULL AND p_registered_at IS NULL THEN PERFORM public.redirect_management_scope(NULL,'conversions:write');END IF;
 IF event_kind IS NULL OR event_kind NOT IN ('lead','sale') OR customer IS NULL OR length(customer)>256
 OR event_key IS NULL OR length(event_key) NOT BETWEEN 1 AND 256
 OR coalesce(length(p_event->>'eventName'),0) NOT BETWEEN 1 AND 120
 OR jsonb_typeof(coalesce(p_event->'metadata','{}')) <> 'object'
 OR length(coalesce(p_event->'metadata','{}')::text)>8192
 OR event_time>now()+interval '5 minutes'
 OR (event_kind='lead' AND (event_amount IS NOT NULL OR event_currency IS NOT NULL))
 OR (event_kind='sale' AND (event_amount IS NULL OR event_amount<0 OR event_amount>=1e12 OR event_amount<>round(event_amount,6) OR event_amount::text IN ('NaN','Infinity','-Infinity') OR event_currency IS NULL OR event_currency !~ '^[A-Z]{3}$'))
 THEN RAISE EXCEPTION 'Invalid conversion event' USING ERRCODE='22023'; END IF;
 IF event_click IS NULL THEN SELECT click_id INTO event_click FROM public.redirect_link_customers WHERE customer_key=customer; END IF;
 SELECT * INTO visit FROM public.redirect_events WHERE click_id=event_click;
 IF visit.id IS NULL THEN RAISE EXCEPTION 'Attributed click not found' USING ERRCODE='P0002'; END IF;
 IF event_time<visit.ts THEN RAISE EXCEPTION 'Conversion precedes click' USING ERRCODE='22023'; END IF;
 IF p_registered_at IS NOT NULL AND (event_kind<>'lead' OR visit.ts>p_registered_at OR visit.ts<p_registered_at-interval '30 days') THEN
  RAISE EXCEPTION 'Signup is not attributable to this click' USING ERRCODE='22023';
 END IF;
 IF p_token_id IS NOT NULL AND NOT(visit.redirect_id=ANY(coalesce(public.redirect_management_scope(p_token_id,'conversions:write'),ARRAY[visit.redirect_id]))) THEN
  RAISE EXCEPTION 'Credential cannot attribute this link' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.redirect_link_conversions(click_id,kind,amount,currency,customer_key,provider_event_id,metadata,event_name,occurred_at)
 VALUES(event_click,event_kind,event_amount,event_currency,customer,event_key,coalesce(p_event->'metadata','{}'),p_event->>'eventName',event_time)
 ON CONFLICT(provider_event_id) DO NOTHING RETURNING id INTO inserted;
 SELECT * INTO saved FROM public.redirect_link_conversions WHERE provider_event_id=event_key;
 IF inserted IS NULL AND (saved.click_id IS DISTINCT FROM event_click OR saved.kind IS DISTINCT FROM event_kind
  OR saved.amount IS DISTINCT FROM event_amount OR saved.currency IS DISTINCT FROM event_currency
  OR saved.customer_key IS DISTINCT FROM customer OR saved.event_name IS DISTINCT FROM (p_event->>'eventName')
  OR saved.metadata IS DISTINCT FROM coalesce(p_event->'metadata','{}')
  OR (p_event ? 'occurredAt' AND saved.occurred_at IS DISTINCT FROM event_time)) THEN
  RAISE EXCEPTION 'Event ID was already used with different data' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.redirect_link_customers(customer_key,click_id) VALUES(customer,event_click) ON CONFLICT(customer_key) DO NOTHING;
 RETURN jsonb_build_object('id',saved.id,'clickId',saved.click_id,'kind',saved.kind,'duplicate',inserted IS NULL);
END $$;
