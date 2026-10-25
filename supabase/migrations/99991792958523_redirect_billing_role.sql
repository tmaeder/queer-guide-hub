-- Billing is read-only for Links and analytics; it grants no application admin,
-- billing-provider or payout authority. Members may manage workspace tags.
-- Current owner, tenant selector and folder/key limits remain authoritative.
ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_role_check,
 ADD CONSTRAINT redirect_workspace_members_role_check CHECK(role IN('member','viewer','billing'));
ALTER TABLE public.redirect_workspace_invitations DROP CONSTRAINT redirect_workspace_invitations_role_check,
 ADD CONSTRAINT redirect_workspace_invitations_role_check CHECK(role IN('member','viewer','billing'));
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
 RETURN CASE WHEN workspace_role IN('viewer','billing') THEN least(score,1) ELSE score END;
END $function$
;
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
  IF p_action NOT IN('list','get') AND (member_role IN('viewer','billing') OR p_kind NOT IN('folders','tags') OR (p_kind='folders' AND p_action<>'create' AND public.redirect_folder_rank(member,p_id)<CASE WHEN p_action='update' THEN 2 ELSE 3 END)) THEN RAISE EXCEPTION 'Workspace role or folder permission does not allow this change' USING ERRCODE='42501';END IF;
  IF p_kind='folders' AND p_action='delete' AND EXISTS(SELECT FROM public.redirect_link_metadata WHERE folder_id=p_id AND workspace_id=selected_workspace) THEN RAISE EXCEPTION 'Move links before deleting this folder' USING ERRCODE='22023';END IF;
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
END $function$
;
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
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
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
 IF p_values?'role' AND (jsonb_typeof(p_values->'role') IS DISTINCT FROM 'string' OR p_values->>'role' NOT IN('member','viewer','billing')) OR p_values?'active' AND jsonb_typeof(p_values->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid member role or status' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  IF jsonb_typeof(p_values->'kind') IS DISTINCT FROM 'string' OR p_values->>'kind' NOT IN('user','machine') OR (p_values->>'kind'='user' AND (jsonb_typeof(p_values->'user_id') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT FROM auth.users WHERE id=(p_values->>'user_id')::uuid))) OR (p_values->>'kind'='machine' AND coalesce(p_values->'user_id','null'::jsonb)<>'null'::jsonb) THEN RAISE EXCEPTION 'Choose an existing account UUID or a machine member' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_members(workspace_id,label,role,active,kind,user_id) VALUES(selected_workspace,btrim(p_values->>'label'),coalesce(p_values->>'role','member'),coalesce((p_values->>'active')::boolean,true),p_values->>'kind',nullif(p_values->>'user_id','')::uuid) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_workspace_members SET label=CASE WHEN p_values?'label' THEN btrim(p_values->>'label') ELSE label END,role=CASE WHEN p_values?'role' THEN p_values->>'role' ELSE role END,active=CASE WHEN p_values?'active' THEN (p_values->>'active')::boolean ELSE active END WHERE id=p_id AND workspace_id=selected_workspace RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='P0002';END IF;
 END IF;
 RETURN to_jsonb(saved);
END $function$
;
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
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
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
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('email','label','role')) OR jsonb_typeof(p_values->'email') IS DISTINCT FROM 'string' OR jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100 OR length(btrim(p_values->>'email'))>254 OR btrim(p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_values->>'role' IS NULL OR p_values->>'role' NOT IN('member','viewer','billing') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation fields' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND created_by=p_actor AND created_at>now()-interval '1 hour')>=20 OR (SELECT count(*) FROM public.redirect_workspace_invitations WHERE created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'Invitation creation limit reached; try later' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_invitations(workspace_id,email,label,role,token_hash,created_by) VALUES(selected_workspace,lower(btrim(p_values->>'email')),btrim(p_values->>'label'),p_values->>'role',p_hash,p_actor) RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
 END IF;
 SELECT * INTO saved FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND ((p_hash IS NOT NULL AND token_hash=p_hash) OR (p_hash IS NULL AND id=p_id)) FOR UPDATE;
 IF saved.id IS NULL OR saved.revoked_at IS NOT NULL OR saved.expires_at<=clock_timestamp() OR NOT public.redirect_invitation_recipient(p_actor,saved.email) OR NOT redirect_internal.workspace_owner(saved.workspace_id,saved.created_by) OR (saved.accepted_at IS NOT NULL AND saved.accepted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 SELECT * INTO membership FROM public.redirect_workspace_members WHERE user_id=p_actor AND workspace_id=selected_workspace FOR UPDATE;
 IF membership.id IS NOT NULL AND NOT membership.active THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF saved.accepted_at IS NOT NULL AND (membership.id IS NULL OR membership.id IS DISTINCT FROM saved.member_id) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF membership.id IS NULL THEN
  INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES(selected_workspace,p_actor,'user',saved.label,saved.role) RETURNING * INTO membership;
 END IF;
 UPDATE public.redirect_workspace_invitations SET accepted_by=p_actor,accepted_at=coalesce(accepted_at,clock_timestamp()),member_id=membership.id WHERE id=saved.id AND workspace_id=selected_workspace;
 RETURN jsonb_build_object('memberId',membership.id,'role',membership.role,'accepted',true);
END $function$
;
CREATE OR REPLACE FUNCTION redirect_internal.principal_link_scope(p_workspace uuid, p_token_id uuid, p_scope text, p_session_actor uuid DEFAULT NULL::uuid, p_legacy_internal boolean DEFAULT false)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 AND least(CASE WHEN member.role IN('viewer','billing') THEN 1 ELSE 3 END,
  CASE WHEN m.folder_id IS NULL THEN 2 ELSE CASE coalesce(a.permission,f.default_permission) WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END END)>=required_rank;
 RETURN ids;
END $function$
;
