-- Archiving is organizational: current routing/provider/link authorization remains intact.
ALTER TABLE public.redirect_domains ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX redirect_domains_archive_page ON public.redirect_domains(archived,id);
CREATE FUNCTION public.redirect_domain_archive_primary() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.archived AND NOT OLD.archived THEN UPDATE public.redirect_domain_preferences SET domain_id=NULL WHERE singleton AND domain_id=NEW.id;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER redirect_domain_archive_primary AFTER UPDATE OF archived ON public.redirect_domains FOR EACH ROW EXECUTE FUNCTION public.redirect_domain_archive_primary();
REVOKE ALL ON FUNCTION public.redirect_domain_archive_primary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_domain_archive_primary() TO service_role;
CREATE OR REPLACE FUNCTION public.redirect_domain_json(p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',id,'hostname',hostname,'version',version,'disabled',disabled,'archived',archived,'ownershipState',ownership_state,
 'ownershipVerified',ownership_state='verified' AND verified_until>clock_timestamp(),'verifiedAt',verified_at,'verifiedUntil',verified_until,
 'lastCheckedAt',last_checked_at,'lastCheck',last_check,'nextCheckAt',next_check_at,
 'rootUrl',root_url,'notFoundUrl',not_found_url,'expiredUrl',expired_url,'providerConnected',provider_id IS NOT NULL,
 'routingReady',public.redirect_public_domain(hostname,true) IS NOT NULL,'routingSeenAt',routing_seen_at,
 'verification',jsonb_build_object('type','TXT','name','_qg-redirect.'||hostname,'value','qg-redirect='||verification_token))||public.redirect_domain_provider_json(id)
 FROM public.redirect_domains WHERE id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.redirect_domain_resource(p_action text,p_actor uuid,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_limit integer DEFAULT 50,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.redirect_domains;result jsonb;field text;retry integer;filters jsonb;archive_mode text;search_term text;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 IF p_action='list' THEN
  filters:=coalesce(p_values,'{}'::jsonb);
  IF jsonb_typeof(filters)<>'object' OR filters-ARRAY['archive','q']::text[]<>'{}' OR filters?'archive' AND(jsonb_typeof(filters->'archive')<>'string' OR coalesce(filters->>'archive','') NOT IN('active','archived','all')) OR filters?'q' AND(jsonb_typeof(filters->'q')<>'string' OR length(filters->>'q')>253 OR filters->>'q' ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'Invalid domain filters' USING ERRCODE='22023';END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid domain page' USING ERRCODE='22023';END IF;
  archive_mode:=coalesce(filters->>'archive','active');search_term:=lower(btrim(coalesce(filters->>'q','')));
  WITH matching AS MATERIALIZED(SELECT id FROM public.redirect_domains WHERE(archive_mode='all' OR archived=(archive_mode='archived')) AND position(search_term in hostname)>0),
  page AS MATERIALIZED(SELECT id FROM matching WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT id FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce(jsonb_agg(public.redirect_domain_json(id) ORDER BY id),'[]'),'count',(SELECT count(*) FROM matching),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN max(id::text) ELSE NULL END) INTO result FROM shown;RETURN result;
 END IF;
 IF p_action IS NULL OR p_action NOT IN('get','create','patch','delete','rotate','reserve') THEN RAISE EXCEPTION 'Invalid domain action' USING ERRCODE='22023';END IF;
 IF p_action<>'create' THEN SELECT * INTO r FROM public.redirect_domains WHERE id=p_id FOR UPDATE;IF r.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;END IF;
 IF p_action='get' THEN RETURN public.redirect_domain_json(r.id);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION 'Invalid domain fields' USING ERRCODE='22023';END IF;
 IF p_action<>'create' AND (p_values->>'version')::uuid IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Domain changed; reload before continuing' USING ERRCODE='23505';END IF;
 IF p_action IN('delete','rotate','reserve') AND p_values-ARRAY['version']::text[]<>'{}' THEN RAISE EXCEPTION 'Provide only the current domain version' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN
  IF r.provider_id IS NOT NULL THEN RAISE EXCEPTION 'Disconnect the provider hostname before removing this domain' USING ERRCODE='22023';END IF;
  DELETE FROM public.redirect_domains WHERE id=r.id;RETURN jsonb_build_object('id',r.id,'deleted',true);
 END IF;
 IF p_action='rotate' THEN
  UPDATE public.redirect_domains SET verification_token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),ownership_state='pending',verified_at=NULL,verified_until=NULL,verification_attempt=NULL,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE id=r.id;
  RETURN public.redirect_domain_json(r.id);
 END IF;
 IF p_action='reserve' THEN
  IF r.disabled THEN RAISE EXCEPTION 'Enable this domain before checking ownership' USING ERRCODE='22023';END IF;
  IF r.next_check_at>clock_timestamp() THEN RETURN jsonb_build_object('retryAfter',greatest(1,ceil(extract(epoch FROM r.next_check_at-clock_timestamp()))::integer));END IF;
  retry:=public.redirect_report_budget('domain-check-global',100,3600);IF retry=0 THEN retry:=public.redirect_report_budget('domain-check:'||p_actor::text,30,3600);END IF;
  IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
  UPDATE public.redirect_domains SET verification_attempt=gen_random_uuid(),next_check_at=clock_timestamp()+interval '1 minute' WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('domain',public.redirect_domain_json(r.id),'attempt',r.verification_attempt);
 END IF;
 IF p_values-ARRAY['hostname','version','rootUrl','notFoundUrl','expiredUrl','disabled','archived']::text[]<>'{}' OR (p_action='patch' AND p_values?'hostname') OR(p_action='create' AND p_values?'archived') THEN RAISE EXCEPTION 'Invalid domain fields' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  IF p_values?'version' THEN RAISE EXCEPTION 'Do not provide a creation version' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_domains(hostname,created_by) VALUES(p_values->>'hostname',p_actor) RETURNING * INTO r;
 END IF;
 FOREACH field IN ARRAY ARRAY['rootUrl','notFoundUrl','expiredUrl'] LOOP
  IF p_values?field AND (jsonb_typeof(p_values->field) NOT IN('string','null') OR NOT public.redirect_domain_destination(p_values->>field,r.hostname)) THEN RAISE EXCEPTION 'Choose a public HTTP(S) destination outside redirect domains' USING ERRCODE='22023';END IF;
 END LOOP;
 IF p_values?'archived' AND jsonb_typeof(p_values->'archived')<>'boolean' THEN RAISE EXCEPTION 'Invalid archive state' USING ERRCODE='22023';END IF;
 IF p_values?'disabled' AND jsonb_typeof(p_values->'disabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid domain state' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_domains SET root_url=CASE WHEN p_values?'rootUrl' THEN p_values->>'rootUrl' ELSE root_url END,
 not_found_url=CASE WHEN p_values?'notFoundUrl' THEN p_values->>'notFoundUrl' ELSE not_found_url END,
 expired_url=CASE WHEN p_values?'expiredUrl' THEN p_values->>'expiredUrl' ELSE expired_url END,
 archived=CASE WHEN p_values?'archived' THEN (p_values->>'archived')::boolean ELSE archived END,
 disabled=CASE WHEN p_values?'disabled' THEN (p_values->>'disabled')::boolean ELSE disabled END,
 verification_attempt=NULL,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE id=r.id;
 RETURN public.redirect_domain_json(r.id);
END $$;

CREATE OR REPLACE FUNCTION public.redirect_domain_choices(p_token_id uuid DEFAULT NULL,p_limit integer DEFAULT 100,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE allowed uuid[];wide boolean;primary_id uuid;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 allowed:=public.redirect_management_scope(p_token_id,'links:read');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid domain page' USING ERRCODE='22023';END IF;
 wide:=allowed IS NULL OR public.redirect_can_create_in_folder(p_token_id,NULL);
 IF wide THEN SELECT domain_id INTO primary_id FROM public.redirect_domain_preferences WHERE singleton;END IF;
 WITH ready AS MATERIALIZED(
  SELECT d.id,d.hostname FROM public.redirect_domains d
  WHERE (wide OR EXISTS(SELECT FROM public.redirects r WHERE r.domain_id=d.id AND r.id=ANY(allowed)))
   AND NOT d.archived AND public.redirect_public_domain(d.hostname,true) IS NOT NULL
 ),page AS MATERIALIZED(SELECT * FROM ready WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),
 shown AS MATERIALIZED(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'hostname',hostname) ORDER BY id) FROM shown),'[]'::jsonb),
 'count',(SELECT count(*) FROM ready),'primaryDomainId',primary_id,'primaryUnavailable',primary_id IS NOT NULL AND NOT EXISTS(SELECT FROM ready WHERE id=primary_id),
 'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT max(id::text) FROM shown) ELSE NULL END) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.redirect_domain_preference(p_actor uuid,p_values jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE pref public.redirect_domain_preferences;host text;
BEGIN
 IF p_values='null'::jsonb THEN p_values:=NULL;END IF;
 PERFORM public.redirect_domain_actor(p_actor);
 SELECT * INTO pref FROM public.redirect_domain_preferences WHERE singleton FOR UPDATE;
 IF p_values IS NOT NULL THEN
  IF jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['domainId','version']::text[]<>'{}' OR NOT(p_values?'domainId') OR (p_values->>'version')::uuid IS DISTINCT FROM pref.version THEN RAISE EXCEPTION 'Primary domain changed; refresh before saving' USING ERRCODE='23505';END IF;
  IF p_values->>'domainId' IS NOT NULL THEN
   SELECT hostname INTO host FROM public.redirect_domains WHERE id=(p_values->>'domainId')::uuid AND NOT archived;
   IF host IS NULL OR public.redirect_public_domain(host,true) IS NULL THEN RAISE EXCEPTION 'Choose an active domain with current ownership, TLS and routing proof' USING ERRCODE='22023';END IF;
  END IF;
  UPDATE public.redirect_domain_preferences SET domain_id=(p_values->>'domainId')::uuid WHERE singleton RETURNING * INTO pref;
 END IF;
 SELECT hostname INTO host FROM public.redirect_domains WHERE id=pref.domain_id;
 RETURN jsonb_build_object('domainId',pref.domain_id,'hostname',host,'version',pref.version,'ready',pref.domain_id IS NULL OR(public.redirect_public_domain(host,true) IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=pref.domain_id AND archived)));
END $$;
