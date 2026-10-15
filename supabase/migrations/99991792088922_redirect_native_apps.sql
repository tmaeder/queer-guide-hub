CREATE TABLE public.redirect_native_apps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid REFERENCES public.redirect_domains(id) ON DELETE RESTRICT,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 platform text NOT NULL CHECK(platform IN('ios','android')),
 app_id text NOT NULL CHECK(length(app_id) BETWEEN 3 AND 255),
 fingerprints text[] NOT NULL DEFAULT '{}',
 paths text[] NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redirect_native_app_identity ON public.redirect_native_apps(coalesce(domain_id,'00000000-0000-0000-0000-000000000000'),platform,app_id);
ALTER TABLE public.redirect_native_apps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_native_apps FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.redirect_native_apps TO service_role;
CREATE TRIGGER redirect_native_apps_acl BEFORE INSERT OR UPDATE OR DELETE ON public.redirect_native_apps FOR EACH STATEMENT EXECUTE FUNCTION public.redirect_acl_change_lock();
CREATE FUNCTION public.redirect_native_app_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN NEW.revision:=gen_random_uuid();NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.redirect_native_app_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER redirect_native_app_revision BEFORE UPDATE ON public.redirect_native_apps FOR EACH ROW EXECUTE FUNCTION public.redirect_native_app_revision();

CREATE FUNCTION public.redirect_native_app_json(p_row public.redirect_native_apps) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p_row.id,'domainId',p_row.domain_id,'hostname',coalesce((SELECT hostname FROM public.redirect_domains WHERE id=p_row.domain_id),'queer.guide'),'label',p_row.label,'platform',p_row.platform,'appId',p_row.app_id,'fingerprints',p_row.fingerprints,'paths',p_row.paths,'enabled',p_row.enabled,'version',p_row.revision,'updatedAt',p_row.updated_at);
$$;
REVOKE ALL ON FUNCTION public.redirect_native_app_json(public.redirect_native_apps) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_app_json(public.redirect_native_apps) TO service_role;

CREATE FUNCTION public.redirect_native_app_admin(p_actor uuid,p_action text,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_expected uuid DEFAULT NULL,p_offset integer DEFAULT 0)
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
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','domainId','platform','appId','fingerprints','paths','enabled')) THEN RAISE EXCEPTION 'Invalid app fields' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN saved.enabled:=false;saved.fingerprints:='{}';saved.paths:=ARRAY['/go/*'];END IF;
 IF p_values?'label' THEN IF jsonb_typeof(p_values->'label')<>'string' THEN RAISE EXCEPTION 'Invalid label' USING ERRCODE='22023';END IF;saved.label:=btrim(p_values->>'label');END IF;
 IF p_values?'domainId' THEN
  IF p_values->'domainId'<>'null' AND jsonb_typeof(p_values->'domainId')<>'string' THEN RAISE EXCEPTION 'Invalid app domain' USING ERRCODE='22023';END IF;
  saved.domain_id:=(p_values->>'domainId')::uuid;
 END IF;
 IF saved.domain_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=saved.domain_id) THEN RAISE EXCEPTION 'Choose an available registered domain' USING ERRCODE='22023';END IF;
 IF p_values?'platform' THEN saved.platform:=p_values->>'platform';END IF;
 IF p_values?'appId' THEN saved.app_id:=p_values->>'appId';END IF;
 IF p_values?'enabled' THEN IF jsonb_typeof(p_values->'enabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid publication state' USING ERRCODE='22023';END IF;saved.enabled:=(p_values->>'enabled')::boolean;END IF;
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
 ELSE
  IF saved.app_id !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$' OR cardinality(saved.fingerprints) NOT BETWEEN 1 AND 10 OR EXISTS(SELECT FROM unnest(saved.fingerprints) f WHERE f !~ '^([A-F0-9]{2}:){31}[A-F0-9]{2}$') THEN RAISE EXCEPTION 'Android needs a package and SHA-256 release signing fingerprints' USING ERRCODE='22023';END IF;
 END IF;
 FOREACH item IN ARRAY saved.paths LOOP
  IF length(item)>256 OR item !~ '^/([A-Za-z0-9-]+/)*[A-Za-z0-9-]*(\*)?$' OR saved.domain_id IS NULL AND item NOT LIKE '/go/%' THEN RAISE EXCEPTION 'Use short-link paths on the selected host' USING ERRCODE='22023';END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.redirect_native_apps WHERE domain_id IS NOT DISTINCT FROM saved.domain_id AND id IS DISTINCT FROM p_id)>=10 THEN RAISE EXCEPTION 'At most ten app bindings per host' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_native_apps(domain_id,label,platform,app_id,fingerprints,paths,enabled,created_by) VALUES(saved.domain_id,saved.label,saved.platform,saved.app_id,saved.fingerprints,saved.paths,saved.enabled,p_actor) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_native_apps SET domain_id=saved.domain_id,label=saved.label,platform=saved.platform,app_id=saved.app_id,fingerprints=saved.fingerprints,paths=saved.paths,enabled=saved.enabled,created_by=p_actor WHERE id=p_id RETURNING * INTO saved;
 END IF;
 -- Leave headroom for platform envelopes and per-path JSON component wrappers.
 IF (SELECT coalesce(sum(octet_length(jsonb_build_object('platform',platform,'appId',app_id,'fingerprints',fingerprints,'paths',paths)::text)),0) FROM public.redirect_native_apps WHERE domain_id IS NOT DISTINCT FROM saved.domain_id AND enabled)>50000 THEN RAISE EXCEPTION 'Published app settings are too large; use fewer path patterns' USING ERRCODE='22023';END IF;
 RETURN public.redirect_native_app_json(saved);
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer) TO service_role;

CREATE FUNCTION public.redirect_native_apps_public(p_hostname text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE domain uuid; readiness jsonb; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN RAISE EXCEPTION 'Invalid association host' USING ERRCODE='22023';END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') THEN
  readiness:=public.redirect_public_domain(p_hostname);
  IF readiness IS NULL THEN RETURN NULL;END IF;
  domain:=(readiness->>'id')::uuid;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('platform',platform,'appId',app_id,'fingerprints',fingerprints,'paths',paths) ORDER BY id),'[]') INTO result FROM public.redirect_native_apps app WHERE app.domain_id IS NOT DISTINCT FROM domain AND enabled AND EXISTS(SELECT FROM public.user_roles WHERE user_id=app.created_by AND role='admin');
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_apps_public(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_apps_public(text) TO service_role;
