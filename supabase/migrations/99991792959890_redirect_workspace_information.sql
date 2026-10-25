-- Read-only account-session views for every current workspace role. Never reuse
-- owner configuration serializers: hashes, signing keys, DNS proofs, recipients
-- and webhook paths/query strings must not enter these responses.
CREATE FUNCTION public.redirect_workspace_information(p_actor uuid,p_kind text,p_limit integer DEFAULT 50,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;selected_workspace uuid;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('domains','tokens','webhooks') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid workspace information page' USING ERRCODE='22023';END IF;
 context:=public.redirect_workspace_context(p_actor,p_scope=>'workspace:read');
 selected_workspace:=(context#>>'{workspace,id}')::uuid;
 WITH records AS MATERIALIZED(
  SELECT d.id,jsonb_build_object('id',d.id,'name',d.hostname,'createdAt',d.created_at,
   'status',CASE WHEN d.archived THEN 'archived' WHEN d.disabled THEN 'disabled' WHEN public.redirect_public_domain(d.hostname,true) IS NOT NULL THEN 'ready' ELSE 'setup_required' END) AS data
  FROM public.redirect_domains d WHERE p_kind='domains' AND d.workspace_id=selected_workspace
  UNION ALL
  SELECT t.id,jsonb_build_object('id',t.id,'name',t.name,'prefix',left(t.prefix,16),'scopes',t.scopes,
   'linkCount',CASE WHEN t.redirect_ids IS NULL THEN NULL ELSE(SELECT count(*) FROM public.redirects r WHERE r.workspace_id=selected_workspace AND r.id=ANY(t.redirect_ids)) END,'memberBound',t.member_id IS NOT NULL,'createdAt',t.created_at,'expiresAt',t.expires_at,'lastUsedAt',t.last_used_at,
   'status',CASE WHEN t.revoked_at IS NOT NULL THEN 'revoked' WHEN t.expires_at<=clock_timestamp() THEN 'expired'
    WHEN t.member_id IS NULL AND NOT redirect_internal.workspace_owner(t.workspace_id,t.created_by) THEN 'unavailable'
    WHEN t.member_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_workspace_members m WHERE m.workspace_id=t.workspace_id AND m.id=t.member_id AND m.active) THEN 'unavailable' ELSE 'active' END)
  FROM public.redirect_api_tokens t WHERE p_kind='tokens' AND t.workspace_id=selected_workspace
  UNION ALL
  SELECT w.id,jsonb_build_object('id',w.id,'name',w.name,'receiverHost',substring(w.url FROM '^https://[^/?#]+'),'eventTypes',w.event_types,
   'createdAt',w.created_at,'status',CASE WHEN w.deleted_at IS NOT NULL THEN 'archived' WHEN NOT w.enabled THEN 'disabled' WHEN NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by) THEN 'unavailable' ELSE 'active' END)
  FROM public.redirect_webhooks w WHERE p_kind='webhooks' AND w.workspace_id=selected_workspace
 ),page AS(SELECT * FROM records WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),
 shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(data ORDER BY id) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM records),
 'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT id FROM shown ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_workspace_information(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_workspace_information(uuid,text,integer,uuid) TO service_role;
