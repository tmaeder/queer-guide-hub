-- Exact, owner-reviewed DNS snapshots; an email receipt never establishes DNS readiness.
CREATE TABLE public.redirect_domain_instruction_mail (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_id uuid NOT NULL REFERENCES public.redirect_domains(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 domain_version uuid NOT NULL,
 snapshot text NOT NULL CHECK(snapshot ~ '^[a-f0-9]{64}$'),
 hostname text NOT NULL,
 cname_target text NOT NULL,
 records jsonb NOT NULL CHECK(jsonb_typeof(records)='array'),
 recipient_email text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','leased','sent','failed','cancelled','uncertain')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,lease_until timestamptz,send_started_at timestamptz,
 ambiguous boolean NOT NULL DEFAULT false,
 transport_fingerprint text,from_address text,message_payload jsonb,
 provider_id text,last_error text,sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,request_id),
 CHECK(transport_fingerprint IS NULL OR transport_fingerprint ~ '^[a-f0-9]{64}$'),
 CHECK(message_payload IS NULL OR jsonb_typeof(message_payload)='object')
);
CREATE INDEX redirect_domain_instruction_mail_due ON public.redirect_domain_instruction_mail(next_attempt_at,id) WHERE state IN('queued','leased');
CREATE INDEX redirect_domain_instruction_mail_owner_page ON public.redirect_domain_instruction_mail(domain_id,actor_id,created_at DESC,id DESC);
CREATE INDEX redirect_domain_instruction_mail_domain_recent ON public.redirect_domain_instruction_mail(domain_id,created_at DESC);
ALTER TABLE public.redirect_domain_instruction_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_domain_instruction_mail FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.redirect_domain_instruction_mail TO service_role;

CREATE FUNCTION public.redirect_domain_instruction_snapshot(p_domain uuid,p_target text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE d public.redirect_domains;j public.redirect_domain_jobs;records jsonb;record jsonb;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE id=p_domain;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF p_target IS NULL OR length(p_target)>239 OR p_target !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' OR p_target ~ '(^|\.)(localhost|local|internal|home|test|invalid|example|onion)$' THEN RAISE EXCEPTION 'DNS target is not configured' USING ERRCODE='22023';END IF;
 records:=jsonb_build_array(jsonb_build_object('type','CNAME','name',d.hostname,'value',p_target||'.'),jsonb_build_object('type','TXT','name','_qg-redirect.'||d.hostname,'value','qg-redirect='||d.verification_token));
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=d.id;
 IF d.provider_id IS NOT NULL AND j.desired AND j.cname_target=p_target AND j.state NOT IN('failed','review','disconnected') AND EXISTS(SELECT FROM public.user_roles WHERE user_id=j.requested_by AND role='admin') THEN
  IF jsonb_typeof(j.validation)<>'array' OR jsonb_array_length(j.validation)>10 THEN RAISE EXCEPTION 'Refresh provider records before forwarding instructions' USING ERRCODE='22023';END IF;
  FOR record IN SELECT DISTINCT value FROM jsonb_array_elements(j.validation) ORDER BY value LOOP
   IF jsonb_typeof(record)<>'object' OR record-ARRAY['type','name','value']::text[]<>'{}' OR NOT(record?&ARRAY['type','name','value']) OR record->>'type'<>'TXT'
    OR jsonb_typeof(record->'name')<>'string' OR jsonb_typeof(record->'value')<>'string' OR length(record->>'name') NOT BETWEEN 1 AND 253 OR length(record->>'value') NOT BETWEEN 1 AND 1024
    OR record->>'name' !~ '^[a-z0-9_.-]+$' OR (record->>'name'<>d.hostname AND right(record->>'name',length(d.hostname)+1)<>'.'||d.hostname) OR record->>'value' ~ '[[:cntrl:]]'
   THEN RAISE EXCEPTION 'Refresh provider records before forwarding instructions' USING ERRCODE='22023';END IF;
   IF NOT records @> jsonb_build_array(record) THEN records:=records||jsonb_build_array(record);END IF;
  END LOOP;
 END IF;
 result:=jsonb_build_object('hostname',d.hostname,'version',d.version,'records',records);
 RETURN result||jsonb_build_object('snapshot',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $$;
CREATE FUNCTION public.redirect_domain_instruction_mail_json(p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',id,'requestId',request_id,'domainId',domain_id,'domainVersion',domain_version,'email',recipient_email,'state',state,'createdAt',created_at,'updatedAt',updated_at,'nextAttemptAt',CASE WHEN state='queued' THEN next_attempt_at END,'sentAt',sent_at,'error',last_error,
 'canCancel',state IN('queued','leased') AND NOT ambiguous AND send_started_at IS NULL)
 FROM public.redirect_domain_instruction_mail WHERE id=p_id;
$$;
CREATE FUNCTION public.redirect_domain_instruction_current(p_id uuid,p_target text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE m public.redirect_domain_instruction_mail;d public.redirect_domains;s jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id;
 SELECT * INTO d FROM public.redirect_domains WHERE id=m.domain_id;
 IF m.id IS NULL OR d.id IS NULL OR d.disabled OR d.archived OR d.version IS DISTINCT FROM m.domain_version OR p_target IS DISTINCT FROM m.cname_target OR NOT EXISTS(SELECT FROM public.user_roles WHERE user_id=m.actor_id AND role='admin') THEN RETURN false;END IF;
 BEGIN s:=public.redirect_domain_instruction_snapshot(d.id,p_target);EXCEPTION WHEN invalid_parameter_value OR no_data_found THEN RETURN false;END;
 RETURN s->>'snapshot'=m.snapshot;
END $$;
CREATE FUNCTION public.redirect_domain_instruction_mail_action(p_action text,p_actor uuid,p_domain uuid,p_values jsonb DEFAULT '{}',p_job uuid DEFAULT NULL,p_target text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE d public.redirect_domains;m public.redirect_domain_instruction_mail;s jsonb;latest uuid;retry integer;recent timestamptz;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM public.redirect_domain_actor(p_actor);
 IF p_action IS NULL OR p_action NOT IN('draft','queue','get','cancel','lookup') OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION 'Invalid instruction email action' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE id=p_domain FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF p_action='lookup' THEN
  IF p_job IS NOT NULL OR p_values-ARRAY['requestId']::text[]<>'{}' OR jsonb_typeof(p_values->'requestId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Choose an instruction email request' USING ERRCODE='22023';END IF;
  SELECT id INTO latest FROM public.redirect_domain_instruction_mail WHERE domain_id=d.id AND actor_id=p_actor AND request_id=(p_values->>'requestId')::uuid;
  RETURN public.redirect_domain_instruction_mail_json(latest);
 END IF;
 IF p_action IN('get','cancel') THEN
  IF p_values<>'{}' OR p_job IS NULL THEN RAISE EXCEPTION 'Choose an instruction email' USING ERRCODE='22023';END IF;
  SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_job AND domain_id=d.id AND actor_id=p_actor FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Instruction email not found' USING ERRCODE='P0002';END IF;
  IF p_action='cancel' AND m.state<>'cancelled' THEN
   IF m.state NOT IN('queued','leased') OR m.ambiguous OR m.send_started_at IS NOT NULL THEN RAISE EXCEPTION 'This email may already have been sent and cannot be recalled' USING ERRCODE='23505';END IF;
   UPDATE public.redirect_domain_instruction_mail SET state='cancelled',lease_id=NULL,lease_until=NULL,last_error='Cancelled before sending',updated_at=clock_timestamp() WHERE id=m.id;
  END IF;
  RETURN public.redirect_domain_instruction_mail_json(m.id);
 END IF;
 IF p_job IS NOT NULL OR d.disabled OR d.archived THEN RAISE EXCEPTION 'Enable and restore the domain before forwarding instructions' USING ERRCODE='22023';END IF;
 s:=public.redirect_domain_instruction_snapshot(d.id,p_target);
 IF p_action='draft' THEN
  IF p_values<>'{}' THEN RAISE EXCEPTION 'Unexpected instruction draft fields' USING ERRCODE='22023';END IF;
  SELECT id INTO latest FROM public.redirect_domain_instruction_mail WHERE domain_id=d.id AND actor_id=p_actor ORDER BY created_at DESC,id DESC LIMIT 1;
  RETURN s||jsonb_build_object('latestMail',public.redirect_domain_instruction_mail_json(latest));
 END IF;
 IF p_values-ARRAY['version','snapshot','email','requestId']::text[]<>'{}' OR NOT(p_values?&ARRAY['version','snapshot','email','requestId'])
  OR jsonb_typeof(p_values->'version')<>'string' OR jsonb_typeof(p_values->'requestId')<>'string' OR jsonb_typeof(p_values->'snapshot')<>'string' OR jsonb_typeof(p_values->'email')<>'string'
  OR p_values->>'snapshot' !~ '^[a-f0-9]{64}$' OR length(p_values->>'email') NOT BETWEEN 3 AND 254 OR p_values->>'email' !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]{0,61}[a-z0-9]$' OR p_values->>'email' ~ '[[:cntrl:]]' OR length(split_part(p_values->>'email','@',1))>64 OR split_part(p_values->>'email','@',1) ~ '(^\.|\.$|\.\.)' OR split_part(p_values->>'email','@',2) !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$'
 THEN RAISE EXCEPTION 'Provide a recipient, current draft and request ID' USING ERRCODE='22023';END IF;
 IF (p_values->>'version')::uuid IS DISTINCT FROM d.version OR p_values->>'snapshot'<>s->>'snapshot' THEN RAISE EXCEPTION 'DNS records changed; reload the instructions before sending' USING ERRCODE='23505';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE actor_id=p_actor AND request_id=(p_values->>'requestId')::uuid FOR UPDATE;
 IF m.id IS NOT NULL THEN
  IF m.domain_id<>d.id OR m.recipient_email<>p_values->>'email' OR m.snapshot<>s->>'snapshot' THEN RAISE EXCEPTION 'Request ID already belongs to different instructions' USING ERRCODE='23505';END IF;
  RETURN public.redirect_domain_instruction_mail_json(m.id);
 END IF;
 SELECT max(created_at) INTO recent FROM public.redirect_domain_instruction_mail WHERE domain_id=d.id;
 IF recent>clock_timestamp()-interval '1 minute' THEN RETURN jsonb_build_object('retryAfter',greatest(1,ceil(extract(epoch FROM recent+interval '1 minute'-clock_timestamp()))::integer));END IF;
 retry:=public.redirect_report_budget('domain-mail:'||p_actor::text,10,3600);IF retry=0 THEN retry:=public.redirect_report_budget('domain-mail-global',100,3600);END IF;
 IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
 INSERT INTO public.redirect_domain_instruction_mail(domain_id,actor_id,request_id,domain_version,snapshot,hostname,cname_target,records,recipient_email)
 VALUES(d.id,p_actor,(p_values->>'requestId')::uuid,d.version,s->>'snapshot',d.hostname,p_target,s->'records',p_values->>'email') RETURNING * INTO m;
 RETURN public.redirect_domain_instruction_mail_json(m.id);
END $$;
CREATE FUNCTION public.claim_redirect_domain_instruction_mail(p_from text,p_target text,p_fingerprint text,p_limit integer DEFAULT 3,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE m public.redirect_domain_instruction_mail;result jsonb:='[]';had_unknown boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_from IS NULL OR length(p_from) NOT BETWEEN 3 AND 320 OR p_from ~ '[[:cntrl:]]' OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid instruction mail claim' USING ERRCODE='22023';END IF;
 FOR m IN SELECT * FROM public.redirect_domain_instruction_mail WHERE (p_id IS NULL OR id=p_id) AND ((state='queued' AND next_attempt_at<=clock_timestamp()) OR(state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  had_unknown:=m.ambiguous OR m.send_started_at IS NOT NULL;
  IF NOT public.redirect_domain_instruction_current(m.id,p_target) THEN
   UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN had_unknown THEN 'uncertain' ELSE 'cancelled' END,ambiguous=had_unknown,last_error=CASE WHEN had_unknown THEN 'Setup changed after a possible send; delivery is uncertain' ELSE 'DNS setup or owner changed before sending' END,lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE id=m.id;CONTINUE;
  END IF;
  IF m.attempts>=8 OR m.created_at<=clock_timestamp()-interval '23 hours' OR had_unknown AND m.transport_fingerprint IS DISTINCT FROM p_fingerprint THEN
   UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN had_unknown THEN 'uncertain' ELSE 'failed' END,ambiguous=had_unknown,last_error=CASE WHEN had_unknown THEN 'Delivery is uncertain; automatic retry stopped' ELSE 'Email retry limit or window elapsed' END,lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE id=m.id;CONTINUE;
  END IF;
  UPDATE public.redirect_domain_instruction_mail SET state='leased',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',send_started_at=NULL,ambiguous=had_unknown,transport_fingerprint=p_fingerprint,from_address=coalesce(from_address,p_from),updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
  result:=result||jsonb_build_array(jsonb_build_object('id',m.id,'leaseId',m.lease_id,'email',m.recipient_email,'from',m.from_address,'hostname',m.hostname,'records',m.records,'payload',m.message_payload));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.prepare_redirect_domain_instruction_mail(p_id uuid,p_lease uuid,p_target text,p_fingerprint text,p_payload jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE m public.redirect_domain_instruction_mail;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id AND state='leased' AND lease_id=p_lease FOR UPDATE;
 IF m.id IS NULL OR m.lease_until<=clock_timestamp() OR m.created_at<=clock_timestamp()-interval '23 hours' OR m.transport_fingerprint IS DISTINCT FROM p_fingerprint THEN RETURN NULL;END IF;
 IF NOT public.redirect_domain_instruction_current(m.id,p_target) THEN
  UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN ambiguous OR send_started_at IS NOT NULL THEN 'uncertain' ELSE 'cancelled' END,last_error='DNS setup or owner changed before sending',lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE id=m.id;RETURN NULL;
 END IF;
 IF m.send_started_at IS NOT NULL THEN RETURN NULL;END IF;
 IF m.message_payload IS NULL THEN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['from','to','subject','text','html']::text[]<>'{}' OR NOT(p_payload?&ARRAY['from','to','subject','text','html']) OR p_payload->>'from' IS DISTINCT FROM m.from_address OR p_payload->'to' IS DISTINCT FROM jsonb_build_array(m.recipient_email)
   OR jsonb_typeof(p_payload->'subject')<>'string' OR length(p_payload->>'subject') NOT BETWEEN 1 AND 200 OR p_payload->>'subject' ~ '[[:cntrl:]]'
   OR jsonb_typeof(p_payload->'text')<>'string' OR length(p_payload->>'text') NOT BETWEEN 1 AND 40000 OR jsonb_typeof(p_payload->'html')<>'string' OR length(p_payload->>'html') NOT BETWEEN 1 AND 200000
  THEN RAISE EXCEPTION 'Invalid instruction email payload' USING ERRCODE='22023';END IF;
 ELSIF p_payload IS NOT NULL AND p_payload<>m.message_payload THEN RAISE EXCEPTION 'Instruction email payload is immutable' USING ERRCODE='23505';END IF;
 UPDATE public.redirect_domain_instruction_mail SET message_payload=coalesce(message_payload,p_payload),send_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
 RETURN m.message_payload;
END $$;
CREATE FUNCTION public.finish_redirect_domain_instruction_mail(p_id uuid,p_lease uuid,p_outcome text,p_provider_id text DEFAULT NULL,p_retry_after integer DEFAULT NULL,p_retry boolean DEFAULT true) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE m public.redirect_domain_instruction_mail;unknown boolean;next_state text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id AND state='leased' AND lease_id=p_lease AND send_started_at IS NOT NULL FOR UPDATE;
 IF m.id IS NULL THEN RETURN false;END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN('sent','retry','rejected','unknown') OR p_retry IS NULL OR (p_outcome='sent' AND(p_provider_id IS NULL OR p_provider_id !~ '^[A-Za-z0-9_-]{1,200}$')) OR(p_outcome<>'sent' AND p_provider_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid instruction mail outcome' USING ERRCODE='22023';END IF;
 unknown:=m.ambiguous OR p_outcome='unknown';
 next_state:=CASE WHEN p_outcome='sent' THEN 'sent' WHEN p_outcome IN('retry','unknown') AND p_retry AND m.attempts<8 AND m.created_at>clock_timestamp()-interval '23 hours' THEN 'queued' WHEN unknown THEN 'uncertain' ELSE 'failed' END;
 UPDATE public.redirect_domain_instruction_mail SET state=next_state,ambiguous=CASE WHEN p_outcome='sent' THEN false ELSE unknown END,provider_id=p_provider_id,sent_at=CASE WHEN p_outcome='sent' THEN clock_timestamp() END,
  next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(3600,30*(2^greatest(0,attempts-1))::integer),least(82800,greatest(0,coalesce(p_retry_after,0))))),
  last_error=CASE WHEN p_outcome='sent' THEN NULL WHEN next_state='uncertain' THEN 'Delivery is uncertain; automatic retry stopped' WHEN p_outcome='unknown' THEN 'Email outcome unknown; retrying the same request' WHEN p_outcome='retry' THEN 'Email provider asked us to retry' ELSE 'Email provider rejected the request' END,
  lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE id=m.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.redirect_domain_instruction_snapshot(uuid,text),public.redirect_domain_instruction_mail_json(uuid),public.redirect_domain_instruction_current(uuid,text),public.redirect_domain_instruction_mail_action(text,uuid,uuid,jsonb,uuid,text),public.claim_redirect_domain_instruction_mail(text,text,text,integer,uuid),public.prepare_redirect_domain_instruction_mail(uuid,uuid,text,text,jsonb),public.finish_redirect_domain_instruction_mail(uuid,uuid,text,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_domain_instruction_snapshot(uuid,text),public.redirect_domain_instruction_mail_json(uuid),public.redirect_domain_instruction_current(uuid,text),public.redirect_domain_instruction_mail_action(text,uuid,uuid,jsonb,uuid,text),public.claim_redirect_domain_instruction_mail(text,text,text,integer,uuid),public.prepare_redirect_domain_instruction_mail(uuid,uuid,text,text,jsonb),public.finish_redirect_domain_instruction_mail(uuid,uuid,text,text,integer,boolean) TO service_role;

-- Guarded like the existing notification consumer. Missing cron/Vault leaves dispatch idle.
DO $migration$
DECLARE command text;
BEGIN
 IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN RETURN;END IF;
 command:=$cron$
 SELECT net.http_post(
  url:=rtrim(url.decrypted_secret,'/')||'/functions/v1/redirect-domain-instruction-mail',
  headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',secret.decrypted_secret),body:='{}'::jsonb,timeout_milliseconds:=60000)
 FROM vault.decrypted_secrets url CROSS JOIN vault.decrypted_secrets secret
 WHERE url.name='supabase_url' AND secret.name='internal_invoke_secret'
  AND url.decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co$' AND length(secret.decrypted_secret)>0
 LIMIT 1;
 $cron$;
 EXECUTE 'SELECT cron.schedule($1,$2,$3)' USING 'redirect-domain-instruction-mail','* * * * *',command;
END $migration$;
