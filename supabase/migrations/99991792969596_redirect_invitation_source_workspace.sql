-- Recipient discovery and acceptance derive an active source workspace from the
-- saved invitation; owner administration retains explicit private selection.
CREATE OR REPLACE FUNCTION public.redirect_workspace_invitation(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_hash text DEFAULT NULL::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid;headers jsonb;saved public.redirect_workspace_invitations; membership public.redirect_workspace_members; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF p_actor IS NULL OR p_action IS NULL OR p_action NOT IN('list','create','revoke','accept') THEN RAISE EXCEPTION 'Invalid invitation operation' USING ERRCODE='22023';END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 IF nullif(headers->>'x-qg-redirect-session-actor','') IS NOT NULL AND (headers->>'x-qg-redirect-session-actor')::uuid<>p_actor THEN RAISE EXCEPTION 'Session account does not match the invitation actor' USING ERRCODE='42501';END IF;
 IF p_action<>'accept' THEN
  selected_workspace:=public.redirect_request_workspace(p_actor);
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
 SELECT * INTO saved FROM public.redirect_workspace_invitations WHERE ((p_hash IS NOT NULL AND token_hash=p_hash) OR (p_hash IS NULL AND id=p_id)) AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=workspace_id AND w.status='active') FOR UPDATE;
 IF saved.id IS NULL OR saved.revoked_at IS NOT NULL OR saved.expires_at<=clock_timestamp() OR NOT public.redirect_invitation_recipient(p_actor,saved.email) OR NOT redirect_internal.workspace_owner(saved.workspace_id,saved.created_by) OR (saved.accepted_at IS NOT NULL AND saved.accepted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 selected_workspace:=saved.workspace_id;
 SELECT * INTO membership FROM public.redirect_workspace_members WHERE user_id=p_actor AND workspace_id=selected_workspace FOR UPDATE;
 IF membership.id IS NOT NULL AND NOT membership.active THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF saved.accepted_at IS NOT NULL AND (membership.id IS NULL OR membership.id IS DISTINCT FROM saved.member_id) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF membership.id IS NULL THEN
  INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES(selected_workspace,p_actor,'user',saved.label,saved.role) RETURNING * INTO membership;
 END IF;
 UPDATE public.redirect_workspace_invitations SET accepted_by=p_actor,accepted_at=coalesce(accepted_at,clock_timestamp()),member_id=membership.id WHERE id=saved.id AND workspace_id=selected_workspace;
 RETURN jsonb_build_object('memberId',membership.id,'role',membership.role,'accepted',true,'workspace',(SELECT jsonb_build_object('id',id,'name',name,'slug',slug) FROM public.redirect_workspaces WHERE id=selected_workspace));
END $function$;
CREATE OR REPLACE FUNCTION public.redirect_invitation_inbox(p_actor uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE headers jsonb;result jsonb;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Choose a verified account' USING ERRCODE='22023';END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 IF nullif(headers->>'x-qg-redirect-session-actor','') IS NOT NULL AND(headers->>'x-qg-redirect-session-actor')::uuid<>p_actor THEN RAISE EXCEPTION 'Session account does not match the invitation actor' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
 WITH verified AS MATERIALIZED(SELECT lower(email) AS email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL),
 visible AS MATERIALIZED(SELECT i.id,i.label,i.role,i.expires_at,i.created_at,jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug) AS workspace FROM public.redirect_workspace_invitations i JOIN verified account ON account.email=i.email JOIN public.redirect_workspaces w ON w.id=i.workspace_id AND w.status='active' WHERE i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() AND redirect_internal.workspace_owner(i.workspace_id,i.created_by)),
 page AS(SELECT * FROM visible ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'data',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]')) INTO result;
 RETURN result;
END $function$;
