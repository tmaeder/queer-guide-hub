-- Account discovery is independent of private selection. Only active current
-- Owner/human-member grants appear; a selected UUID never grants access.
CREATE FUNCTION public.redirect_account_workspaces(p_actor uuid,p_selected uuid DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE headers jsonb;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid workspace discovery request' USING ERRCODE='22023';END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 IF nullif(headers->>'x-qg-redirect-session-actor','') IS NOT NULL AND(headers->>'x-qg-redirect-session-actor')::uuid<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 WITH visible AS MATERIALIZED(
  SELECT w.id,w.name,w.slug,w.is_legacy,CASE WHEN redirect_internal.workspace_owner(w.id,p_actor) THEN 'owner' ELSE m.role END AS role
  FROM public.redirect_workspaces w LEFT JOIN public.redirect_workspace_members m ON m.workspace_id=w.id AND m.user_id=p_actor AND m.kind='user' AND m.active
  WHERE w.status='active' AND(redirect_internal.workspace_owner(w.id,p_actor) OR m.id IS NOT NULL)
 ),page AS(SELECT id,name,slug,role FROM visible ORDER BY is_legacy DESC,id OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY (id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid) DESC,id) FROM page),'[]'),
  'count',(SELECT count(*) FROM visible),'nextOffset',CASE WHEN (SELECT count(*) FROM visible)>p_offset+100 THEN p_offset+100 ELSE NULL END,
  'currentWorkspaceId',CASE WHEN p_selected IS NOT NULL THEN(SELECT id FROM visible WHERE id=p_selected) ELSE(SELECT id FROM visible ORDER BY is_legacy DESC,id LIMIT 1) END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_account_workspaces(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_account_workspaces(uuid,uuid,integer) TO service_role;
