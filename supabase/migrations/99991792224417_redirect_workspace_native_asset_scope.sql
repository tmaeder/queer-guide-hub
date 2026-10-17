-- Scope native/private assets and bind public native paths to authoritative hosts.
-- The only public workspace remains legacy; activation fences stay intact.

CREATE FUNCTION public.redirect_public_workspace(p_hostname text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE readiness jsonb;workspace uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN RAISE EXCEPTION 'Invalid public host' USING ERRCODE='22023';END IF;
 IF p_hostname IN('queer.guide','www.queer.guide') THEN RETURN '58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid;END IF;
 readiness:=public.redirect_public_domain(p_hostname);
 IF readiness IS NULL THEN RETURN NULL;END IF;
 SELECT d.workspace_id INTO workspace FROM public.redirect_domains d WHERE d.id=(readiness->>'id')::uuid AND d.hostname=p_hostname;
 RETURN workspace;
END $$;
REVOKE ALL ON FUNCTION public.redirect_public_workspace(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_public_workspace(text) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_native_app_admin(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_expected uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); saved public.redirect_native_apps; result jsonb; domain uuid; item text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','update','delete') THEN RAISE EXCEPTION 'Invalid app operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid app page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_native_app_json(r) ORDER BY r.id),'[]') INTO result FROM(SELECT * FROM public.redirect_native_apps WHERE workspace_id=selected_workspace ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace));
 END IF;
 IF p_action IN('update','delete') THEN
  SELECT * INTO saved FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'App binding not found' USING ERRCODE='P0002';END IF;
  IF p_expected IS NULL OR saved.revision<>p_expected THEN RAISE EXCEPTION 'App binding changed; reload before saving' USING ERRCODE='23505';END IF;
 ELSIF p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid app ID' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND id=p_id;RETURN jsonb_build_object('id',p_id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','domainId','platform','appId','appClipId','fingerprints','paths','enabled','publicName','storeId','appGroupId','handoffEnabled')) THEN RAISE EXCEPTION 'Invalid app fields' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN saved.enabled:=false;saved.handoff_enabled:=false;saved.fingerprints:='{}';saved.paths:=ARRAY['/go/*'];END IF;
 IF p_values?'label' THEN IF jsonb_typeof(p_values->'label')<>'string' THEN RAISE EXCEPTION 'Invalid label' USING ERRCODE='22023';END IF;saved.label:=btrim(p_values->>'label');END IF;
 IF p_values?'domainId' THEN
  IF p_values->'domainId'<>'null' AND jsonb_typeof(p_values->'domainId')<>'string' THEN RAISE EXCEPTION 'Invalid app domain' USING ERRCODE='22023';END IF;
  saved.domain_id:=(p_values->>'domainId')::uuid;
 END IF;
 IF saved.domain_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=saved.domain_id) THEN RAISE EXCEPTION 'Choose an available registered domain' USING ERRCODE='22023';END IF;
 IF p_values?'platform' THEN saved.platform:=p_values->>'platform';END IF;
 IF p_values?'appId' THEN saved.app_id:=p_values->>'appId';END IF;
 IF p_values?'appClipId' THEN
  IF p_values->'appClipId'<>'null' AND jsonb_typeof(p_values->'appClipId')<>'string' THEN RAISE EXCEPTION 'Invalid App Clip identity' USING ERRCODE='22023';END IF;
  saved.app_clip_id:=nullif(btrim(p_values->>'appClipId'),'');
 END IF;
 IF p_values?'enabled' THEN IF jsonb_typeof(p_values->'enabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid publication state' USING ERRCODE='22023';END IF;saved.enabled:=(p_values->>'enabled')::boolean;END IF;
 FOREACH item IN ARRAY ARRAY['publicName','storeId','appGroupId'] LOOP
  IF p_values?item THEN
   IF p_values->item<>'null' AND jsonb_typeof(p_values->item)<>'string' THEN RAISE EXCEPTION 'Invalid install settings' USING ERRCODE='22023';END IF;
   IF item='publicName' THEN saved.public_name:=nullif(btrim(p_values->>item),'');
   ELSIF item='storeId' THEN saved.store_id:=nullif(btrim(p_values->>item),'');
   ELSE saved.app_group_id:=nullif(btrim(p_values->>item),'');END IF;
  END IF;
 END LOOP;
 IF p_values?'handoffEnabled' THEN
  IF jsonb_typeof(p_values->'handoffEnabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid handoff state' USING ERRCODE='22023';END IF;
  saved.handoff_enabled:=(p_values->>'handoffEnabled')::boolean;
 END IF;
 IF NOT saved.enabled THEN
  IF p_values->'handoffEnabled'='true' THEN RAISE EXCEPTION 'Publish the association before enabling handoffs' USING ERRCODE='22023';END IF;
  saved.handoff_enabled:=false;
 END IF;
 IF p_values?'fingerprints' THEN
  IF jsonb_typeof(p_values->'fingerprints')<>'array' OR jsonb_array_length(p_values->'fingerprints')>10 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'fingerprints') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid signing fingerprints' USING ERRCODE='22023';END IF;
  SELECT coalesce(array_agg(DISTINCT upper(value) ORDER BY upper(value)),'{}') INTO saved.fingerprints FROM jsonb_array_elements_text(p_values->'fingerprints');
 END IF;
 IF p_values?'paths' THEN
  IF jsonb_typeof(p_values->'paths')<>'array' OR jsonb_array_length(p_values->'paths') NOT BETWEEN 1 AND 20 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'paths') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid app paths' USING ERRCODE='22023';END IF;
  SELECT array_agg(value ORDER BY ordinal) INTO saved.paths FROM(SELECT value,min(ordinality) AS ordinal FROM jsonb_array_elements_text(p_values->'paths') WITH ORDINALITY GROUP BY value) entries;
 END IF;
 IF saved.label IS NULL OR length(saved.label) NOT BETWEEN 1 AND 100 OR saved.platform IS NULL OR saved.platform NOT IN('ios','android') OR saved.app_id IS NULL OR length(saved.app_id)>255 OR saved.paths IS NULL OR cardinality(saved.paths) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Provide valid app settings' USING ERRCODE='22023';END IF;
 IF saved.platform='ios' THEN
  IF saved.app_id !~ '^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' OR cardinality(saved.fingerprints)<>0 THEN RAISE EXCEPTION 'iOS needs an application identifier and no Android fingerprints' USING ERRCODE='22023';END IF;
  IF saved.app_clip_id IS NOT NULL AND (length(saved.app_clip_id)>255 OR saved.app_clip_id !~ '^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' OR left(saved.app_clip_id,length(saved.app_id)+1)<>saved.app_id||'.') THEN RAISE EXCEPTION 'App Clip must extend the signed parent application identifier' USING ERRCODE='22023';END IF;
 ELSE
  IF saved.app_clip_id IS NOT NULL THEN RAISE EXCEPTION 'Android bindings cannot publish an App Clip' USING ERRCODE='22023';END IF;
  IF saved.app_id !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$' OR cardinality(saved.fingerprints) NOT BETWEEN 1 AND 10 OR EXISTS(SELECT FROM unnest(saved.fingerprints) f WHERE f !~ '^([A-F0-9]{2}:){31}[A-F0-9]{2}$') THEN RAISE EXCEPTION 'Android needs a package and SHA-256 release signing fingerprints' USING ERRCODE='22023';END IF;
 END IF;
 FOREACH item IN ARRAY saved.paths LOOP
  IF length(item)>256 OR item !~ '^/([A-Za-z0-9-]+/)*[A-Za-z0-9-]*(\*)?$' OR saved.domain_id IS NULL AND item NOT LIKE '/go/%' THEN RAISE EXCEPTION 'Use short-link paths on the selected host' USING ERRCODE='22023';END IF;
 END LOOP;
 IF saved.public_name IS NOT NULL AND (length(saved.public_name) NOT BETWEEN 1 AND 100 OR saved.public_name ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'Public app name must be 1-100 characters on one line' USING ERRCODE='22023';END IF;
 IF saved.store_id IS NOT NULL AND (saved.platform='ios' AND saved.store_id !~ '^[1-9][0-9]{0,19}$' OR saved.platform='android' AND saved.store_id<>saved.app_id) THEN RAISE EXCEPTION 'Use a numeric App Store ID or this Android package name' USING ERRCODE='22023';END IF;
 IF saved.app_group_id IS NOT NULL AND (saved.platform<>'ios' OR length(saved.app_group_id)>255 OR saved.app_group_id !~ '^group\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$') THEN RAISE EXCEPTION 'Use the shared iOS App Group identifier' USING ERRCODE='22023';END IF;
 IF saved.handoff_enabled AND (saved.public_name IS NULL OR saved.store_id IS NULL OR saved.platform='ios' AND (saved.app_clip_id IS NULL OR saved.app_group_id IS NULL)) THEN RAISE EXCEPTION 'Provide the public name, store identity and iOS Clip/group setup before enabling handoffs' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND domain_id IS NOT DISTINCT FROM saved.domain_id AND id IS DISTINCT FROM p_id)>=10 THEN RAISE EXCEPTION 'At most ten app bindings per host' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_native_apps(workspace_id,domain_id,label,platform,app_id,app_clip_id,public_name,store_id,app_group_id,handoff_enabled,fingerprints,paths,enabled,created_by) VALUES(selected_workspace,saved.domain_id,saved.label,saved.platform,saved.app_id,saved.app_clip_id,saved.public_name,saved.store_id,saved.app_group_id,saved.handoff_enabled,saved.fingerprints,saved.paths,saved.enabled,p_actor) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_native_apps SET domain_id=saved.domain_id,label=saved.label,platform=saved.platform,app_id=saved.app_id,app_clip_id=saved.app_clip_id,public_name=saved.public_name,store_id=saved.store_id,app_group_id=saved.app_group_id,handoff_enabled=saved.handoff_enabled,fingerprints=saved.fingerprints,paths=saved.paths,enabled=saved.enabled,created_by=p_actor WHERE workspace_id=selected_workspace AND id=p_id RETURNING * INTO saved;
 END IF;
 -- Leave headroom for platform envelopes and per-path JSON component wrappers.
 IF (SELECT coalesce(sum(octet_length(jsonb_strip_nulls(jsonb_build_object('platform',platform,'appId',app_id,'appClipId',app_clip_id,'fingerprints',fingerprints,'paths',paths))::text)),0) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND domain_id IS NOT DISTINCT FROM saved.domain_id AND enabled)>50000 THEN RAISE EXCEPTION 'Published app settings are too large; use fewer path patterns' USING ERRCODE='22023';END IF;
 RETURN public.redirect_native_app_json(saved);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_app_json(p_row redirect_native_apps)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',p_row.id,'domainId',p_row.domain_id,'hostname',coalesce((SELECT hostname FROM public.redirect_domains WHERE workspace_id=p_row.workspace_id AND id=p_row.domain_id),'queer.guide'),'label',p_row.label,'platform',p_row.platform,'appId',p_row.app_id,'appClipId',p_row.app_clip_id,'publicName',p_row.public_name,'storeId',p_row.store_id,'appGroupId',p_row.app_group_id,'handoffEnabled',p_row.handoff_enabled,'fingerprints',p_row.fingerprints,'paths',p_row.paths,'enabled',p_row.enabled,'version',p_row.revision,'updatedAt',p_row.updated_at) WHERE p_row.workspace_id=public.redirect_request_workspace();
$function$;

CREATE OR REPLACE FUNCTION public.redirect_native_apps_public(p_hostname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; domain uuid; readiness jsonb; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN RAISE EXCEPTION 'Invalid association host' USING ERRCODE='22023';END IF;
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') THEN
  readiness:=public.redirect_public_domain(p_hostname);
  IF readiness IS NULL THEN RETURN NULL;END IF;
  domain:=(readiness->>'id')::uuid;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('platform',platform,'appId',app_id,'appClipId',app_clip_id,'fingerprints',fingerprints,'paths',paths)) ORDER BY id),'[]') INTO result FROM public.redirect_native_apps app WHERE app.workspace_id=selected_workspace AND app.domain_id IS NOT DISTINCT FROM domain AND enabled AND EXISTS(SELECT FROM public.user_roles WHERE user_id=app.created_by AND role='admin');
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_install_choices(p_hostname text, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR p_path IS NULL OR length(p_path)>256 OR p_path !~ '^/[A-Za-z0-9/-]*$' THEN RAISE EXCEPTION 'Invalid install source' USING ERRCODE='22023';END IF;
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') AND public.redirect_public_domain(p_hostname) IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'platform',a.platform,'displayName',a.public_name,'storeId',a.store_id,
  'storeUrl',CASE WHEN a.platform='ios' THEN 'https://apps.apple.com/app/id'||a.store_id ELSE 'https://play.google.com/store/apps/details?id='||a.store_id END,
  'appClipBundleId',CASE WHEN a.platform='ios' THEN substring(a.app_clip_id FROM 12) END)) ORDER BY a.id),'[]') INTO result
 FROM public.redirect_native_apps a WHERE a.workspace_id=selected_workspace AND (public.redirect_native_handoff_app(a.id,p_hostname,p_path)).id IS NOT NULL;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_handoff_app(p_app uuid, p_hostname text, p_path text)
 RETURNS redirect_native_apps
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; app public.redirect_native_apps;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO app FROM public.redirect_native_apps a WHERE a.workspace_id=selected_workspace AND a.id=p_app AND a.enabled AND a.handoff_enabled
 AND EXISTS(SELECT FROM public.user_roles WHERE user_id=a.created_by AND role='admin')
 AND (a.domain_id IS NULL AND p_hostname IN('queer.guide','www.queer.guide') OR a.domain_id IS NOT NULL AND EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=a.domain_id AND hostname=p_hostname))
 AND EXISTS(SELECT FROM unnest(a.paths) pattern WHERE pattern=p_path OR right(pattern,1)='*' AND left(p_path,length(pattern)-1)=left(pattern,length(pattern)-1));
 IF app.id IS NOT NULL AND app.domain_id IS NOT NULL AND public.redirect_public_domain(p_hostname) IS NULL THEN RETURN NULL;END IF;
 RETURN app;
END $function$;

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
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_resolution_fingerprint(p_link redirects, p_policy jsonb, p_password_hash jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT encode(sha256(convert_to((jsonb_build_object(
  'id',p_link.id,'type',p_link.type,'slug',p_link.slug,'domainId',p_link.domain_id,
  'hostname',p_link.domain_hostname,'root',p_link.is_domain_root,'target',p_link.target,
  'status',p_link.status_code,'enabled',p_link.is_enabled,'start',extract(epoch FROM p_link.start_at),
  'end',extract(epoch FROM p_link.end_at),'queryMode',p_link.query_mode,'queryOverride',p_link.query_override,
  'utmDefaults',p_link.utm_defaults,'clickLimit',p_link.click_limit,
  'policy',coalesce(p_policy,'{}'::jsonb),'password',p_password_hash
 )||CASE WHEN p_link.workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid THEN '{}'::jsonb ELSE jsonb_build_object('workspaceId',p_link.workspace_id) END)::text,'UTF8')),'hex');
$function$;

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
 selected_workspace:=public.redirect_public_workspace(coalesce(p_metadata->>'domain','queer.guide'));IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=link.id FOR SHARE;
 IF p_snapshot<>public.redirect_resolution_fingerprint(link,settings.policy,settings.password_hash) THEN RETURN NULL;END IF;
 IF p_path IS DISTINCT FROM (CASE WHEN link.is_domain_root THEN '/' WHEN link.domain_id IS NULL THEN '/go/'||link.slug ELSE '/'||link.slug END) THEN RETURN NULL;END IF;
 -- Namespace/readiness, enabled/start/end and quota are checked again by the
 -- original writer while these locks remain held. No extra event or quota path.
 RETURN public.record_redirect_visit(p_redirect_id,p_path,p_query,p_referer,p_user_agent,p_country,p_ip_hash,p_status,p_variant_id,p_destination,p_metadata);
END $function$;

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
 selected_workspace:=public.redirect_public_workspace(coalesce(p_metadata->>'domain','queer.guide'));IF selected_workspace IS NULL THEN RETURN NULL;END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.create_redirect_native_handoff(p_token_hash text, p_app uuid, p_consent boolean, p_snapshot text, p_redirect_id uuid, p_path text, p_query text, p_referer text, p_user_agent text, p_country text, p_ip_hash text, p_status integer, p_variant_id text, p_destination text, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; app public.redirect_native_apps; link public.redirects; settings public.redirect_link_policies; click uuid; expires timestamptz; started timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid handoff digest' USING ERRCODE='22023';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 selected_workspace:=public.redirect_public_workspace(coalesce(p_metadata->>'domain','queer.guide'));IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=link.id FOR SHARE;
 IF settings.policy->'track_conversions' IS DISTINCT FROM 'true'::jsonb OR settings.policy->'cloaked'='true'::jsonb THEN RETURN NULL;END IF;
 app:=public.redirect_native_handoff_app(p_app,p_metadata->>'domain',p_path);
 IF app.id IS NULL OR app.workspace_id<>selected_workspace OR app.domain_id IS DISTINCT FROM link.domain_id THEN RETURN NULL;END IF;
 expires:=least(started+interval '24 hours',coalesce(link.end_at,'infinity'::timestamptz),coalesce((settings.policy->>'expires_at')::timestamptz,'infinity'::timestamptz));
 IF settings.policy?'experiment' AND NOT settings.policy->'experiment'?'completed_target' THEN expires:=least(expires,(settings.policy->'experiment'->>'ends_at')::timestamptz);END IF;
 IF expires<=started THEN RETURN NULL;END IF;
 click:=public.record_redirect_snapshot_visit(p_snapshot,p_redirect_id,p_path,p_query,p_referer,p_user_agent,p_country,p_ip_hash,p_status,p_variant_id,p_destination,p_metadata);
 IF click IS NULL THEN RETURN NULL;END IF;
 -- This insert is in the visit transaction. A digest collision/error rolls the
 -- reserved counter/event back; an existing public click ID cannot mint a token.
 INSERT INTO public.redirect_native_handoff_receipts(workspace_id,token_hash,redirect_id,click_id,app_binding,app_revision,routing_fingerprint,hostname,path,created_at,expires_at)
 VALUES(selected_workspace,p_token_hash,link.id,click,app.id,app.revision,p_snapshot,p_metadata->>'domain',p_path,started,expires);
 RETURN jsonb_build_object('clickId',click,'expiresAt',expires);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_handoff_context(p_token_hash text, p_app uuid, p_hostname text, p_path text, p_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; app public.redirect_native_apps; context jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 app:=public.redirect_native_handoff_app(p_app,p_hostname,p_path);
 IF app.id IS NULL THEN RETURN NULL;END IF;
 -- A single SELECT returns the live password/policy and its own fingerprint.
 -- The public resolver must verify the password and re-run its shared selector
 -- with this event query/variant before calling the final locked consumer.
 SELECT jsonb_build_object('link',to_jsonb(r),'settings',jsonb_build_object('policy',p.policy,'password_hash',p.password_hash),
  'fingerprint',h.routing_fingerprint,'query',e.query,'variantId',e.variant_id,'destination',e.destination_url,'clickId',h.click_id,'expiresAt',h.expires_at)
 INTO context FROM public.redirect_native_handoff_receipts h
 JOIN public.redirects r ON r.workspace_id=h.workspace_id AND r.id=h.redirect_id
 JOIN public.redirect_link_policies p ON p.workspace_id=r.workspace_id AND p.redirect_id=r.id
 JOIN public.redirect_events e ON e.workspace_id=h.workspace_id AND e.click_id=h.click_id AND e.redirect_id=r.id
 WHERE h.workspace_id=selected_workspace AND h.token_hash=p_token_hash AND h.app_binding=app.id AND h.app_revision=app.revision AND h.hostname=p_hostname AND h.path=p_path
 AND h.consumed_at IS NULL AND h.expires_at>clock_timestamp() AND r.is_enabled AND (r.start_at IS NULL OR r.start_at<=clock_timestamp()) AND (r.end_at IS NULL OR r.end_at>clock_timestamp())
 AND h.routing_fingerprint=public.redirect_resolution_fingerprint(r,p.policy,p.password_hash);
 RETURN context;
END $function$;

CREATE OR REPLACE FUNCTION public.consume_redirect_native_handoff(p_token_hash text, p_app uuid, p_hostname text, p_path text, p_consent boolean, p_snapshot text, p_destination text, p_variant_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; link_id uuid; link public.redirects; settings public.redirect_link_policies; receipt public.redirect_native_handoff_receipts; app public.redirect_native_apps; event public.redirect_events;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT redirect_id INTO link_id FROM public.redirect_native_handoff_receipts WHERE workspace_id=selected_workspace AND token_hash=p_token_hash;
 IF link_id IS NULL THEN RETURN NULL;END IF;
 -- Same writer lock order; the receipt lock is last. Replays serialize here.
 SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=link_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL OR NOT link.is_enabled OR link.start_at>clock_timestamp() OR link.end_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE workspace_id=selected_workspace AND redirect_id=link.id FOR SHARE;
 IF p_snapshot IS NULL OR p_snapshot IS DISTINCT FROM public.redirect_resolution_fingerprint(link,settings.policy,settings.password_hash) THEN RETURN NULL;END IF;
 app:=public.redirect_native_handoff_app(p_app,p_hostname,p_path);
 IF app.id IS NULL OR app.workspace_id<>selected_workspace OR app.domain_id IS DISTINCT FROM link.domain_id THEN RETURN NULL;END IF;
 SELECT * INTO receipt FROM public.redirect_native_handoff_receipts WHERE workspace_id=selected_workspace AND token_hash=p_token_hash FOR UPDATE;
 IF receipt.token_hash IS NULL OR receipt.consumed_at IS NOT NULL OR receipt.expires_at<=clock_timestamp()
 OR receipt.redirect_id<>link.id OR receipt.app_binding<>app.id OR receipt.app_revision<>app.revision OR receipt.hostname IS DISTINCT FROM p_hostname OR receipt.path IS DISTINCT FROM p_path OR receipt.routing_fingerprint<>p_snapshot THEN RETURN NULL;END IF;
 SELECT * INTO event FROM public.redirect_events WHERE workspace_id=selected_workspace AND click_id=receipt.click_id AND redirect_id=link.id;
 IF event.click_id IS NULL OR event.destination_url IS DISTINCT FROM p_destination OR event.variant_id IS DISTINCT FROM p_variant_id THEN RETURN NULL;END IF;
 UPDATE public.redirect_native_handoff_receipts SET consumed_at=clock_timestamp() WHERE workspace_id=selected_workspace AND token_hash=p_token_hash;
 -- The original visit already reserved its quota; do not increment or insert.
 RETURN receipt.click_id;
END $function$;

CREATE OR REPLACE FUNCTION public.cleanup_redirect_native_handoffs(p_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); removed integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid cleanup bound' USING ERRCODE='22023';END IF;
 DELETE FROM public.redirect_native_handoff_receipts WHERE workspace_id=selected_workspace AND token_hash IN(SELECT token_hash FROM public.redirect_native_handoff_receipts WHERE workspace_id=selected_workspace AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
END $function$;

-- DROP FIRST, AND RE-REVOKE AFTER. Both halves are required and neither is cosmetic.
--
-- `CREATE OR REPLACE FUNCTION` cannot change a return type: prod still carries the baseline's
-- `RETURNS TABLE(id, slug, target, status_code, preserve_query, query_mode, query_override,
-- utm_defaults, click_limit, click_count)` while this file declares `RETURNS SETOF redirects`,
-- so the bare replace fails `42P13 cannot change return type of existing function` and takes
-- every later migration in the push with it. Measured on prod 2026-10-17: it aborted db push
-- here, 4 migrations from the end.
--
-- Dropping is safe for this function specifically, checked rather than assumed: pg_depend shows
-- 0 dependents, the live grants are postgres + service_role only, and it is the RETIRED resolver
-- -- supabase/tests/redirect_link_policies.sql raises 'Old resolver bypass remains' and
-- redirect_current_owner_keys.sql raises 'Raw public resolver exposed' precisely to keep it
-- unreachable. The replacement body is also the shape the test fixture already builds
-- (redirect-platform-bootstrap.sql: RETURNS SETOF public.redirects).
--
-- THE REVOKE IS THE HALF THAT WOULD BITE. A newly created function in `public` is granted EXECUTE
-- to PUBLIC by default, so DROP + CREATE alone would hand the retired resolver to anon and
-- authenticated -- turning a mechanical fix into a privilege regression, and failing both tests
-- above. `grant ... to service_role` does NOT undo that; only an explicit REVOKE does.
DROP FUNCTION IF EXISTS public.resolve_short_redirect(text);

CREATE OR REPLACE FUNCTION public.resolve_short_redirect(p_slug text)
 RETURNS SETOF redirects
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT * FROM public.redirects WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND type='SHORT' AND domain_id IS NULL AND NOT is_domain_root AND slug=p_slug $function$;
REVOKE ALL ON FUNCTION public.resolve_short_redirect(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_short_redirect(text) TO service_role;

CREATE OR REPLACE FUNCTION redirect_internal.qr_asset_for_workspace(p_workspace uuid,p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',id,'key',id::text||CASE WHEN mime='image/png' THEN '.png' ELSE '.jpg' END,'mime',mime,'bytes',bytes,'width',width,'height',height,'sha256',sha256)
 FROM public.redirect_qr_assets WHERE workspace_id=p_workspace AND id=p_id AND state='active';
$function$;
REVOKE ALL ON FUNCTION redirect_internal.qr_asset_for_workspace(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.qr_asset_for_workspace(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_qr_asset_json(p_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT redirect_internal.qr_asset_for_workspace(public.redirect_request_workspace(),p_id) $$;
CREATE OR REPLACE FUNCTION public.redirect_password_branding_json(p_link uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('linkId',r.id,'version',b.version,'updatedAt',b.updated_at,'brandName',b.brand_name,'logoAsset',CASE WHEN a.state='active' AND a.password_link_id=b.link_id AND a.target_scope='password:'||b.link_id::text THEN redirect_internal.qr_asset_for_workspace(r.workspace_id,a.id) ELSE NULL END)
 FROM public.redirects r LEFT JOIN public.redirect_password_branding b ON b.workspace_id=r.workspace_id AND b.link_id=r.id LEFT JOIN public.redirect_qr_assets a ON a.workspace_id=r.workspace_id AND a.id=b.logo_asset_id WHERE r.id=p_link AND r.workspace_id=public.redirect_request_workspace();
$$;

CREATE OR REPLACE FUNCTION public.redirect_password_branding_public(p_link uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('brandName',b.brand_name,'logoAsset',CASE WHEN a.state='active' AND a.password_link_id=b.link_id AND a.target_scope='password:'||b.link_id::text THEN redirect_internal.qr_asset_for_workspace(b.workspace_id,a.id) ELSE NULL END)
 FROM public.redirect_password_branding b LEFT JOIN public.redirect_qr_assets a ON a.workspace_id=b.workspace_id AND a.id=b.logo_asset_id JOIN public.redirects r ON r.workspace_id=b.workspace_id AND r.id=b.link_id WHERE r.workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND b.link_id=p_link;
$function$;

CREATE OR REPLACE FUNCTION public.redirect_password_branding_resource(p_action text, p_actor uuid, p_principal uuid, p_link uuid, p_values jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); identity jsonb;current_version uuid;b public.redirect_password_branding;brand text;asset uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('get','patch') THEN RAISE EXCEPTION 'Invalid branding action' USING ERRCODE='22023';END IF;
 identity:=public.redirect_password_branding_actor(p_actor,p_principal,p_link,p_action='patch');
 IF p_action='get' THEN RETURN public.redirect_password_branding_json(p_link)||jsonb_build_object('canEdit',public.redirect_can_write_link(p_principal,p_link));END IF;
 SELECT * INTO b FROM public.redirect_password_branding WHERE workspace_id=selected_workspace AND link_id=p_link FOR UPDATE;current_version:=b.version;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR NOT(p_values?'version') OR p_values-ARRAY['version','brandName','clearLogo']::text[]<>'{}' OR p_values-ARRAY['version']::text[]='{}' THEN RAISE EXCEPTION 'Provide the current version and branding changes' USING ERRCODE='22023';END IF;
 IF current_version IS DISTINCT FROM(p_values->>'version')::uuid THEN RAISE EXCEPTION 'Password branding changed; reload before saving' USING ERRCODE='23505';END IF;
 IF(p_values?'brandName' AND jsonb_typeof(p_values->'brandName') NOT IN('string','null')) OR(p_values?'clearLogo' AND jsonb_typeof(p_values->'clearLogo')<>'boolean') THEN RAISE EXCEPTION 'Invalid branding fields' USING ERRCODE='22023';END IF;
 brand:=CASE WHEN p_values?'brandName' THEN nullif(btrim(p_values->>'brandName'),'') ELSE b.brand_name END;
 asset:=CASE WHEN coalesce((p_values->>'clearLogo')::boolean,false) THEN NULL ELSE b.logo_asset_id END;
 INSERT INTO public.redirect_password_branding(workspace_id,link_id,brand_name,logo_asset_id) VALUES(selected_workspace,p_link,brand,asset)
 ON CONFLICT(link_id) DO UPDATE SET brand_name=excluded.brand_name,logo_asset_id=excluded.logo_asset_id,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE redirect_password_branding.workspace_id=selected_workspace;
 IF NOT FOUND THEN RAISE EXCEPTION 'Branding unavailable in this workspace' USING ERRCODE='23505';END IF;
 RETURN public.redirect_password_branding_json(p_link)||jsonb_build_object('canEdit',true);
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_password_logo(p_actor uuid, p_principal uuid, p_link uuid, p_version uuid, p_mime text, p_bytes integer, p_width integer, p_height integer, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); identity jsonb;current_version uuid;asset public.redirect_qr_assets;scope text:='password:'||p_link::text;
BEGIN
 identity:=public.redirect_password_branding_actor(p_actor,p_principal,p_link,true);
 SELECT version INTO current_version FROM public.redirect_password_branding WHERE workspace_id=selected_workspace AND link_id=p_link FOR UPDATE;
 IF current_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Password branding changed; reload before uploading' USING ERRCODE='23505';END IF;
 IF p_mime IS NULL OR p_mime NOT IN('image/png','image/jpeg') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 1500000 OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1024 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid logo metadata' USING ERRCODE='22023';END IF;
 IF(SELECT count(*) FROM public.redirect_qr_assets WHERE requested_by=(identity->>'actor')::uuid AND created_at>clock_timestamp()-interval '1 hour')>=60 OR(SELECT count(*) FROM public.redirect_qr_assets WHERE created_at>clock_timestamp()-interval '1 hour')>=600 OR(SELECT count(*) FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND target_scope=scope AND state='pending' AND expires_at>clock_timestamp())>=3 THEN RETURN jsonb_build_object('retryAfter',900);END IF;
 INSERT INTO public.redirect_qr_assets(workspace_id,target_scope,password_link_id,requested_by,requested_principal,expected_version,mime,bytes,width,height,sha256)
 VALUES(selected_workspace,scope,p_link,(identity->>'actor')::uuid,identity->>'principalKey',p_version,p_mime,p_bytes,p_width,p_height,p_sha256) RETURNING * INTO asset;
 RETURN jsonb_build_object('id',asset.id,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END);
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_password_logo(p_actor uuid, p_principal uuid, p_link uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); identity jsonb;current_version uuid;asset public.redirect_qr_assets;
BEGIN
 identity:=public.redirect_password_branding_actor(p_actor,p_principal,p_link,true);
 SELECT version INTO current_version FROM public.redirect_password_branding WHERE workspace_id=selected_workspace AND link_id=p_link FOR UPDATE;
 SELECT * INTO asset FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF asset.id IS NULL OR asset.state<>'pending' OR asset.password_link_id IS DISTINCT FROM p_link OR asset.target_scope<>'password:'||p_link::text OR asset.requested_principal IS DISTINCT FROM identity->>'principalKey' OR asset.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Logo reservation expired or does not match this link' USING ERRCODE='22023';END IF;
 IF current_version IS DISTINCT FROM asset.expected_version THEN RAISE EXCEPTION 'Password branding changed during upload; reload settings' USING ERRCODE='23505';END IF;
 UPDATE public.redirect_qr_assets SET state='active',next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=selected_workspace AND id=asset.id;
 INSERT INTO public.redirect_password_branding(workspace_id,link_id,logo_asset_id) VALUES(selected_workspace,p_link,asset.id)
 ON CONFLICT(link_id) DO UPDATE SET logo_asset_id=excluded.logo_asset_id,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE redirect_password_branding.workspace_id=selected_workspace;
 IF NOT FOUND THEN RAISE EXCEPTION 'Branding unavailable in this workspace' USING ERRCODE='23505';END IF;
 RETURN public.redirect_password_branding_json(p_link)||jsonb_build_object('canEdit',true);
END $function$;

CREATE OR REPLACE FUNCTION public.defer_redirect_qr_asset_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF OLD.logo_asset_id IS NOT NULL AND (TG_OP='DELETE' OR NEW.logo_asset_id IS DISTINCT FROM OLD.logo_asset_id) THEN
  UPDATE public.redirect_qr_assets SET next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=OLD.workspace_id AND id=OLD.logo_asset_id AND state='active';
 END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.release_redirect_password_logo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF OLD.logo_asset_id IS NOT NULL AND(TG_OP='DELETE' OR NEW.logo_asset_id IS DISTINCT FROM OLD.logo_asset_id) THEN
  UPDATE public.redirect_qr_assets SET next_cleanup_at=clock_timestamp()+interval '1 hour' WHERE workspace_id=OLD.workspace_id AND id=OLD.logo_asset_id AND state='active';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_qr_asset_cleanup(p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); asset public.redirect_qr_assets;result jsonb:='[]';
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid cleanup batch' USING ERRCODE='22023';END IF;
 FOR asset IN SELECT * FROM public.redirect_qr_assets a WHERE a.workspace_id=selected_workspace AND next_cleanup_at<=clock_timestamp() AND NOT EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND logo_asset_id=a.id)
 AND NOT EXISTS(SELECT FROM public.redirect_qr_image_links WHERE workspace_id=selected_workspace AND logo_asset_id=a.id)
 AND NOT EXISTS(SELECT FROM public.redirect_password_branding WHERE workspace_id=selected_workspace AND logo_asset_id=a.id)
 AND (state IN('active','deleted') OR state='pending' AND expires_at<=clock_timestamp() OR state='deleting' AND lease_until<=clock_timestamp()) ORDER BY next_cleanup_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.redirect_qr_assets SET state='deleting',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=least(attempts+1,1000000) WHERE workspace_id=selected_workspace AND id=asset.id RETURNING * INTO asset;
  result:=result||jsonb_build_array(jsonb_build_object('id',asset.id,'lease',asset.lease,'key',asset.id::text||CASE WHEN asset.mime='image/png' THEN '.png' ELSE '.jpg' END));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_qr_asset_cleanup(p_id uuid, p_lease uuid, p_success boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); asset public.redirect_qr_assets;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO asset FROM public.redirect_qr_assets WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF asset.id IS NULL OR asset.state<>'deleting' OR p_lease IS DISTINCT FROM asset.lease OR asset.lease_until<=clock_timestamp() OR EXISTS(SELECT FROM public.redirect_qr_styles WHERE workspace_id=selected_workspace AND logo_asset_id=p_id) OR EXISTS(SELECT FROM public.redirect_qr_image_links WHERE workspace_id=selected_workspace AND logo_asset_id=p_id) OR EXISTS(SELECT FROM public.redirect_password_branding WHERE workspace_id=selected_workspace AND logo_asset_id=p_id) THEN RETURN false;END IF;
 UPDATE public.redirect_qr_assets SET state=CASE WHEN p_success IS TRUE THEN 'deleted' ELSE 'deleting' END,
  last_deleted_at=CASE WHEN p_success IS TRUE THEN clock_timestamp() ELSE last_deleted_at END,
  next_cleanup_at=clock_timestamp()+CASE WHEN p_success IS TRUE THEN CASE WHEN asset.last_deleted_at IS NULL THEN interval '1 day' ELSE interval '30 days' END ELSE make_interval(secs=>least(3600,30*power(2,least(asset.attempts,6))::integer)) END,
  lease=NULL,lease_until=CASE WHEN p_success IS TRUE THEN NULL ELSE clock_timestamp() END,
  attempts=CASE WHEN p_success IS TRUE THEN 0 ELSE attempts END,last_error=CASE WHEN p_success IS TRUE THEN NULL ELSE 'Storage cleanup failed; retry scheduled' END WHERE workspace_id=selected_workspace AND id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.prune_redirect_qr_image_history(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); budget_before timestamptz:=clock_timestamp()-interval '2 days';draft_before timestamptz:=clock_timestamp()-interval '1 day';image_before timestamptz:=clock_timestamp()-interval '90 days';events integer;images integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid retention batch' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 DELETE FROM public.redirect_qr_image_creation_log q USING(SELECT id FROM public.redirect_qr_image_creation_log WHERE workspace_id=selected_workspace AND created_at<budget_before ORDER BY created_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED) old WHERE q.workspace_id=selected_workspace AND q.id=old.id;
 GET DIAGNOSTICS events=ROW_COUNT;
 DELETE FROM public.redirect_qr_image_links q USING(SELECT id FROM public.redirect_qr_image_links WHERE workspace_id=selected_workspace AND (least(revoked_at,expires_at)<image_before OR publication_state='pending' AND draft_expires_at<draft_before) ORDER BY least(revoked_at,expires_at),id LIMIT p_limit FOR UPDATE SKIP LOCKED) old WHERE q.workspace_id=selected_workspace AND q.id=old.id;
 GET DIAGNOSTICS images=ROW_COUNT;
 RETURN jsonb_build_object('events',events,'images',images);
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_password_attempt(p_redirect_id uuid, p_client_hash text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid; v_now timestamptz := clock_timestamp(); v_key text; v_limit integer;
 v_count integer; v_started timestamptz; v_retry integer := 0;
BEGIN
 IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid client hash' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT FROM public.redirects WHERE id=p_redirect_id AND workspace_id=selected_workspace) THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
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
END $function$;
