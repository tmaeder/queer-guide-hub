-- Public routing derives tenant identity from the globally unique built-in slug
-- or registered hostname, never from visitor workspace headers. Workspaces must
-- be active; the separate tenant activation and resource-write fences remain.
CREATE OR REPLACE FUNCTION public.redirect_public_domain(p_hostname text, p_require_route boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d public.redirect_domains;j public.redirect_domain_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO d FROM public.redirect_domains WHERE hostname=p_hostname AND EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=redirect_domains.workspace_id AND w.status='active') FOR SHARE;
 IF d.id IS NULL OR d.disabled OR d.provider_id IS NULL OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=d.workspace_id AND domain_id=d.id FOR SHARE;
 IF j.domain_id IS NULL OR NOT j.desired OR j.state IN('failed','review','disconnected') OR j.provider_status IS DISTINCT FROM 'active' OR j.ssl_status IS DISTINCT FROM 'active' OR j.checked_at IS NULL OR j.checked_at<=clock_timestamp()-interval '15 minutes' THEN RETURN NULL;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_require_route AND (d.routing_protocol IS DISTINCT FROM 1 OR d.routing_provider_id IS DISTINCT FROM d.provider_id OR d.routing_seen_at IS NULL OR d.routing_seen_at<=clock_timestamp()-interval '24 hours') THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',d.id,'hostname',d.hostname,'rootUrl',d.root_url,'notFoundUrl',d.not_found_url,'expiredUrl',d.expired_url,'needsRouteRefresh',d.routing_protocol IS DISTINCT FROM 1 OR d.routing_provider_id IS DISTINCT FROM d.provider_id OR d.routing_seen_at IS NULL OR d.routing_seen_at<clock_timestamp()-interval '6 hours');
END $function$
;
CREATE FUNCTION redirect_internal.public_link_workspace(p_link uuid,p_hostname text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE workspace uuid;bound_workspace uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IN('queer.guide','www.queer.guide') THEN
  SELECT r.workspace_id INTO workspace FROM public.redirects r JOIN public.redirect_workspaces w ON w.id=r.workspace_id AND w.status='active'
  WHERE r.id=p_link AND r.domain_id IS NULL AND(r.workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid OR r.type='SHORT');
 ELSE
  bound_workspace:=public.redirect_public_workspace(p_hostname);IF bound_workspace IS NULL THEN RETURN NULL;END IF;
  SELECT r.workspace_id INTO workspace FROM public.redirects r JOIN public.redirect_domains d ON d.workspace_id=r.workspace_id AND d.id=r.domain_id
  WHERE r.id=p_link AND r.workspace_id=bound_workspace AND d.hostname=p_hostname AND r.domain_hostname=p_hostname AND(r.workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid OR r.type='SHORT');
 END IF;
 RETURN workspace;
END $$;
REVOKE ALL ON FUNCTION redirect_internal.public_link_workspace(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.public_link_workspace(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.redirect_resolution_snapshot(p_hostname text, p_slug text, p_root boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; domain uuid; result jsonb; readiness jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR p_root IS NULL OR NOT p_root AND (p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$') THEN RAISE EXCEPTION 'Invalid resolution source' USING ERRCODE='22023';END IF;
 IF p_hostname IN('queer.guide','www.queer.guide') AND NOT p_root THEN
  SELECT r.workspace_id INTO selected_workspace FROM public.redirects r JOIN public.redirect_workspaces w ON w.id=r.workspace_id AND w.status='active'
  WHERE r.domain_id IS NULL AND r.type='SHORT' AND NOT r.is_domain_root AND r.slug=p_slug;
 ELSE selected_workspace:=public.redirect_public_workspace(p_hostname);END IF;
 IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') THEN
  readiness:=public.redirect_public_domain(p_hostname);
  IF readiness IS NULL THEN RETURN NULL;END IF;
  domain:=(readiness->>'id')::uuid;
 ELSIF p_root THEN RETURN NULL;
 END IF;
 -- One SELECT / MVCC snapshot: never pair a previously loaded link with a newer
 -- policy or calculate a new fingerprint for stale destination/password inputs.
 SELECT jsonb_build_object('link',to_jsonb(r),'settings',jsonb_build_object('policy',coalesce(p.policy,'{}'::jsonb),'password_hash',p.password_hash),
  'fingerprint',public.redirect_resolution_fingerprint(r,p.policy,p.password_hash)) INTO result
 FROM public.redirects r LEFT JOIN public.redirect_link_policies p ON p.workspace_id=r.workspace_id AND p.redirect_id=r.id
 WHERE r.workspace_id=selected_workspace AND r.type='SHORT' AND r.domain_id IS NOT DISTINCT FROM domain AND r.is_domain_root=p_root AND (p_root OR r.slug=p_slug);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.record_redirect_snapshot_visit(p_snapshot text, p_redirect_id uuid, p_path text, p_query text, p_referer text, p_user_agent text, p_country text, p_ip_hash text, p_status integer, p_variant_id text, p_destination text, p_metadata jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; link public.redirects; settings public.redirect_link_policies;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_snapshot IS NULL OR p_snapshot !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid resolution snapshot' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 selected_workspace:=redirect_internal.public_link_workspace(p_redirect_id,coalesce(p_metadata->>'domain','queer.guide'));IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=link.id FOR SHARE;
 IF p_snapshot<>public.redirect_resolution_fingerprint(link,settings.policy,settings.password_hash) THEN RETURN NULL;END IF;
 IF p_path IS DISTINCT FROM (CASE WHEN link.is_domain_root THEN '/' WHEN link.domain_id IS NULL THEN '/go/'||link.slug ELSE '/'||link.slug END) THEN RETURN NULL;END IF;
 -- Namespace/readiness, enabled/start/end and quota are checked again by the
 -- original writer while these locks remain held. No extra event or quota path.
 RETURN public.record_redirect_visit(p_redirect_id,p_path,p_query,p_referer,p_user_agent,p_country,p_ip_hash,p_status,p_variant_id,p_destination,p_metadata);
END $function$
;
CREATE OR REPLACE FUNCTION public.record_redirect_visit(p_redirect_id uuid, p_path text, p_query text, p_referer text, p_user_agent text, p_country text, p_ip_hash text, p_status integer, p_variant_id text, p_destination text, p_metadata jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid; visit_id uuid:=gen_random_uuid();updated uuid;bound_domain uuid;bound_host text;bound_root boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_metadata)<>'object' OR length(p_metadata::text)>4096 THEN RAISE EXCEPTION 'Invalid visitor metadata' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 selected_workspace:=redirect_internal.public_link_workspace(p_redirect_id,coalesce(p_metadata->>'domain','queer.guide'));IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT domain_id,domain_hostname,is_domain_root INTO bound_domain,bound_host,bound_root FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id;
 IF bound_root IS DISTINCT FROM (p_path='/') THEN RETURN NULL;END IF;
 IF bound_domain IS NULL AND coalesce(p_metadata->>'domain','queer.guide') NOT IN('queer.guide','www.queer.guide') THEN RETURN NULL;END IF;
 IF bound_domain IS NOT NULL AND (bound_host IS DISTINCT FROM p_metadata->>'domain' OR public.redirect_public_domain(bound_host) IS NULL) THEN RETURN NULL;END IF;
 UPDATE public.redirects SET click_count=click_count+1 WHERE workspace_id=selected_workspace AND id=p_redirect_id AND domain_id IS NOT DISTINCT FROM bound_domain AND is_domain_root=bound_root AND is_enabled
 AND (start_at IS NULL OR start_at<=now()) AND (end_at IS NULL OR end_at>now()) AND (click_limit IS NULL OR click_count<click_limit)
 RETURNING id INTO updated;
 IF updated IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.redirect_events(workspace_id,redirect_id,path,query,referer,user_agent,country,ip_hash,status,variant_id,destination_url,click_id,visitor)
 VALUES(selected_workspace,p_redirect_id,p_path,p_query,p_referer,left(p_user_agent,256),CASE WHEN p_country~'^[A-Za-z]{2}$' THEN upper(p_country) ELSE NULL END,p_ip_hash,p_status,p_variant_id,p_destination,visit_id,p_metadata);
 RETURN visit_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.record_redirect_domain_route(p_hostname text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE context jsonb;selected_workspace uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 -- Acquire exclusive ACL lock first: the registry update also takes this lock.
 PERFORM pg_advisory_xact_lock(471983093);
 context:=public.redirect_public_domain(p_hostname);
 IF context IS NULL THEN RETURN false;END IF;
 SELECT workspace_id INTO selected_workspace FROM public.redirect_domains WHERE id=(context->>'id')::uuid AND hostname=p_hostname;
 UPDATE public.redirect_domains SET routing_seen_at=clock_timestamp(),routing_provider_id=provider_id,routing_protocol=1 WHERE workspace_id=selected_workspace AND id=(context->>'id')::uuid AND hostname=p_hostname;
 RETURN true;
END $function$
;
CREATE OR REPLACE FUNCTION public.redirect_password_branding_public(p_link uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('brandName',b.brand_name,'logoAsset',CASE WHEN a.state='active' AND a.password_link_id=b.link_id AND a.target_scope='password:'||b.link_id::text THEN redirect_internal.qr_asset_for_workspace(b.workspace_id,a.id) ELSE NULL END)
 FROM public.redirect_password_branding b LEFT JOIN public.redirect_qr_assets a ON a.workspace_id=b.workspace_id AND a.id=b.logo_asset_id JOIN public.redirects r ON r.workspace_id=b.workspace_id AND r.id=b.link_id JOIN public.redirect_workspaces w ON w.id=r.workspace_id AND w.status='active' WHERE b.link_id=p_link;
$function$
;
CREATE OR REPLACE FUNCTION public.reserve_redirect_password_attempt(p_redirect_id uuid, p_client_hash text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; v_now timestamptz := clock_timestamp(); v_key text; v_limit integer;
 v_count integer; v_started timestamptz; v_retry integer := 0;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid client hash' USING ERRCODE='22023';
 END IF;
 SELECT r.workspace_id INTO selected_workspace FROM public.redirects r JOIN public.redirect_workspaces w ON w.id=r.workspace_id AND w.status='active' WHERE r.id=p_redirect_id;
 IF selected_workspace IS NULL THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
 -- Always reserve the shared link bucket first, then the client bucket.
 -- Count successes too: checking correctness must not bypass the CPU budget.
 FOREACH v_key IN ARRAY ARRAY['*',p_client_hash] LOOP
  v_limit := CASE WHEN v_key='*' THEN 1000 ELSE 10 END;
  INSERT INTO public.redirect_password_attempts AS a(workspace_id,redirect_id,client_hash,window_started_at,attempts) VALUES(selected_workspace,p_redirect_id,v_key,v_now,1)
  ON CONFLICT(redirect_id,client_hash) DO UPDATE SET
   window_started_at=CASE WHEN a.window_started_at <= v_now-interval '15 minutes' THEN v_now ELSE a.window_started_at END,
   attempts=CASE WHEN a.window_started_at <= v_now-interval '15 minutes' THEN 1 ELSE least(a.attempts+1,v_limit+1) END
  WHERE a.workspace_id=selected_workspace RETURNING attempts,window_started_at INTO v_count,v_started;
  IF v_count>v_limit THEN
   v_retry := least(900,greatest(1,ceil(extract(epoch FROM v_started+interval '15 minutes'-clock_timestamp()))::integer));
   EXIT;
  END IF;
 END LOOP;
 -- Bounded lazy retention; SKIP LOCKED avoids cleanup deadlocks with other attempts.
 DELETE FROM public.redirect_password_attempts WHERE workspace_id=selected_workspace AND (redirect_id,client_hash) IN (
  SELECT redirect_id,client_hash FROM public.redirect_password_attempts
  WHERE workspace_id=selected_workspace AND window_started_at < v_now - interval '1 day'
  ORDER BY window_started_at LIMIT 100 FOR UPDATE SKIP LOCKED
 );
 RETURN v_retry;
END $function$
;
