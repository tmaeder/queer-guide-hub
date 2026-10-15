-- Public install identity is separate from the private workspace label. Nothing
-- is opted in by adding these nullable fields; existing handoffs remain disabled.
ALTER TABLE public.redirect_native_apps
 ADD COLUMN public_name text CHECK(public_name IS NULL OR (length(btrim(public_name)) BETWEEN 1 AND 100 AND public_name !~ '[[:cntrl:]]')),
 ADD COLUMN store_id text CHECK(store_id IS NULL OR (platform='ios' AND store_id ~ '^[1-9][0-9]{0,19}$') OR (platform='android' AND store_id=app_id)),
 ADD COLUMN app_group_id text CHECK(app_group_id IS NULL OR (platform='ios' AND length(app_group_id)<=255 AND app_group_id ~ '^group\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$')),
 ADD CONSTRAINT redirect_native_handoff_setup CHECK(NOT handoff_enabled OR (enabled AND public_name IS NOT NULL AND store_id IS NOT NULL AND (platform='android' OR app_clip_id IS NOT NULL AND app_group_id IS NOT NULL)));

CREATE OR REPLACE FUNCTION public.redirect_native_app_json(p_row public.redirect_native_apps) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p_row.id,'domainId',p_row.domain_id,'hostname',coalesce((SELECT hostname FROM public.redirect_domains WHERE id=p_row.domain_id),'queer.guide'),'label',p_row.label,'platform',p_row.platform,'appId',p_row.app_id,'appClipId',p_row.app_clip_id,'publicName',p_row.public_name,'storeId',p_row.store_id,'appGroupId',p_row.app_group_id,'handoffEnabled',p_row.handoff_enabled,'fingerprints',p_row.fingerprints,'paths',p_row.paths,'enabled',p_row.enabled,'version',p_row.revision,'updatedAt',p_row.updated_at);
$$;
REVOKE ALL ON FUNCTION public.redirect_native_app_json(public.redirect_native_apps) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_app_json(public.redirect_native_apps) TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_native_app_admin(p_actor uuid,p_action text,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_expected uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE saved public.redirect_native_apps; result jsonb; domain uuid; item text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','update','delete') THEN RAISE EXCEPTION 'Invalid app operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid app page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_native_app_json(r) ORDER BY r.id),'[]') INTO result FROM(SELECT * FROM public.redirect_native_apps ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_native_apps));
 END IF;
 IF p_action IN('update','delete') THEN
  SELECT * INTO saved FROM public.redirect_native_apps WHERE id=p_id FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'App binding not found' USING ERRCODE='P0002';END IF;
  IF p_expected IS NULL OR saved.revision<>p_expected THEN RAISE EXCEPTION 'App binding changed; reload before saving' USING ERRCODE='23505';END IF;
 ELSIF p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid app ID' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_native_apps WHERE id=p_id;RETURN jsonb_build_object('id',p_id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','domainId','platform','appId','appClipId','fingerprints','paths','enabled','publicName','storeId','appGroupId','handoffEnabled')) THEN RAISE EXCEPTION 'Invalid app fields' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN saved.enabled:=false;saved.handoff_enabled:=false;saved.fingerprints:='{}';saved.paths:=ARRAY['/go/*'];END IF;
 IF p_values?'label' THEN IF jsonb_typeof(p_values->'label')<>'string' THEN RAISE EXCEPTION 'Invalid label' USING ERRCODE='22023';END IF;saved.label:=btrim(p_values->>'label');END IF;
 IF p_values?'domainId' THEN
  IF p_values->'domainId'<>'null' AND jsonb_typeof(p_values->'domainId')<>'string' THEN RAISE EXCEPTION 'Invalid app domain' USING ERRCODE='22023';END IF;
  saved.domain_id:=(p_values->>'domainId')::uuid;
 END IF;
 IF saved.domain_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=saved.domain_id) THEN RAISE EXCEPTION 'Choose an available registered domain' USING ERRCODE='22023';END IF;
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
 IF (SELECT count(*) FROM public.redirect_native_apps WHERE domain_id IS NOT DISTINCT FROM saved.domain_id AND id IS DISTINCT FROM p_id)>=10 THEN RAISE EXCEPTION 'At most ten app bindings per host' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_native_apps(domain_id,label,platform,app_id,app_clip_id,public_name,store_id,app_group_id,handoff_enabled,fingerprints,paths,enabled,created_by) VALUES(saved.domain_id,saved.label,saved.platform,saved.app_id,saved.app_clip_id,saved.public_name,saved.store_id,saved.app_group_id,saved.handoff_enabled,saved.fingerprints,saved.paths,saved.enabled,p_actor) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_native_apps SET domain_id=saved.domain_id,label=saved.label,platform=saved.platform,app_id=saved.app_id,app_clip_id=saved.app_clip_id,public_name=saved.public_name,store_id=saved.store_id,app_group_id=saved.app_group_id,handoff_enabled=saved.handoff_enabled,fingerprints=saved.fingerprints,paths=saved.paths,enabled=saved.enabled,created_by=p_actor WHERE id=p_id RETURNING * INTO saved;
 END IF;
 -- Leave headroom for platform envelopes and per-path JSON component wrappers.
 IF (SELECT coalesce(sum(octet_length(jsonb_strip_nulls(jsonb_build_object('platform',platform,'appId',app_id,'appClipId',app_clip_id,'fingerprints',fingerprints,'paths',paths))::text)),0) FROM public.redirect_native_apps WHERE domain_id IS NOT DISTINCT FROM saved.domain_id AND enabled)>50000 THEN RAISE EXCEPTION 'Published app settings are too large; use fewer path patterns' USING ERRCODE='22023';END IF;
 RETURN public.redirect_native_app_json(saved);
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer) TO service_role;


-- Only deliberately published, path-scoped install choices. No private label,
-- group/owner identity, signing fingerprint, revision or routing destination.
CREATE FUNCTION public.redirect_native_install_choices(p_hostname text,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR p_path IS NULL OR length(p_path)>256 OR p_path !~ '^/[A-Za-z0-9/-]*$' THEN RAISE EXCEPTION 'Invalid install source' USING ERRCODE='22023';END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') AND public.redirect_public_domain(p_hostname) IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'platform',a.platform,'displayName',a.public_name,'storeId',a.store_id,
  'storeUrl',CASE WHEN a.platform='ios' THEN 'https://apps.apple.com/app/id'||a.store_id ELSE 'https://play.google.com/store/apps/details?id='||a.store_id END,
  'appClipBundleId',CASE WHEN a.platform='ios' THEN substring(a.app_clip_id FROM 12) END)) ORDER BY a.id),'[]') INTO result
 FROM public.redirect_native_apps a WHERE (public.redirect_native_handoff_app(a.id,p_hostname,p_path)).id IS NOT NULL;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_install_choices(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_install_choices(text,text) TO service_role;
