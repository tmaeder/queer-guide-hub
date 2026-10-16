-- Provider approval is not DNS proof. Only the existing nonce-bound verifier can change ownership.
CREATE TABLE public.redirect_domain_connect_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid NOT NULL REFERENCES public.redirect_domains(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 domain_version uuid NOT NULL,
 configuration text NOT NULL CHECK(configuration ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'discovering' CHECK(state IN('discovering','review','signing','approved','checking','complete','unsupported','unavailable')),
 discovery jsonb,
 check_attempt uuid,
 outcome text CHECK(outcome IN('verified','missing','unavailable')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes'
);
CREATE INDEX redirect_domain_connect_domain_created ON public.redirect_domain_connect_operations(domain_id,created_at DESC);
CREATE INDEX redirect_domain_connect_expiry ON public.redirect_domain_connect_operations(expires_at);
ALTER TABLE public.redirect_domain_connect_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_domain_connect_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.redirect_domain_connect_operations TO service_role;

CREATE FUNCTION public.redirect_domain_connect_operation(p_action text,p_actor uuid,p_domain uuid,p_version uuid,p_configuration text,p_operation uuid DEFAULT NULL,p_values jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE d public.redirect_domains;o public.redirect_domain_connect_operations;retry integer;latest timestamptz;checked jsonb;result jsonb;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 IF p_action IS NULL OR p_action NOT IN('reserve','discovered','sign','issued','check','checked') OR p_configuration IS NULL OR p_configuration !~ '^[a-f0-9]{64}$' OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION 'Invalid DNS setup operation' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE id=p_domain FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF d.version IS DISTINCT FROM p_version OR d.disabled OR d.archived THEN RAISE EXCEPTION 'Domain changed; restart DNS setup' USING ERRCODE='23505';END IF;
 IF p_action='reserve' THEN
  IF p_operation IS NOT NULL OR p_values<>'{}' THEN RAISE EXCEPTION 'Invalid discovery fields' USING ERRCODE='22023';END IF;
  SELECT max(created_at) INTO latest FROM public.redirect_domain_connect_operations WHERE domain_id=d.id;
  IF latest>clock_timestamp()-interval '1 minute' THEN RETURN jsonb_build_object('retryAfter',greatest(1,ceil(extract(epoch FROM latest+interval '1 minute'-clock_timestamp()))::integer));END IF;
  retry:=public.redirect_report_budget('domain-connect-global',100,3600);IF retry=0 THEN retry:=public.redirect_report_budget('domain-connect:'||p_actor::text,30,3600);END IF;
  IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
  DELETE FROM public.redirect_domain_connect_operations WHERE expires_at<clock_timestamp()-interval '1 day';
  INSERT INTO public.redirect_domain_connect_operations(domain_id,actor_id,domain_version,configuration) VALUES(d.id,p_actor,d.version,p_configuration) RETURNING * INTO o;
 ELSE
  SELECT * INTO o FROM public.redirect_domain_connect_operations WHERE id=p_operation AND domain_id=d.id AND actor_id=p_actor FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'DNS setup not found' USING ERRCODE='P0002';END IF;
  IF o.expires_at<=clock_timestamp() OR o.domain_version IS DISTINCT FROM d.version OR o.configuration<>p_configuration THEN RAISE EXCEPTION 'DNS setup expired or changed; restart setup' USING ERRCODE='23505';END IF;
  IF p_action='discovered' THEN
   IF o.state<>'discovering' THEN RAISE EXCEPTION 'DNS discovery already finished' USING ERRCODE='23505';END IF;
   IF p_values->>'status'='available' THEN
    IF p_values-ARRAY['status','provider','hostname','domain','host','apiBase','syncBase','templateVersion']::text[]<>'{}'
     OR NOT(p_values?&ARRAY['status','provider','hostname','domain','host','apiBase','syncBase','templateVersion'])
     OR p_values->>'provider' NOT IN('cloudflare','vercel') OR p_values->>'hostname' IS DISTINCT FROM d.hostname
     OR coalesce(p_values->>'domain','')='' OR coalesce(p_values->>'host','')='' OR p_values->>'host'||'.'||(p_values->>'domain') IS DISTINCT FROM d.hostname
     OR p_values->>'domain' !~ '^([a-z0-9-]+\.)+[a-z0-9-]+$' OR p_values->>'host' !~ '^[a-z0-9-]+(\.[a-z0-9-]+)*$'
     OR jsonb_typeof(p_values->'templateVersion') NOT IN('number','null') OR p_values->'templateVersion' NOT IN('null'::jsonb,'1'::jsonb)
     OR (p_values->>'provider'='cloudflare' AND(p_values->>'apiBase'<>'https://api.cloudflare.com/client/v4/dns/domainconnect' OR p_values->>'syncBase' !~ '^https://dash\.cloudflare\.com(/[A-Za-z0-9_-]+)*$'))
     OR (p_values->>'provider'='vercel' AND(p_values->>'apiBase' !~ '^https://([a-z0-9-]+\.)*vercel\.com(/[A-Za-z0-9_-]+)*$' OR p_values->>'syncBase' !~ '^https://vercel\.com(/[A-Za-z0-9_-]+)*$'))
    THEN RAISE EXCEPTION 'Invalid discovered provider' USING ERRCODE='22023';END IF;
    UPDATE public.redirect_domain_connect_operations SET state='review',discovery=p_values WHERE id=o.id RETURNING * INTO o;
   ELSE
    IF p_values-ARRAY['status','reason']::text[]<>'{}' OR coalesce(p_values->>'status','') NOT IN('unsupported','unavailable') OR coalesce(p_values->>'reason','') NOT IN('no_zone','apex_not_supported','dns_provider_not_supported','template_not_supported','provider_unavailable') THEN RAISE EXCEPTION 'Invalid discovery result' USING ERRCODE='22023';END IF;
    UPDATE public.redirect_domain_connect_operations SET state=p_values->>'status',discovery=p_values WHERE id=o.id RETURNING * INTO o;
   END IF;
  ELSIF p_action IN('sign','issued','check') THEN
   IF p_values<>'{}' THEN RAISE EXCEPTION 'Unexpected DNS setup fields' USING ERRCODE='22023';END IF;
   IF o.state<>(CASE p_action WHEN 'sign' THEN 'review' WHEN 'issued' THEN 'signing' ELSE 'approved' END) THEN RAISE EXCEPTION 'DNS setup changed; reload before continuing' USING ERRCODE='23505';END IF;
   IF p_action='check' THEN
    checked:=public.redirect_domain_resource('reserve',p_actor,d.id,jsonb_build_object('version',d.version));
    IF checked?'retryAfter' THEN RETURN checked;END IF;
    UPDATE public.redirect_domain_connect_operations SET state='checking',check_attempt=(checked->>'attempt')::uuid WHERE id=o.id RETURNING * INTO o;
   ELSE
    UPDATE public.redirect_domain_connect_operations SET state=CASE p_action WHEN 'sign' THEN 'signing' ELSE 'approved' END WHERE id=o.id RETURNING * INTO o;
   END IF;
  ELSE
   IF o.state<>'checking' THEN RAISE EXCEPTION 'DNS check not pending' USING ERRCODE='23505';END IF;
   IF p_values-ARRAY['outcome']::text[]<>'{}' OR coalesce(p_values->>'outcome','') NOT IN('verified','missing','unavailable') THEN RAISE EXCEPTION 'Invalid DNS check result' USING ERRCODE='22023';END IF;
   checked:=public.redirect_domain_check_result(p_actor,d.id,d.version,o.check_attempt,p_values->>'outcome');
   UPDATE public.redirect_domain_connect_operations SET state='complete',outcome=p_values->>'outcome',check_attempt=NULL,domain_version=(checked->>'version')::uuid WHERE id=o.id RETURNING * INTO o;
  END IF;
 END IF;
 result:=jsonb_build_object('id',o.id,'state',o.state,'expiresAt',o.expires_at,'discovery',o.discovery,'outcome',o.outcome,'domain',public.redirect_domain_json(d.id));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_domain_connect_operation(text,uuid,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_domain_connect_operation(text,uuid,uuid,uuid,text,uuid,jsonb) TO service_role;

-- A provider callback carries only a random operation ID. Resolve it under the current owner.
CREATE FUNCTION public.redirect_domain_connect_current(p_actor uuid,p_operation uuid,p_configuration text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE o public.redirect_domain_connect_operations;d public.redirect_domains;
BEGIN
 PERFORM public.redirect_domain_actor(p_actor);
 SELECT * INTO o FROM public.redirect_domain_connect_operations WHERE id=p_operation AND actor_id=p_actor;
 IF o.id IS NULL THEN RAISE EXCEPTION 'DNS setup not found' USING ERRCODE='P0002';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE id=o.domain_id;
 IF d.id IS NULL OR d.disabled OR d.archived OR d.version IS DISTINCT FROM o.domain_version OR o.expires_at<=clock_timestamp() OR p_configuration IS DISTINCT FROM o.configuration THEN RAISE EXCEPTION 'DNS setup expired or changed; restart setup' USING ERRCODE='23505';END IF;
 RETURN jsonb_build_object('id',o.id,'state',o.state,'expiresAt',o.expires_at,'domain',public.redirect_domain_json(d.id),'discovery',o.discovery,'outcome',o.outcome);
END $$;
REVOKE ALL ON FUNCTION public.redirect_domain_connect_current(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_domain_connect_current(uuid,uuid,text) TO service_role;
