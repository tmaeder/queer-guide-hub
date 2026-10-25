-- Internal webhook dispatch uses saved subscription/delivery workspace identity.
-- Claims/preparation require active workspace and current authorizing owner;
-- completion records the exact leased attempt even after access/status changes.
CREATE OR REPLACE FUNCTION public.claim_redirect_webhook_deliveries(p_limit integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; w public.redirect_webhooks;d public.redirect_webhook_deliveries;result jsonb:='[]';at_time timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid dispatch batch' USING ERRCODE='22023';END IF;
 -- Recover bounded expired leases; a crashed sender is an unknown receipt, not success.
 FOR d IN SELECT * FROM public.redirect_webhook_deliveries WHERE state='leased' AND lease_until<=at_time ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  selected_workspace:=d.workspace_id;
  UPDATE public.redirect_webhook_attempts SET finished_at=at_time,error_code='lease_expired' WHERE workspace_id=selected_workspace AND lease=d.lease AND finished_at IS NULL;
  UPDATE public.redirect_webhook_deliveries SET state=CASE WHEN cycle_attempts>=8 THEN 'failed' ELSE 'retry' END,lease=NULL,lease_until=NULL,next_attempt_at=at_time,error_code='lease_expired',finished_at=CASE WHEN cycle_attempts>=8 THEN at_time ELSE NULL END,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;
 END LOOP;
 FOR w IN SELECT s.* FROM public.redirect_webhooks s WHERE EXISTS(SELECT FROM public.redirect_workspaces active_workspace WHERE active_workspace.id=s.workspace_id AND active_workspace.status='active') AND s.deleted_at IS NULL
  AND redirect_internal.workspace_owner(s.workspace_id,s.created_by)
  AND EXISTS(SELECT FROM public.redirect_webhook_deliveries q JOIN public.redirect_webhook_events e ON e.workspace_id=q.workspace_id AND e.id=q.event_id WHERE q.workspace_id=s.workspace_id AND q.webhook_id=s.id AND q.state IN('queued','retry') AND q.next_attempt_at<=at_time AND(s.enabled OR e.type='webhook.test'))
  AND NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries q WHERE q.workspace_id=s.workspace_id AND q.webhook_id=s.id AND q.state='leased' AND q.lease_until>at_time)
  ORDER BY s.last_claimed_at,s.id LIMIT p_limit FOR UPDATE OF s SKIP LOCKED LOOP
  selected_workspace:=w.workspace_id;
  SELECT q.* INTO d FROM public.redirect_webhook_deliveries q JOIN public.redirect_webhook_events e ON e.workspace_id=q.workspace_id AND e.id=q.event_id
   WHERE q.workspace_id=selected_workspace AND q.webhook_id=w.id AND q.state IN('queued','retry') AND q.next_attempt_at<=at_time AND(w.enabled OR e.type='webhook.test') ORDER BY q.sequence LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
  IF d.id IS NULL THEN CONTINUE;END IF;
  IF d.routing_version<>w.routing_version THEN UPDATE public.redirect_webhook_deliveries SET state='cancelled',error_code='settings_changed',finished_at=at_time,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;CONTINUE;END IF;
  UPDATE public.redirect_webhook_deliveries SET state='leased',lease=gen_random_uuid(),lease_until=at_time+interval '2 minutes',attempts=attempts+1,cycle_attempts=cycle_attempts+1,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id RETURNING * INTO d;
  INSERT INTO public.redirect_webhook_attempts(workspace_id,delivery_id,number,lease) VALUES(selected_workspace,d.id,d.attempts,d.lease);
  UPDATE public.redirect_webhooks SET last_claimed_at=at_time WHERE workspace_id=selected_workspace AND id=w.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease',d.lease,'url',w.url));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_webhook_delivery(p_id uuid, p_lease uuid, p_status integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_excerpt text DEFAULT ''::text, p_duration integer DEFAULT NULL::integer, p_retry_after integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; d public.redirect_webhook_deliveries;w public.redirect_webhooks;success boolean;current_scope boolean;wait_seconds integer;at_time timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF(p_status IS NOT NULL AND p_status NOT BETWEEN 100 AND 599) OR p_duration IS NULL OR p_duration NOT BETWEEN 0 AND 60000 OR p_excerpt IS NULL OR octet_length(p_excerpt)>4096 OR(p_retry_after IS NOT NULL AND p_retry_after NOT BETWEEN 1 AND 86400) OR(p_error IS NOT NULL AND p_error NOT IN('dns_blocked','dns_unavailable','tls_error','network_error','timeout','invalid_response','http_error','scope_changed')) THEN RAISE EXCEPTION 'Invalid delivery receipt' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.redirect_webhook_deliveries WHERE id=p_id AND lease=p_lease AND state='leased' AND lease_until>at_time FOR UPDATE;
 selected_workspace:=d.workspace_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery lease changed' USING ERRCODE='P0002';END IF;
 SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=d.webhook_id;
 current_scope:=EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') AND w.id IS NOT NULL AND w.deleted_at IS NULL AND w.routing_version=d.routing_version AND(w.enabled OR EXISTS(SELECT FROM public.redirect_webhook_events WHERE workspace_id=selected_workspace AND id=d.event_id AND type='webhook.test')) AND redirect_internal.workspace_owner(w.workspace_id,w.created_by);
 success:=p_status BETWEEN 200 AND 299 AND p_error IS NULL;
 wait_seconds:=greatest(least(3600,30*(2^greatest(0,d.cycle_attempts-1))::integer),coalesce(p_retry_after,0));
 UPDATE public.redirect_webhook_attempts SET finished_at=at_time,http_status=p_status,error_code=p_error,response_excerpt=p_excerpt,duration_ms=p_duration WHERE workspace_id=selected_workspace AND lease=p_lease AND finished_at IS NULL;
 UPDATE public.redirect_webhook_deliveries SET state=CASE WHEN NOT current_scope THEN 'cancelled' WHEN success THEN 'delivered' WHEN cycle_attempts>=8 THEN 'failed' ELSE 'retry' END,
  http_status=p_status,error_code=CASE WHEN NOT current_scope THEN 'scope_changed' ELSE p_error END,response_excerpt=p_excerpt,next_attempt_at=at_time+make_interval(secs=>wait_seconds),finished_at=CASE WHEN NOT current_scope OR success OR cycle_attempts>=8 THEN at_time ELSE NULL END,lease=NULL,lease_until=NULL,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;
 RETURN redirect_internal.webhook_delivery_for_workspace(selected_workspace,d.id);
END $function$;

CREATE OR REPLACE FUNCTION public.prepare_redirect_webhook_delivery(p_id uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; d public.redirect_webhook_deliveries;w public.redirect_webhooks;type text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO d FROM public.redirect_webhook_deliveries WHERE id=p_id AND lease=p_lease AND state='leased' AND lease_until>clock_timestamp();
 selected_workspace:=d.workspace_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery lease changed' USING ERRCODE='P0002';END IF;
 SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=d.webhook_id;
 SELECT e.type INTO type FROM public.redirect_webhook_events e WHERE e.workspace_id=selected_workspace AND e.id=d.event_id;
 IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') OR w.id IS NULL OR w.deleted_at IS NOT NULL OR(NOT w.enabled AND type<>'webhook.test') OR w.routing_version<>d.routing_version OR NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by) THEN RAISE EXCEPTION 'Webhook access changed' USING ERRCODE='42501';END IF;
 UPDATE public.redirect_webhook_attempts SET key_version=w.key_version WHERE workspace_id=selected_workspace AND lease=p_lease AND finished_at IS NULL;
 RETURN jsonb_build_object('id',d.id,'eventId',d.event_id,'body',d.body,'url',w.url,'secret',w.secret,'keyVersion',w.key_version,'previousSecret',CASE WHEN w.previous_expires_at>clock_timestamp() THEN w.previous_secret ELSE NULL END,'previousKeyVersion',CASE WHEN w.previous_expires_at>clock_timestamp() THEN w.previous_key_version ELSE NULL END);
END $function$;

CREATE OR REPLACE FUNCTION redirect_internal.webhook_delivery_for_workspace(p_workspace uuid, p_id uuid, p_details boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',d.id,'sequence',d.sequence::text,'webhookId',d.webhook_id,'eventId',d.event_id,'eventType',e.type,'version',d.version,'state',d.state,'attempts',d.attempts,'cycleAttempts',d.cycle_attempts,'replays',d.replays,'createdAt',d.created_at,'finishedAt',d.finished_at,'nextAttemptAt',d.next_attempt_at,'httpStatus',d.http_status,'errorCode',d.error_code)
 ||CASE WHEN p_details THEN jsonb_build_object('body',d.body,'responseExcerpt',d.response_excerpt,'recentAttempts',coalesce((SELECT jsonb_agg(to_jsonb(shown) ORDER BY number DESC) FROM(SELECT id::text,number,key_version AS "keyVersion",started_at AS "startedAt",finished_at AS "finishedAt",http_status AS "httpStatus",error_code AS "errorCode",response_excerpt AS "responseExcerpt",duration_ms AS "durationMs" FROM public.redirect_webhook_attempts WHERE workspace_id=d.workspace_id AND delivery_id=d.id ORDER BY number DESC LIMIT 100) shown),'[]'::jsonb)) ELSE '{}'::jsonb END
 FROM public.redirect_webhook_deliveries d JOIN public.redirect_webhook_events e ON e.workspace_id=d.workspace_id AND e.id=d.event_id WHERE d.workspace_id=p_workspace AND d.id=p_id
$function$;
REVOKE ALL ON FUNCTION redirect_internal.webhook_delivery_for_workspace(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.webhook_delivery_for_workspace(uuid,uuid,boolean) TO service_role;

-- Retention includes inactive workspaces but never cancels an unexpired
-- in-flight lease: its sender must still be able to record the external receipt.
CREATE OR REPLACE FUNCTION public.prune_redirect_webhooks(p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE histories integer;events integer;secrets integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid cleanup batch' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_webhooks w SET previous_secret=NULL,previous_key_version=NULL,previous_expires_at=NULL
 FROM(SELECT workspace_id,id FROM public.redirect_webhooks WHERE previous_expires_at<=clock_timestamp() ORDER BY previous_expires_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED) old
 WHERE w.workspace_id=old.workspace_id AND w.id=old.id;
 GET DIAGNOSTICS secrets=ROW_COUNT;
 WITH doomed AS MATERIALIZED(
  SELECT d.workspace_id,d.id FROM public.redirect_webhook_deliveries d JOIN public.redirect_webhooks w ON w.workspace_id=d.workspace_id AND w.id=d.webhook_id
  WHERE (d.state IN('queued','retry') OR d.state='leased' AND d.lease_until<=clock_timestamp()) AND NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by)
  ORDER BY d.sequence LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
 ), attempts AS(
  UPDATE public.redirect_webhook_attempts a SET finished_at=clock_timestamp(),error_code='scope_changed'
  FROM doomed WHERE a.workspace_id=doomed.workspace_id AND a.delivery_id=doomed.id AND a.finished_at IS NULL
 )
 UPDATE public.redirect_webhook_deliveries d SET state='cancelled',lease=NULL,lease_until=NULL,finished_at=clock_timestamp(),error_code='scope_changed',version=gen_random_uuid()
 FROM doomed WHERE d.workspace_id=doomed.workspace_id AND d.id=doomed.id;
 DELETE FROM public.redirect_webhook_deliveries d USING(
  SELECT workspace_id,id FROM public.redirect_webhook_deliveries WHERE finished_at<clock_timestamp()-interval '30 days' AND state IN('delivered','failed','cancelled') ORDER BY finished_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED
 ) old WHERE d.workspace_id=old.workspace_id AND d.id=old.id;
 GET DIAGNOSTICS histories=ROW_COUNT;
 DELETE FROM public.redirect_webhook_events e USING(
  SELECT v.workspace_id,v.id FROM public.redirect_webhook_events v WHERE v.created_at<clock_timestamp()-interval '30 days'
  AND NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries d WHERE d.workspace_id=v.workspace_id AND d.event_id=v.id)
  ORDER BY v.created_at,v.id LIMIT p_limit FOR UPDATE OF v SKIP LOCKED
 ) old WHERE e.workspace_id=old.workspace_id AND e.id=old.id;
 GET DIAGNOSTICS events=ROW_COUNT;
 DELETE FROM public.redirect_webhook_budgets b USING(
  SELECT workspace_id,bucket FROM public.redirect_webhook_budgets WHERE window_at<clock_timestamp()-interval '2 days' ORDER BY window_at,bucket LIMIT p_limit FOR UPDATE SKIP LOCKED
 ) old WHERE b.workspace_id=old.workspace_id AND b.bucket=old.bucket;
 RETURN jsonb_build_object('deliveries',histories,'events',events,'secrets',secrets);
END $$;

-- Settings changes deny new preparation through routing_version; retain an
-- unexpired lease so an already-started request can close its exact receipt.
CREATE OR REPLACE FUNCTION public.redirect_webhook_resource(p_action text, p_actor uuid, p_principal uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_secret text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid, p_archived boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); actor uuid;w public.redirect_webhooks;before_value public.redirect_webhooks;v_values jsonb:=p_values;types text[];ids uuid[];count_rows integer;result jsonb;retry integer;event uuid;changed boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','get','create','patch','archive','rotate','test') THEN RAISE EXCEPTION 'Invalid webhook action' USING ERRCODE='22023';END IF;
 actor:=public.redirect_webhook_actor(p_actor,p_principal,p_action NOT IN('list','get'));
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid webhook page' USING ERRCODE='22023';END IF;
  WITH all_rows AS(SELECT id FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND(p_archived OR deleted_at IS NULL)),page AS(SELECT id FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT id FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(public.redirect_webhook_json(id) ORDER BY id) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT max(id::text) FROM shown) ELSE NULL END) INTO result;RETURN result;
 END IF;
 IF p_action<>'create' THEN SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;IF w.id IS NULL THEN RAISE EXCEPTION 'Webhook not found' USING ERRCODE='P0002';END IF;END IF;
 IF p_action='get' THEN RETURN public.redirect_webhook_json(w.id);END IF;
 IF v_values IS NULL OR jsonb_typeof(v_values)<>'object' THEN RAISE EXCEPTION 'Provide webhook fields' USING ERRCODE='22023';END IF;
 IF p_action<>'create' AND (NOT(v_values?'version') OR w.version IS DISTINCT FROM(v_values->>'version')::uuid) THEN RAISE EXCEPTION 'Webhook changed; reload before saving' USING ERRCODE='23505';END IF;
 IF p_action IN('archive','rotate','test') AND v_values-ARRAY['version']::text[]<>'{}' THEN RAISE EXCEPTION 'Provide only the current version' USING ERRCODE='22023';END IF;
 IF p_action='test' THEN
  IF w.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Restore webhook before testing' USING ERRCODE='22023';END IF;
  retry:=public.redirect_webhook_budget('test:'||actor,30,3600);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
  event:=public.redirect_webhook_enqueue('webhook.test',NULL,'test:'||gen_random_uuid(),jsonb_build_object('message','Test delivery from Redirects'),w.id);
  SELECT jsonb_build_object('eventId',event,'deliveryId',id,'queued',true) INTO result FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND webhook_id=w.id AND event_id=event;RETURN result;
 ELSIF p_action='rotate' THEN
  IF w.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Restore webhook before rotating' USING ERRCODE='22023';END IF;
  IF p_secret IS NULL OR p_secret!~'^whsec_[A-Za-z0-9+/]{43}=$' THEN RAISE EXCEPTION 'Invalid signing secret' USING ERRCODE='22023';END IF;
  retry:=public.redirect_webhook_budget('rotate:'||actor,10,3600);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
  UPDATE public.redirect_webhooks SET previous_secret=secret,previous_key_version=key_version,previous_expires_at=clock_timestamp()+interval '24 hours',secret=p_secret,key_version=gen_random_uuid(),version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=w.id;
  RETURN public.redirect_webhook_json(w.id)||jsonb_build_object('secret',p_secret);
 ELSIF p_action='archive' THEN
  UPDATE public.redirect_webhooks SET enabled=false,deleted_at=coalesce(deleted_at,clock_timestamp()),version=gen_random_uuid(),routing_version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=w.id;
 ELSE
  IF v_values-ARRAY['version','name','url','eventTypes','linkIds','includeCustomerId','enabled','restore']::text[]<>'{}' OR(p_action='create' AND(v_values?'version' OR v_values?'restore')) OR(p_action='patch' AND v_values-ARRAY['version']::text[]='{}') THEN RAISE EXCEPTION 'Invalid webhook fields' USING ERRCODE='22023';END IF;
  IF(p_action='create' OR v_values?'name') AND(jsonb_typeof(v_values->'name') IS DISTINCT FROM 'string' OR btrim(v_values->>'name')='' OR length(btrim(v_values->>'name'))>100) THEN RAISE EXCEPTION 'Name must be 1–100 characters' USING ERRCODE='22023';END IF;
  IF(p_action='create' OR v_values?'url') AND(jsonb_typeof(v_values->'url')<>'string' OR v_values->>'url' IS NULL) THEN RAISE EXCEPTION 'Provide an HTTPS endpoint' USING ERRCODE='22023';END IF;
  IF v_values?'eventTypes' THEN
   IF jsonb_typeof(v_values->'eventTypes')<>'array' THEN RAISE EXCEPTION 'Choose event types' USING ERRCODE='22023';END IF;
   SELECT array_agg(DISTINCT value) INTO types FROM jsonb_array_elements_text(v_values->'eventTypes');
   IF types IS NULL OR cardinality(types)>6 OR NOT(types<@ARRAY['link.created','link.updated','link.deleted','link.clicked','lead.created','sale.created']::text[]) THEN RAISE EXCEPTION 'Choose supported event types' USING ERRCODE='22023';END IF;
  END IF;
  IF v_values?'linkIds' AND v_values->'linkIds'<>'null'::jsonb THEN
   IF jsonb_typeof(v_values->'linkIds')<>'array' THEN RAISE EXCEPTION 'Choose managed links or all links' USING ERRCODE='22023';END IF;
   SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(v_values->'linkIds');
   IF ids IS NULL OR cardinality(ids)>1000 OR cardinality(ids)<>(SELECT count(*) FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(ids) AND type='SHORT') THEN RAISE EXCEPTION 'Choose existing managed links' USING ERRCODE='22023';END IF;
  END IF;
  IF EXISTS(SELECT FROM jsonb_each(v_values) WHERE key IN('enabled','includeCustomerId','restore') AND jsonb_typeof(value)<>'boolean') THEN RAISE EXCEPTION 'Invalid webhook option' USING ERRCODE='22023';END IF;
  IF p_action='create' THEN
   IF p_secret IS NULL OR p_secret!~'^whsec_[A-Za-z0-9+/]{43}=$' THEN RAISE EXCEPTION 'Invalid signing secret' USING ERRCODE='22023';END IF;
   IF(SELECT count(*) FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND deleted_at IS NULL)>=100 OR(SELECT count(*) FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND created_by=actor AND deleted_at IS NULL)>=20 THEN RETURN jsonb_build_object('retryAfter',3600);END IF;
   retry:=public.redirect_webhook_budget('create:'||actor,60,3600);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
   INSERT INTO public.redirect_webhooks(workspace_id,created_by,name,url,event_types,link_ids,include_customer_id,enabled,secret) VALUES(selected_workspace,actor,btrim(v_values->>'name'),v_values->>'url',coalesce(types,ARRAY['link.clicked','lead.created','sale.created']),ids,coalesce((v_values->>'includeCustomerId')::boolean,false),coalesce((v_values->>'enabled')::boolean,true),p_secret) RETURNING * INTO w;
   RETURN public.redirect_webhook_json(w.id)||jsonb_build_object('secret',p_secret);
  END IF;
  IF w.deleted_at IS NOT NULL AND NOT coalesce((v_values->>'restore')::boolean,false) THEN RAISE EXCEPTION 'Restore the archived webhook before editing' USING ERRCODE='22023';END IF;
  IF w.deleted_at IS NOT NULL AND((SELECT count(*) FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND deleted_at IS NULL)>=100 OR(SELECT count(*) FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND created_by=w.created_by AND deleted_at IS NULL)>=20) THEN RETURN jsonb_build_object('retryAfter',3600);END IF;
  before_value:=w;
  UPDATE public.redirect_webhooks SET name=CASE WHEN v_values?'name' THEN btrim(v_values->>'name') ELSE name END,url=CASE WHEN v_values?'url' THEN v_values->>'url' ELSE url END,event_types=coalesce(types,event_types),link_ids=CASE WHEN v_values?'linkIds' THEN ids ELSE link_ids END,include_customer_id=coalesce((v_values->>'includeCustomerId')::boolean,include_customer_id),enabled=coalesce((v_values->>'enabled')::boolean,enabled),deleted_at=CASE WHEN coalesce((v_values->>'restore')::boolean,false) THEN NULL ELSE deleted_at END,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=w.id RETURNING * INTO w;
  changed:=jsonb_build_array(w.url,w.event_types,w.link_ids,w.include_customer_id,w.enabled,w.deleted_at) IS DISTINCT FROM jsonb_build_array(before_value.url,before_value.event_types,before_value.link_ids,before_value.include_customer_id,before_value.enabled,before_value.deleted_at);
  IF changed THEN UPDATE public.redirect_webhooks SET routing_version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=w.id;END IF;
  IF NOT changed THEN RETURN public.redirect_webhook_json(w.id);END IF;
 END IF;
 UPDATE public.redirect_webhook_attempts SET finished_at=clock_timestamp(),error_code='settings_changed' WHERE workspace_id=selected_workspace AND finished_at IS NULL AND delivery_id IN(SELECT id FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND webhook_id=w.id AND state='leased' AND lease_until<=clock_timestamp());
 UPDATE public.redirect_webhook_deliveries SET state='cancelled',lease=NULL,lease_until=NULL,error_code='settings_changed',finished_at=clock_timestamp(),version=gen_random_uuid() WHERE workspace_id=selected_workspace AND webhook_id=w.id AND(state IN('queued','retry') OR state='leased' AND lease_until<=clock_timestamp());
 RETURN public.redirect_webhook_json(w.id);
END $function$;
