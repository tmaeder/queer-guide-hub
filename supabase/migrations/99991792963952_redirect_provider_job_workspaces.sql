-- Provider workers derive workspace from the immutable domain job, not request
-- selection. New external work requires active workspace/current owner; nonce-
-- bound creation receipts and external status/deletion facts remain recordable.
CREATE OR REPLACE FUNCTION public.begin_redirect_domain_create(p_id uuid, p_lease uuid, p_operation uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; j public.redirect_domain_jobs;d public.redirect_domains;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;
 IF j.domain_id IS NULL OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RETURN NULL;END IF;SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.state<>'leased' OR p_lease IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_operation IS DISTINCT FROM j.operation OR NOT j.desired OR j.create_started_at IS NOT NULL OR d.provider_id IS NOT NULL OR d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN NULL;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.redirect_domain_jobs SET create_nonce=gen_random_uuid(),create_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id RETURNING create_nonce INTO j.create_nonce;
 RETURN j.create_nonce;
END $function$;

CREATE OR REPLACE FUNCTION public.begin_redirect_domain_validation_restart(p_id uuid, p_lease uuid, p_operation uuid, p_provider uuid, p_zone text, p_target text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; d public.redirect_domains;j public.redirect_domain_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;
 IF j.domain_id IS NULL OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RETURN false;END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR j.state<>'leased' OR p_lease IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_operation IS DISTINCT FROM j.operation OR j.validation_restart_operation IS DISTINCT FROM j.operation OR p_provider IS NULL OR d.provider_id IS NULL OR p_provider::text IS DISTINCT FROM d.provider_id OR p_zone IS DISTINCT FROM j.zone_id OR p_target IS DISTINCT FROM j.cname_target OR NOT j.desired OR d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN false;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE public.redirect_domain_jobs SET validation_restart_operation=NULL,validation_restart_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_domain_jobs(p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; j public.redirect_domain_jobs;d public.redirect_domains;result jsonb:='[]';kind text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid provider batch' USING ERRCODE='22023';END IF;
 FOR j IN SELECT q.* FROM public.redirect_domain_jobs q JOIN public.redirect_workspaces w ON w.id=q.workspace_id AND w.status='active' WHERE ((state IN('queued','waiting','ready') AND next_attempt_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,domain_id LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP
  selected_workspace:=j.workspace_id;
  SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=j.domain_id FOR UPDATE;
  IF j.attempts>=12 THEN UPDATE public.redirect_domain_jobs SET state='failed',last_error='Provider retry limit reached',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;END IF;
  IF NOT j.desired AND d.provider_id IS NULL AND j.create_started_at IS NULL AND j.adopt_id IS NULL THEN UPDATE public.redirect_domain_jobs SET state='disconnected',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;END IF;
  kind:=CASE WHEN j.adopt_id IS NOT NULL THEN 'adopt' WHEN d.provider_id IS NOT NULL AND NOT j.desired THEN 'delete' WHEN d.provider_id IS NOT NULL THEN 'refresh' WHEN j.create_started_at IS NOT NULL THEN 'reconcile' ELSE 'preflight' END;
  IF kind IN('preflight','adopt','refresh') AND NOT redirect_internal.workspace_owner(j.workspace_id,j.requested_by) THEN
   UPDATE public.redirect_domain_jobs SET state='failed',last_error='Current owner permission is required',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;
  END IF;
  IF kind='preflight' AND (d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() OR NOT redirect_internal.workspace_owner(j.workspace_id,j.requested_by)) THEN
   UPDATE public.redirect_domain_jobs SET state='failed',last_error='Current owner permission and fresh ownership proof are required',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;
  END IF;
  UPDATE public.redirect_domain_jobs SET state='leased',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=j.domain_id RETURNING * INTO j;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.domain_id,'operation',j.operation,'lease',j.lease,'kind',kind,'zoneId',j.zone_id,'cnameTarget',j.cname_target,'hostname',d.hostname,'providerId',d.provider_id,'adoptId',j.adopt_id,'desired',j.desired));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_domain_job(p_id uuid, p_lease uuid, p_operation uuid, p_result jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; j public.redirect_domain_jobs;d public.redirect_domains;kind text;delay integer;retry boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR p_result IS NULL OR jsonb_typeof(p_result)<>'object' THEN RETURN false;END IF;
 kind:=p_result->>'kind';
 -- A confirmed delete/404 describes an external fact even if a new action won
 -- the operation race. Never clear a newer/different provider binding.
 IF kind='deleted' AND d.provider_id=p_result->>'id' THEN
  UPDATE public.redirect_domains SET provider_id=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=p_id;
  UPDATE public.redirect_domain_jobs SET create_nonce=NULL,create_started_at=NULL,provider_status=NULL,ssl_status=NULL,checked_at=NULL,validation='[]' WHERE workspace_id=selected_workspace AND domain_id=p_id;
  j.create_nonce:=NULL;j.create_started_at:=NULL;d.provider_id:=NULL;
 END IF;
 IF j.state<>'leased' OR p_lease IS DISTINCT FROM j.lease THEN RETURN false;END IF;
 IF j.lease_until<=clock_timestamp() OR p_operation IS DISTINCT FROM j.operation THEN
  UPDATE public.redirect_domain_jobs SET state=CASE WHEN NOT desired AND d.provider_id IS NULL AND create_started_at IS NULL THEN 'disconnected' ELSE 'queued' END,lease=NULL,lease_until=NULL,next_attempt_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;RETURN false;
 END IF;
 IF kind='status' THEN
  IF d.provider_id IS NULL OR d.provider_id IS DISTINCT FROM p_result->>'id' OR p_result->>'hostname' IS DISTINCT FROM d.hostname OR coalesce(p_result->>'hostnameStatus','') !~ '^[a-z_]{1,64}$' OR coalesce(p_result->>'sslStatus','') !~ '^[a-z_]{1,64}$' OR jsonb_typeof(p_result->'validation') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'validation')>10 THEN RAISE EXCEPTION 'Invalid provider result' USING ERRCODE='22023';END IF;
  UPDATE public.redirect_domain_jobs SET state=CASE WHEN NOT desired THEN 'queued' WHEN p_result->>'hostnameStatus'='active' AND p_result->>'sslStatus'='active' THEN 'ready' ELSE 'waiting' END,
   provider_status=p_result->>'hostnameStatus',ssl_status=p_result->>'sslStatus',validation=p_result->'validation',checked_at=clock_timestamp(),attempts=0,next_attempt_at=clock_timestamp()+CASE WHEN NOT desired THEN interval '0 seconds' ELSE interval '5 minutes' END,last_error=NULL WHERE workspace_id=selected_workspace AND domain_id=p_id;
 ELSIF kind='candidates' THEN
  IF jsonb_typeof(p_result->'candidates') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'candidates')>5 THEN RAISE EXCEPTION 'Invalid provider candidates' USING ERRCODE='22023';END IF;
  UPDATE public.redirect_domain_jobs SET state='review',candidates=p_result->'candidates',reconciled_at=clock_timestamp(),attempts=0,last_error='Review the existing or uncertain provider hostname before continuing' WHERE workspace_id=selected_workspace AND domain_id=p_id;
 ELSIF kind IN('deleted','cancelled') THEN
  UPDATE public.redirect_domain_jobs SET state=CASE WHEN NOT desired AND d.provider_id IS NULL AND create_started_at IS NULL THEN 'disconnected' ELSE 'queued' END,next_attempt_at=clock_timestamp(),attempts=0,last_error=NULL WHERE workspace_id=selected_workspace AND domain_id=p_id;
 ELSIF kind='error' THEN
  retry:=coalesce((p_result->>'retry')::boolean,false);delay:=greatest(10,least(3600,coalesce((p_result->>'retryAfter')::integer,30*power(2,least(j.attempts,6))::integer)));
  IF coalesce((p_result->>'definiteRejection')::boolean,false) AND d.provider_id IS NULL THEN UPDATE public.redirect_domain_jobs SET create_nonce=NULL,create_started_at=NULL WHERE workspace_id=selected_workspace AND domain_id=p_id;j.create_started_at:=NULL;END IF;
  UPDATE public.redirect_domain_jobs SET state=CASE WHEN d.provider_id IS NULL AND j.create_started_at IS NOT NULL THEN 'review' WHEN retry AND attempts<12 THEN 'waiting' ELSE 'failed' END,
   last_error=left(coalesce(p_result->>'error','Provider request failed'),200),next_attempt_at=clock_timestamp()+make_interval(secs=>delay) WHERE workspace_id=selected_workspace AND domain_id=p_id;
 ELSE RAISE EXCEPTION 'Invalid provider completion' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_domain_jobs SET lease=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.record_redirect_domain_provider(p_id uuid, p_nonce uuid, p_provider uuid, p_mode text DEFAULT 'created'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; j public.redirect_domain_jobs;d public.redirect_domains;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR p_provider IS NULL OR p_nonce IS NULL THEN RETURN false;END IF;
 IF p_mode='created' THEN IF p_nonce IS DISTINCT FROM j.create_nonce THEN RETURN false;END IF;
 ELSIF p_mode='adopted' THEN
  IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RETURN false;END IF;
  IF p_nonce IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_provider IS DISTINCT FROM j.adopt_id THEN RETURN false;END IF;
  PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);IF NOT FOUND THEN RETURN false;END IF;
  IF j.desired AND (d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp()) THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 IF d.provider_id IS NOT NULL AND d.provider_id<>p_provider::text THEN
  UPDATE public.redirect_domain_jobs SET state='review',last_error='Conflicting provider receipt requires review',candidates=jsonb_build_array(jsonb_build_object('id',p_provider,'hostname',d.hostname)) WHERE workspace_id=selected_workspace AND domain_id=p_id;RETURN false;
 END IF;
 UPDATE public.redirect_domains SET provider_id=p_provider::text,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=p_id;
 UPDATE public.redirect_domain_jobs SET adopt_id=NULL,candidates='[]',state=CASE WHEN state='leased' AND lease_until>clock_timestamp() THEN state ELSE 'queued' END,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_domain_renewal(p_id uuid, p_lease uuid, p_operation uuid, p_version uuid, p_attempt uuid, p_outcome text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; r public.redirect_domains;j public.redirect_domain_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;
 IF j.domain_id IS NULL OR j.state<>'leased' OR j.lease IS DISTINCT FROM p_lease OR j.operation IS DISTINCT FROM p_operation OR j.lease_until<=clock_timestamp() OR NOT j.desired OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') OR NOT redirect_internal.workspace_owner(selected_workspace,j.requested_by) THEN RETURN false;END IF;
 SELECT * INTO r FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF r.disabled OR r.next_check_at IS NULL OR r.next_check_at<=clock_timestamp() OR p_version IS DISTINCT FROM r.version OR p_attempt IS NULL OR p_attempt IS DISTINCT FROM r.verification_attempt THEN RAISE EXCEPTION 'Domain changed; check ownership again' USING ERRCODE='23505';END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN('verified','missing','unavailable') THEN RAISE EXCEPTION 'Invalid DNS result' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_domains SET ownership_state=CASE WHEN p_outcome='verified' THEN 'verified' WHEN p_outcome='missing' AND verified_at IS NOT NULL THEN 'lost' WHEN p_outcome='missing' THEN 'pending' ELSE ownership_state END,
 verified_at=CASE WHEN p_outcome='verified' THEN clock_timestamp() ELSE verified_at END,
 verified_until=CASE WHEN p_outcome='verified' THEN clock_timestamp()+interval '24 hours' WHEN p_outcome='missing' THEN NULL ELSE verified_until END,
 last_checked_at=clock_timestamp(),last_check=p_outcome,verification_attempt=NULL,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=r.id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_domain_renewal(p_id uuid, p_lease uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; d public.redirect_domains;j public.redirect_domain_jobs;retry integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE domain_id=p_id FOR UPDATE;
 selected_workspace:=j.workspace_id;
 IF j.domain_id IS NULL OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR d.id IS NULL OR j.state<>'leased' OR j.lease IS DISTINCT FROM p_lease OR j.operation IS DISTINCT FROM p_operation OR j.lease_until<=clock_timestamp() OR NOT j.desired OR d.provider_id IS NULL OR d.disabled OR d.verified_at IS NULL OR d.verified_until>clock_timestamp()+interval '6 hours' THEN RETURN NULL;END IF;
 IF NOT redirect_internal.workspace_owner(j.workspace_id,j.requested_by) THEN RETURN NULL;END IF;
 IF d.next_check_at>clock_timestamp() THEN RETURN NULL;END IF;
 retry:=public.redirect_report_budget('domain-check-global',100,3600);
 IF retry=0 THEN retry:=public.redirect_report_budget('domain-check:'||j.requested_by::text,30,3600);END IF;
 IF retry>0 THEN RETURN NULL;END IF;
 UPDATE public.redirect_domains SET verification_attempt=gen_random_uuid(),next_check_at=clock_timestamp()+interval '1 minute' WHERE workspace_id=selected_workspace AND id=d.id RETURNING * INTO d;
 RETURN jsonb_build_object('actor',j.requested_by,'version',d.version,'attempt',to_jsonb(d.verification_attempt),'verification',jsonb_build_object('name','_qg-redirect.'||d.hostname,'value','qg-redirect='||d.verification_token));
END $function$;
REVOKE ALL ON FUNCTION public.finish_redirect_domain_renewal(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_redirect_domain_renewal(uuid,uuid,uuid,uuid,uuid,text) TO service_role;
