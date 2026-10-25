-- Native signup attribution follows its globally unique recorded click. The
-- private conversion helper keeps an explicit active workspace and principal
-- checks; ordinary account/key conversion wrappers retain request selection.
CREATE OR REPLACE FUNCTION redirect_internal.record_conversion_for_workspace(p_workspace uuid, p_event jsonb, p_token_id uuid DEFAULT NULL::uuid, p_registered_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid:=p_workspace;session_actor uuid;
 visit public.redirect_events; token public.redirect_api_tokens; saved public.redirect_link_conversions;
 event_click uuid := nullif(p_event->>'clickId','')::uuid;
 customer text := nullif(p_event->>'customerExternalId','');
 event_kind text := p_event->>'kind'; event_key text := p_event->>'eventId';
 event_amount numeric := nullif(p_event->>'amount','')::numeric;
 event_currency text := nullif(p_event->>'currency','');
 event_time timestamptz := coalesce(nullif(p_event->>'occurredAt','')::timestamptz,now());
 inserted uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF selected_workspace IS NULL OR NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RAISE EXCEPTION 'Active workspace required' USING ERRCODE='42501';END IF;
 -- Native signups have separate verified-account/timing checks. Manual account
 -- conversions must recheck current owner state at the write boundary.
 IF p_token_id IS NULL AND p_registered_at IS NULL THEN
  session_actor:=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-qg-redirect-session-actor','')::uuid;
  PERFORM redirect_internal.principal_link_scope(selected_workspace,NULL,'conversions:write',session_actor,true);
 END IF;
 IF event_kind IS NULL OR event_kind NOT IN ('lead','sale') OR customer IS NULL OR length(customer)>256
 OR event_key IS NULL OR length(event_key) NOT BETWEEN 1 AND 256
 OR coalesce(length(p_event->>'eventName'),0) NOT BETWEEN 1 AND 120
 OR jsonb_typeof(coalesce(p_event->'metadata','{}')) <> 'object'
 OR length(coalesce(p_event->'metadata','{}')::text)>8192
 OR event_time>now()+interval '5 minutes'
 OR (event_kind='lead' AND (event_amount IS NOT NULL OR event_currency IS NOT NULL))
 OR (event_kind='sale' AND (event_amount IS NULL OR event_amount<0 OR event_amount>=1e12 OR event_amount<>round(event_amount,6) OR event_amount::text IN ('NaN','Infinity','-Infinity') OR event_currency IS NULL OR event_currency !~ '^[A-Z]{3}$'))
 THEN RAISE EXCEPTION 'Invalid conversion event' USING ERRCODE='22023'; END IF;
 IF event_click IS NULL THEN SELECT click_id INTO event_click FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=customer; END IF;
 SELECT * INTO visit FROM public.redirect_events WHERE workspace_id=selected_workspace AND click_id=event_click;
 IF visit.id IS NULL THEN RAISE EXCEPTION 'Attributed click not found' USING ERRCODE='P0002'; END IF;
 IF event_time<visit.ts THEN RAISE EXCEPTION 'Conversion precedes click' USING ERRCODE='22023'; END IF;
 IF p_registered_at IS NOT NULL AND (event_kind<>'lead' OR visit.ts>p_registered_at OR visit.ts<p_registered_at-interval '30 days') THEN
  RAISE EXCEPTION 'Signup is not attributable to this click' USING ERRCODE='22023';
 END IF;
 IF p_token_id IS NOT NULL AND NOT(visit.redirect_id=ANY(coalesce(redirect_internal.principal_link_scope(selected_workspace,p_token_id,'conversions:write'),ARRAY[visit.redirect_id]))) THEN
  RAISE EXCEPTION 'Credential cannot attribute this link' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.redirect_link_conversions(workspace_id,click_id,kind,amount,currency,customer_key,provider_event_id,metadata,event_name,occurred_at)
 VALUES(selected_workspace,event_click,event_kind,event_amount,event_currency,customer,event_key,coalesce(p_event->'metadata','{}'),p_event->>'eventName',event_time)
 ON CONFLICT(workspace_id,provider_event_id) DO NOTHING RETURNING id INTO inserted;
 SELECT * INTO saved FROM public.redirect_link_conversions WHERE workspace_id=selected_workspace AND provider_event_id=event_key;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Event ID is unavailable in this workspace' USING ERRCODE='23505';END IF;
 IF inserted IS NULL AND (saved.click_id IS DISTINCT FROM event_click OR saved.kind IS DISTINCT FROM event_kind
  OR saved.amount IS DISTINCT FROM event_amount OR saved.currency IS DISTINCT FROM event_currency
  OR saved.customer_key IS DISTINCT FROM customer OR saved.event_name IS DISTINCT FROM (p_event->>'eventName')
  OR saved.metadata IS DISTINCT FROM coalesce(p_event->'metadata','{}')
  OR (p_event ? 'occurredAt' AND saved.occurred_at IS DISTINCT FROM event_time)) THEN
  RAISE EXCEPTION 'Event ID was already used with different data' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.redirect_link_customers(workspace_id,customer_key,click_id) VALUES(selected_workspace,customer,event_click) ON CONFLICT(workspace_id,customer_key) DO NOTHING;
 IF NOT EXISTS(SELECT FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=customer) THEN RAISE EXCEPTION 'Customer identity is unavailable in this workspace' USING ERRCODE='23505';END IF;
 RETURN jsonb_build_object('id',saved.id,'clickId',saved.click_id,'kind',saved.kind,'duplicate',inserted IS NULL);
END $function$;
CREATE OR REPLACE FUNCTION public.record_redirect_conversion(p_event jsonb,p_token_id uuid DEFAULT NULL,p_registered_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT redirect_internal.record_conversion_for_workspace(public.redirect_request_workspace(),p_event,p_token_id,p_registered_at)
$$;
CREATE FUNCTION redirect_internal.registered_account_created_at(p_user uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT created_at FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL
$$;
CREATE FUNCTION public.record_redirect_signup(p_user uuid,p_click uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE registered_at timestamptz;source_workspace uuid;actor uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_user IS NULL OR p_click IS NULL THEN RAISE EXCEPTION 'Choose a registered account and recorded click' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 actor:=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-qg-redirect-session-actor','')::uuid;
 IF actor IS NOT NULL AND actor<>p_user THEN RAISE EXCEPTION 'Registration actor does not match the authenticated account' USING ERRCODE='42501';END IF;
 registered_at:=redirect_internal.registered_account_created_at(p_user);
 IF registered_at IS NULL OR NOT isfinite(registered_at) THEN RAISE EXCEPTION 'A verified registered account is required' USING ERRCODE='42501';END IF;
 SELECT v.workspace_id INTO source_workspace FROM public.redirect_events v JOIN public.redirect_workspaces w ON w.id=v.workspace_id AND w.status='active' WHERE v.click_id=p_click FOR SHARE OF v,w;
 IF source_workspace IS NULL THEN RAISE EXCEPTION 'Attributed click unavailable' USING ERRCODE='P0002';END IF;
 RETURN redirect_internal.record_conversion_for_workspace(source_workspace,jsonb_build_object('kind','lead','clickId',p_click,'customerExternalId','native:'||p_user,'eventId','native:signup:'||p_user,'eventName','Sign up','occurredAt',registered_at),NULL,registered_at);
END $$;
REVOKE ALL ON FUNCTION redirect_internal.record_conversion_for_workspace(uuid,jsonb,uuid,timestamptz),redirect_internal.registered_account_created_at(uuid),public.record_redirect_signup(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.record_conversion_for_workspace(uuid,jsonb,uuid,timestamptz),redirect_internal.registered_account_created_at(uuid),public.record_redirect_signup(uuid,uuid) TO service_role;
