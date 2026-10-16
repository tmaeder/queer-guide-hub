-- No invitation tokens are persisted in browser storage during sign-in.
CREATE INDEX redirect_invitation_recipient_pending ON public.redirect_workspace_invitations(email,created_at DESC) WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE FUNCTION public.redirect_invitation_inbox(p_actor uuid,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
 WITH verified AS MATERIALIZED(SELECT lower(email) AS email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL),
 visible AS MATERIALIZED(SELECT i.id,i.label,i.role,i.expires_at,i.created_at FROM public.redirect_workspace_invitations i JOIN verified account ON account.email=i.email WHERE i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() AND EXISTS(SELECT FROM public.user_roles WHERE user_id=i.created_by AND role='admin')),
 page AS(SELECT * FROM visible ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'data',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_invitation_inbox(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_invitation_inbox(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_workspace_invitation(p_actor uuid,p_action text,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_hash text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE saved public.redirect_workspace_invitations; membership public.redirect_workspace_members; result jsonb;
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
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]') INTO result FROM(SELECT id,email,label,role,created_at,expires_at,expires_at<=clock_timestamp() AS expired,revoked_at,accepted_at,member_id FROM public.redirect_workspace_invitations ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_workspace_invitations));
 ELSIF p_action='revoke' THEN
  UPDATE public.redirect_workspace_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_id AND accepted_at IS NULL;
  RETURN jsonb_build_object('id',p_id,'revoked',FOUND);
 ELSIF p_action='create' THEN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('email','label','role')) OR jsonb_typeof(p_values->'email') IS DISTINCT FROM 'string' OR jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100 OR length(btrim(p_values->>'email'))>254 OR btrim(p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_values->>'role' IS NULL OR p_values->>'role' NOT IN('member','viewer') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation fields' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM public.redirect_workspace_invitations WHERE created_by=p_actor AND created_at>now()-interval '1 hour')>=20 OR (SELECT count(*) FROM public.redirect_workspace_invitations WHERE created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'Invitation creation limit reached; try later' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_invitations(email,label,role,token_hash,created_by) VALUES(lower(btrim(p_values->>'email')),btrim(p_values->>'label'),p_values->>'role',p_hash,p_actor) RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
 END IF;
 SELECT * INTO saved FROM public.redirect_workspace_invitations WHERE (p_hash IS NOT NULL AND token_hash=p_hash) OR (p_hash IS NULL AND id=p_id) FOR UPDATE;
 IF saved.id IS NULL OR saved.revoked_at IS NOT NULL OR saved.expires_at<=clock_timestamp() OR NOT public.redirect_invitation_recipient(p_actor,saved.email) OR NOT EXISTS(SELECT FROM public.user_roles WHERE user_id=saved.created_by AND role='admin') OR (saved.accepted_at IS NOT NULL AND saved.accepted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 SELECT * INTO membership FROM public.redirect_workspace_members WHERE user_id=p_actor FOR UPDATE;
 IF membership.id IS NOT NULL AND NOT membership.active THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF saved.accepted_at IS NOT NULL AND (membership.id IS NULL OR membership.id IS DISTINCT FROM saved.member_id) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF membership.id IS NULL THEN
  INSERT INTO public.redirect_workspace_members(user_id,kind,label,role) VALUES(p_actor,'user',saved.label,saved.role) RETURNING * INTO membership;
 END IF;
 UPDATE public.redirect_workspace_invitations SET accepted_by=p_actor,accepted_at=coalesce(accepted_at,clock_timestamp()),member_id=membership.id WHERE id=saved.id;
 RETURN jsonb_build_object('memberId',membership.id,'role',membership.role,'accepted',true);
END $$;
