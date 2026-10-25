-- Internal instruction-mail workers derive authority from their source job.
-- Claims and send preparation require a current active workspace/owner/snapshot;
-- completion preserves external delivery truth after deactivation or role loss.
-- Foreground domain readers and private workspace activation remain unchanged.
CREATE OR REPLACE FUNCTION redirect_internal.domain_instruction_snapshot(p_workspace uuid, p_domain uuid, p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=p_workspace; d public.redirect_domains;j public.redirect_domain_jobs;records jsonb;record jsonb;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_domain;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF p_target IS NULL OR length(p_target)>239 OR p_target !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' OR p_target ~ '(^|\.)(localhost|local|internal|home|test|invalid|example|onion)$' THEN RAISE EXCEPTION 'DNS target is not configured' USING ERRCODE='22023';END IF;
 records:=jsonb_build_array(jsonb_build_object('type','CNAME','name',d.hostname,'value',p_target||'.'),jsonb_build_object('type','TXT','name','_qg-redirect.'||d.hostname,'value','qg-redirect='||d.verification_token));
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=d.id;
 IF d.provider_id IS NOT NULL AND j.desired AND j.cname_target=p_target AND j.state NOT IN('failed','review','disconnected') AND redirect_internal.workspace_owner(j.workspace_id,j.requested_by) THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_domain_instruction_current(p_id uuid, p_target text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; m public.redirect_domain_instruction_mail;d public.redirect_domains;s jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id;
 selected_workspace:=m.workspace_id;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=m.domain_id;
 IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') OR m.id IS NULL OR d.id IS NULL OR d.disabled OR d.archived OR d.version IS DISTINCT FROM m.domain_version OR p_target IS DISTINCT FROM m.cname_target OR NOT redirect_internal.workspace_owner(m.workspace_id,m.actor_id) THEN RETURN false;END IF;
 BEGIN s:=redirect_internal.domain_instruction_snapshot(selected_workspace,d.id,p_target);EXCEPTION WHEN invalid_parameter_value OR no_data_found THEN RETURN false;END;
 RETURN s->>'snapshot'=m.snapshot;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_domain_instruction_mail(p_from text, p_target text, p_fingerprint text, p_limit integer DEFAULT 3, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; m public.redirect_domain_instruction_mail;result jsonb:='[]';had_unknown boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_from IS NULL OR length(p_from) NOT BETWEEN 3 AND 320 OR p_from ~ '[[:cntrl:]]' OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid instruction mail claim' USING ERRCODE='22023';END IF;
 FOR m IN SELECT q.* FROM public.redirect_domain_instruction_mail q JOIN public.redirect_workspaces w ON w.id=q.workspace_id AND w.status='active' WHERE (p_id IS NULL OR q.id=p_id) AND ((state='queued' AND next_attempt_at<=clock_timestamp()) OR(state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,q.id LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP
  selected_workspace:=m.workspace_id;
  had_unknown:=m.ambiguous OR m.send_started_at IS NOT NULL;
  IF NOT public.redirect_domain_instruction_current(m.id,p_target) THEN
   UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN had_unknown THEN 'uncertain' ELSE 'cancelled' END,ambiguous=had_unknown,last_error=CASE WHEN had_unknown THEN 'Setup changed after a possible send; delivery is uncertain' ELSE 'DNS setup or owner changed before sending' END,lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id;CONTINUE;
  END IF;
  IF m.attempts>=8 OR m.created_at<=clock_timestamp()-interval '23 hours' OR had_unknown AND m.transport_fingerprint IS DISTINCT FROM p_fingerprint THEN
   UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN had_unknown THEN 'uncertain' ELSE 'failed' END,ambiguous=had_unknown,last_error=CASE WHEN had_unknown THEN 'Delivery is uncertain; automatic retry stopped' ELSE 'Email retry limit or window elapsed' END,lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id;CONTINUE;
  END IF;
  UPDATE public.redirect_domain_instruction_mail SET state='leased',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',send_started_at=NULL,ambiguous=had_unknown,transport_fingerprint=p_fingerprint,from_address=coalesce(from_address,p_from),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id RETURNING * INTO m;
  result:=result||jsonb_build_array(jsonb_build_object('id',m.id,'leaseId',m.lease_id,'email',m.recipient_email,'from',m.from_address,'hostname',m.hostname,'records',m.records,'payload',m.message_payload));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.prepare_redirect_domain_instruction_mail(p_id uuid, p_lease uuid, p_target text, p_fingerprint text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; m public.redirect_domain_instruction_mail;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id AND state='leased' AND lease_id=p_lease FOR UPDATE;
 selected_workspace:=m.workspace_id;
 IF m.id IS NULL OR m.lease_until<=clock_timestamp() OR m.created_at<=clock_timestamp()-interval '23 hours' OR m.transport_fingerprint IS DISTINCT FROM p_fingerprint THEN RETURN NULL;END IF;
 IF NOT public.redirect_domain_instruction_current(m.id,p_target) THEN
  UPDATE public.redirect_domain_instruction_mail SET state=CASE WHEN ambiguous OR send_started_at IS NOT NULL THEN 'uncertain' ELSE 'cancelled' END,last_error='DNS setup or owner changed before sending',lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id;RETURN NULL;
 END IF;
 IF m.send_started_at IS NOT NULL THEN RETURN NULL;END IF;
 IF m.message_payload IS NULL THEN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['from','to','subject','text','html']::text[]<>'{}' OR NOT(p_payload?&ARRAY['from','to','subject','text','html']) OR p_payload->>'from' IS DISTINCT FROM m.from_address OR p_payload->'to' IS DISTINCT FROM jsonb_build_array(m.recipient_email)
   OR jsonb_typeof(p_payload->'subject')<>'string' OR length(p_payload->>'subject') NOT BETWEEN 1 AND 200 OR p_payload->>'subject' ~ '[[:cntrl:]]'
   OR jsonb_typeof(p_payload->'text')<>'string' OR length(p_payload->>'text') NOT BETWEEN 1 AND 40000 OR jsonb_typeof(p_payload->'html')<>'string' OR length(p_payload->>'html') NOT BETWEEN 1 AND 200000
  THEN RAISE EXCEPTION 'Invalid instruction email payload' USING ERRCODE='22023';END IF;
 ELSIF p_payload IS NOT NULL AND p_payload<>m.message_payload THEN RAISE EXCEPTION 'Instruction email payload is immutable' USING ERRCODE='23505';END IF;
 UPDATE public.redirect_domain_instruction_mail SET message_payload=coalesce(message_payload,p_payload),send_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id RETURNING * INTO m;
 RETURN m.message_payload;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_domain_instruction_mail(p_id uuid, p_lease uuid, p_outcome text, p_provider_id text DEFAULT NULL::text, p_retry_after integer DEFAULT NULL::integer, p_retry boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; m public.redirect_domain_instruction_mail;unknown boolean;next_state text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE id=p_id AND state='leased' AND lease_id=p_lease AND send_started_at IS NOT NULL FOR UPDATE;
 selected_workspace:=m.workspace_id;
 IF m.id IS NULL THEN RETURN false;END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN('sent','retry','rejected','unknown') OR p_retry IS NULL OR (p_outcome='sent' AND(p_provider_id IS NULL OR p_provider_id !~ '^[A-Za-z0-9_-]{1,200}$')) OR(p_outcome<>'sent' AND p_provider_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid instruction mail outcome' USING ERRCODE='22023';END IF;
 unknown:=m.ambiguous OR p_outcome='unknown';
 next_state:=CASE WHEN p_outcome='sent' THEN 'sent' WHEN p_outcome IN('retry','unknown') AND p_retry AND m.attempts<8 AND m.created_at>clock_timestamp()-interval '23 hours' THEN 'queued' WHEN unknown THEN 'uncertain' ELSE 'failed' END;
 UPDATE public.redirect_domain_instruction_mail SET state=next_state,ambiguous=CASE WHEN p_outcome='sent' THEN false ELSE unknown END,provider_id=p_provider_id,sent_at=CASE WHEN p_outcome='sent' THEN clock_timestamp() END,
  next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(3600,30*(2^greatest(0,attempts-1))::integer),least(82800,greatest(0,coalesce(p_retry_after,0))))),
  last_error=CASE WHEN p_outcome='sent' THEN NULL WHEN next_state='uncertain' THEN 'Delivery is uncertain; automatic retry stopped' WHEN p_outcome='unknown' THEN 'Email outcome unknown; retrying the same request' WHEN p_outcome='retry' THEN 'Email provider asked us to retry' ELSE 'Email provider rejected the request' END,
  lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION redirect_internal.domain_instruction_snapshot(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.domain_instruction_snapshot(uuid,uuid,text) TO service_role;

-- Access notifications use the same source-row claim/receipt boundary.
CREATE OR REPLACE FUNCTION redirect_internal.folder_owner_ids(p_workspace uuid, p_folder uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH context AS MATERIALIZED(SELECT p_workspace AS workspace)
 SELECT r.user_id FROM context CROSS JOIN LATERAL redirect_internal.workspace_owner_ids(context.workspace) r WHERE EXISTS(SELECT FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=context.workspace)
 UNION SELECT m.user_id FROM public.redirect_folder_members f JOIN public.redirect_workspace_members m ON m.id=f.member_id CROSS JOIN context
 WHERE f.workspace_id=context.workspace AND m.workspace_id=context.workspace AND f.folder_id=p_folder AND f.permission='owner' AND m.kind='user' AND m.active AND m.role='member'
$function$;
CREATE OR REPLACE FUNCTION public.claim_redirect_access_mail(p_from text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid;job public.redirect_access_mail; request public.redirect_access_requests; valid boolean; result jsonb:='[]';
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_from IS NULL OR length(p_from) NOT BETWEEN 3 AND 320 OR p_from ~ E'[\r\n]' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid mail claim' USING ERRCODE='22023';END IF;
 FOR job IN SELECT q.* FROM public.redirect_access_mail q JOIN public.redirect_workspaces w ON w.id=q.workspace_id AND w.status='active' WHERE ((state='queued' AND next_attempt_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,q.id LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP
  selected_workspace:=job.workspace_id;
  SELECT * INTO request FROM public.redirect_access_requests WHERE id=job.request_id AND workspace_id=selected_workspace;
  SELECT EXISTS(SELECT FROM public.redirect_access_recipient(job.recipient_user_id) u WHERE u.email=job.recipient_email) INTO valid;
  valid:=valid AND CASE WHEN job.event='requested' THEN request.status='pending' AND EXISTS(SELECT FROM redirect_internal.folder_owner_ids(selected_workspace,request.folder_id) WHERE user_id=job.recipient_user_id)
   ELSE request.status=job.event AND EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=request.member_id AND user_id=job.recipient_user_id AND active) END;
  IF NOT coalesce(valid,false) THEN UPDATE public.redirect_access_mail SET state='cancelled',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace;CONTINUE;END IF;
  IF job.attempts>=8 OR job.first_attempt_at<clock_timestamp()-interval '23 hours' THEN UPDATE public.redirect_access_mail SET state='failed',last_error='Delivery retry window elapsed',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace;CONTINUE;END IF;
  UPDATE public.redirect_access_mail SET state='leased',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),from_address=coalesce(from_address,p_from),updated_at=clock_timestamp() WHERE id=job.id AND workspace_id=selected_workspace RETURNING * INTO job;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'leaseId',job.lease_id,'email',job.recipient_email,'from',job.from_address,'event',job.event));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_access_mail(p_id uuid, p_lease uuid, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_retry boolean DEFAULT true, p_retry_after integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid;job public.redirect_access_mail;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM public.redirect_access_mail WHERE id=p_id AND state='leased' AND lease_id=p_lease FOR UPDATE;
 selected_workspace:=job.workspace_id;
 IF job.id IS NULL THEN RETURN false;END IF;
 IF p_provider_id IS NOT NULL AND length(p_provider_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid provider receipt' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_access_mail SET state=CASE WHEN p_provider_id IS NOT NULL THEN 'sent' WHEN p_retry AND attempts<8 AND first_attempt_at>clock_timestamp()-interval '23 hours' THEN 'queued' ELSE 'failed' END,
  next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(3600,30*(2^greatest(0,attempts-1))::integer),least(82800,greatest(0,coalesce(p_retry_after,0))))),
  provider_id=p_provider_id,last_error=CASE WHEN p_provider_id IS NULL THEN left(coalesce(p_error,'Email delivery unavailable'),200) ELSE NULL END,
  lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_id AND workspace_id=selected_workspace;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION redirect_internal.folder_owner_ids(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.folder_owner_ids(uuid,uuid) TO service_role;
