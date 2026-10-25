-- Explicit workspace Owners do not receive application-admin roles. Registry
-- administration is also available during provisioning; resource activation
-- and private tenant selectors remain fenced by their independent guards.
ALTER TABLE redirect_internal.workspace_owners ADD COLUMN version uuid NOT NULL DEFAULT gen_random_uuid(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE FUNCTION redirect_internal.workspace_owner_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN NEW.version:=gen_random_uuid();NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
CREATE TRIGGER workspace_owner_revision BEFORE UPDATE ON redirect_internal.workspace_owners FOR EACH ROW EXECUTE FUNCTION redirect_internal.workspace_owner_revision();
CREATE FUNCTION redirect_internal.workspace_owner_json(p_workspace uuid,p_user uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('userId',o.user_id,'label',coalesce(m.label,CASE WHEN w.is_legacy THEN 'Application administrator' WHEN w.created_by=o.user_id THEN 'Workspace creator' ELSE 'Owner account' END),
 'memberRole',m.role,'grantedAt',r.granted_at,'version',r.version,'canRemove',NOT w.is_legacy AND(SELECT count(*) FROM redirect_internal.workspace_owners WHERE workspace_id=p_workspace AND active)>1)
 FROM public.redirect_workspaces w CROSS JOIN LATERAL redirect_internal.workspace_owner_ids(w.id) o
 LEFT JOIN redirect_internal.workspace_owners r ON r.workspace_id=w.id AND r.user_id=o.user_id AND r.active
 LEFT JOIN public.redirect_workspace_members m ON m.workspace_id=w.id AND m.user_id=o.user_id AND m.kind='user' AND m.active
 WHERE w.id=p_workspace AND o.user_id=p_user
$$;
CREATE FUNCTION public.redirect_workspace_ownership(p_actor uuid,p_workspace uuid,p_action text,p_member uuid DEFAULT NULL,p_user uuid DEFAULT NULL,p_version uuid DEFAULT NULL,p_expected_role text DEFAULT NULL,p_limit integer DEFAULT 50,p_after uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;w public.redirect_workspaces;m public.redirect_workspace_members;o redirect_internal.workspace_owners;result jsonb;total integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_workspace IS NULL OR p_action IS NULL OR p_action NOT IN('owners','candidates','admit','revoke') THEN RAISE EXCEPTION 'Choose an account, workspace and ownership operation' USING ERRCODE='22023';END IF;
 IF p_action IN('admit','revoke') THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 IF nullif(context->>'x-qg-redirect-session-actor','') IS NOT NULL AND(context->>'x-qg-redirect-session-actor')::uuid<>p_actor OR nullif(context->>'x-qg-redirect-workspace','') IS NOT NULL AND(context->>'x-qg-redirect-workspace')::uuid<>p_workspace THEN RAISE EXCEPTION 'Ownership context does not match the authenticated request' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.redirect_workspaces WHERE id=p_workspace AND status IN('active','provisioning') FOR SHARE;
 IF w.id IS NULL OR NOT redirect_internal.workspace_owner(p_workspace,p_actor) THEN RAISE EXCEPTION 'Current workspace Owner access is required' USING ERRCODE='42501';END IF;
 IF p_action IN('owners','candidates') THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid ownership page' USING ERRCODE='22023';END IF;
  IF p_action='owners' THEN
   WITH all_rows AS MATERIALIZED(SELECT user_id AS id FROM redirect_internal.workspace_owner_ids(p_workspace)),
   page AS(SELECT id FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT id FROM page ORDER BY id LIMIT p_limit)
   SELECT jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug,'status',w.status),'legacy',w.is_legacy,'data',coalesce((SELECT jsonb_agg(redirect_internal.workspace_owner_json(p_workspace,id) ORDER BY id) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT id FROM shown ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
  ELSE
   WITH all_rows AS MATERIALIZED(SELECT id,user_id,label,role FROM public.redirect_workspace_members WHERE workspace_id=p_workspace AND NOT w.is_legacy AND kind='user' AND active AND NOT EXISTS(SELECT FROM redirect_internal.workspace_owners current_owner WHERE current_owner.workspace_id=p_workspace AND current_owner.user_id=redirect_workspace_members.user_id AND current_owner.active)),
   page AS(SELECT * FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
   SELECT jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug,'status',w.status),'legacy',w.is_legacy,'data',coalesce((SELECT jsonb_agg(jsonb_build_object('memberId',id,'userId',user_id,'label',label,'role',role,'verified',EXISTS(SELECT FROM public.redirect_access_recipient(user_id))) ORDER BY id) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT id FROM shown ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
  END IF;
  RETURN result;
 END IF;
 IF w.is_legacy THEN RAISE EXCEPTION 'Legacy workspace Owners are managed through application user administration' USING ERRCODE='42501';END IF;
 IF p_action='admit' THEN
  IF p_member IS NULL OR p_expected_role IS NULL OR p_expected_role NOT IN('member','viewer','billing') THEN RAISE EXCEPTION 'Review an existing member and their current role' USING ERRCODE='22023';END IF;
  SELECT * INTO m FROM public.redirect_workspace_members WHERE workspace_id=p_workspace AND id=p_member AND kind='user' AND active FOR SHARE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Current workspace member not found' USING ERRCODE='P0002';END IF;
  IF m.role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Member role changed; review Owner access again' USING ERRCODE='23505';END IF;
  IF NOT EXISTS(SELECT FROM public.redirect_access_recipient(m.user_id)) THEN RAISE EXCEPTION 'Owner admission requires a verified account email' USING ERRCODE='22023';END IF;
  SELECT * INTO o FROM redirect_internal.workspace_owners WHERE workspace_id=p_workspace AND user_id=m.user_id AND active FOR SHARE;
  IF o.user_id IS NOT NULL THEN RETURN redirect_internal.workspace_owner_json(p_workspace,o.user_id);END IF;
  SELECT count(*) INTO total FROM redirect_internal.workspace_owners WHERE workspace_id=p_workspace AND active;
  IF total>=25 THEN RAISE EXCEPTION 'A workspace may have at most 25 active Owners' USING ERRCODE='22023';END IF;
  INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id,granted_by) VALUES(p_workspace,m.user_id,p_actor)
  ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=true,granted_by=p_actor,granted_at=clock_timestamp();
  RETURN redirect_internal.workspace_owner_json(p_workspace,m.user_id);
 END IF;
 IF p_user IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'Review the current Owner revision before removal' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM redirect_internal.workspace_owners WHERE workspace_id=p_workspace AND user_id=p_user AND active FOR UPDATE;
 IF o.user_id IS NULL THEN RAISE EXCEPTION 'Current Owner not found' USING ERRCODE='P0002';END IF;
 IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Owner access changed; review removal again' USING ERRCODE='23505';END IF;
 SELECT count(*) INTO total FROM redirect_internal.workspace_owners WHERE workspace_id=p_workspace AND active;
 IF total<=1 THEN RAISE EXCEPTION 'A workspace must retain at least one current Owner' USING ERRCODE='23514';END IF;
 UPDATE redirect_internal.workspace_owners SET active=false WHERE workspace_id=p_workspace AND user_id=p_user;
 RETURN jsonb_build_object('userId',p_user,'removed',true,'remainingOwners',total-1);
END $$;
REVOKE ALL ON FUNCTION redirect_internal.workspace_owner_revision(),redirect_internal.workspace_owner_json(uuid,uuid),public.redirect_workspace_ownership(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.workspace_owner_json(uuid,uuid),public.redirect_workspace_ownership(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid) TO service_role;

CREATE FUNCTION redirect_internal.require_owner_membership_transition(p_workspace uuid,p_member uuid,p_action text,p_values jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action IN('delete','update') AND(p_action='delete' OR p_values?'role' OR p_values->'active'='false'::jsonb) AND EXISTS(SELECT FROM public.redirect_workspace_members member JOIN redirect_internal.workspace_owners owner ON owner.workspace_id=member.workspace_id AND owner.user_id=member.user_id AND owner.active WHERE member.workspace_id=p_workspace AND member.id=p_member) THEN
  RAISE EXCEPTION 'Remove explicit Owner access before changing this account membership role or status' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION redirect_internal.require_owner_membership_transition(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.require_owner_membership_transition(uuid,uuid,text,jsonb) TO service_role;

-- Membership controls must not imply that separate explicit Owner access was
-- revoked. Remove that grant through the reviewed ownership operation first.
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
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') INTO rows FROM(SELECT id,user_id,kind,label,role,active,created_at,EXISTS(SELECT FROM redirect_internal.workspace_owners owner WHERE owner.workspace_id=selected_workspace AND owner.user_id=redirect_workspace_members.user_id AND owner.active) AS "isWorkspaceOwner" FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',rows,'count',total);
 END IF;
 IF p_action IN('update','delete') AND p_id IS NULL OR p_action='create' AND p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid member ID' USING ERRCODE='22023';END IF;
 PERFORM redirect_internal.require_owner_membership_transition(selected_workspace,p_id,p_action,p_values);
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
END $function$;
