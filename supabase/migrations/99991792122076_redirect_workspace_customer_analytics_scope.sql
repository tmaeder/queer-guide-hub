-- Scope private customer identity/attribution and analytics to workspace roots.
-- Existing authenticated invoker RPCs stay legacy-only under current-role RLS;
-- they cannot select a tenant or execute the private service-context helper.
-- Global external-ID uniqueness, customer locks and tenant activation fences stay.

CREATE OR REPLACE FUNCTION public.redirect_customer_access(p_customer text, p_actor uuid, p_principal uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); allowed uuid[];ids uuid[];editable boolean;
BEGIN
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_customer IS NULL OR length(p_customer) NOT BETWEEN 1 AND 256 OR btrim(p_customer)='' OR p_customer ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a customer ID' USING ERRCODE='22023';END IF;
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'events:read');
  IF NOT EXISTS(SELECT FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 ELSIF NOT EXISTS(SELECT FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal) AND NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND user_id=p_actor AND active AND kind='user') THEN
  RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';
 END IF;
 allowed:=public.redirect_management_scope(p_principal,'events:read');
 PERFORM pg_advisory_xact_lock(hashtextextended('redirect-customer:'||p_customer,0));
 SELECT array_agg(DISTINCT redirect_id) INTO ids FROM (
  SELECT e.redirect_id FROM public.redirect_events e JOIN public.redirect_link_conversions c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id WHERE e.workspace_id=selected_workspace AND c.customer_key=p_customer
  UNION SELECT e.redirect_id FROM public.redirect_events e JOIN public.redirect_link_customers c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id WHERE e.workspace_id=selected_workspace AND c.customer_key=p_customer
 ) links;
 IF ids IS NULL OR(allowed IS NOT NULL AND NOT(ids&&allowed)) THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='P0002';END IF;
 SELECT coalesce(bool_and((allowed IS NULL OR id=ANY(allowed)) AND public.redirect_can_write_link(p_principal,id)),false) INTO editable FROM unnest(ids) AS id;
 IF p_write THEN
  allowed:=public.redirect_management_scope(p_principal,'links:write');
  IF NOT editable OR(allowed IS NOT NULL AND NOT(ids<@allowed)) THEN RAISE EXCEPTION 'Edit access to every customer link is required' USING ERRCODE='42501';END IF;
 END IF;
 RETURN editable;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_customer_profile(p_action text, p_customer text, p_actor uuid, p_principal uuid, p_values jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); profile public.redirect_customer_profiles;editable boolean;expected uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('get','patch','clear') THEN RAISE EXCEPTION 'Invalid customer action' USING ERRCODE='22023';END IF;
 editable:=public.redirect_customer_access(p_customer,p_actor,p_principal,p_action<>'get');
 IF p_action='get' THEN SELECT * INTO profile FROM public.redirect_customer_profiles WHERE workspace_id=selected_workspace AND customer_key=p_customer;
 ELSE
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR NOT(p_values?'version') OR p_values-ARRAY['version','name','email','avatarUrl']::text[]<>'{}' OR
    (p_values->'version'<>'null'::jsonb AND(jsonb_typeof(p_values->'version')<>'string' OR(p_values->>'version')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')) THEN RAISE EXCEPTION 'Provide current profile fields and version' USING ERRCODE='22023';END IF;
  IF p_action='clear' AND p_values-ARRAY['version']::text[]<>'{}' THEN RAISE EXCEPTION 'Clear accepts only version' USING ERRCODE='22023';END IF;
  IF p_action='patch' AND p_values-ARRAY['version']::text[]='{}' THEN RAISE EXCEPTION 'Provide profile changes' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT FROM jsonb_each(p_values-ARRAY['version']::text[]) WHERE value<>'null'::jsonb AND jsonb_typeof(value)<>'string') THEN RAISE EXCEPTION 'Profile fields must be strings or null' USING ERRCODE='22023';END IF;
  expected:=(p_values->>'version')::uuid;
  SELECT * INTO profile FROM public.redirect_customer_profiles WHERE workspace_id=selected_workspace AND customer_key=p_customer FOR UPDATE;
  IF profile.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Customer profile changed; reload before saving' USING ERRCODE='23505';END IF;
  IF profile.customer_key IS NULL THEN
   -- A removed original visit erases identity; explicit re-enrichment may anchor to a remaining recorded conversion.
   INSERT INTO public.redirect_link_customers(workspace_id,customer_key,click_id) SELECT selected_workspace,p_customer,click_id FROM public.redirect_link_conversions WHERE workspace_id=selected_workspace AND customer_key=p_customer ORDER BY occurred_at,id LIMIT 1 ON CONFLICT(customer_key) DO NOTHING;
   IF NOT EXISTS(SELECT FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=p_customer) THEN RAISE EXCEPTION 'Customer identity is unavailable in this workspace' USING ERRCODE='23505';END IF;
   INSERT INTO public.redirect_customer_profiles(workspace_id,customer_key) VALUES(selected_workspace,p_customer);
  END IF;
  UPDATE public.redirect_customer_profiles SET
   name=CASE WHEN p_action='clear' THEN NULL WHEN p_values?'name' THEN nullif(btrim(p_values->>'name'),'') ELSE name END,
   email=CASE WHEN p_action='clear' THEN NULL WHEN p_values?'email' THEN nullif(btrim(p_values->>'email'),'') ELSE email END,
   avatar_url=CASE WHEN p_action='clear' THEN NULL WHEN p_values?'avatarUrl' THEN nullif(btrim(p_values->>'avatarUrl'),'') ELSE avatar_url END,
   version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND customer_key=p_customer RETURNING * INTO profile;
 END IF;
 RETURN jsonb_build_object('customerExternalId',p_customer,'name',profile.name,'email',profile.email,'avatarUrl',profile.avatar_url,'version',profile.version,'updatedAt',profile.updated_at,'canEdit',editable);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_customer_events(p_customer text, p_actor uuid, p_principal uuid, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); allowed uuid[];result jsonb;
BEGIN
 PERFORM public.redirect_customer_access(p_customer,p_actor,p_principal,false);
 allowed:=public.redirect_management_scope(p_principal,'events:read');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR(p_after_at IS NULL)<>(p_after_id IS NULL) OR(p_after_id IS NOT NULL AND p_after_id!~*'^(click|conversion):[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'Invalid customer event page' USING ERRCODE='22023';END IF;
 WITH visits AS (
  SELECT DISTINCT click_id FROM public.redirect_link_conversions WHERE workspace_id=selected_workspace AND customer_key=p_customer
  UNION SELECT click_id FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=p_customer
 ), journey AS (
  SELECT 'click:'||e.click_id AS id,'click' AS kind,e.ts AS occurred_at,coalesce(e.path,'/go/'||r.slug,r.source_path) AS source,'Visit' AS event_name,NULL::text AS amount,NULL::text AS currency,e.click_id
  FROM visits v JOIN public.redirect_events e ON e.click_id=v.click_id JOIN public.redirects r ON r.workspace_id=e.workspace_id AND r.id=e.redirect_id WHERE e.workspace_id=selected_workspace AND(allowed IS NULL OR e.redirect_id=ANY(allowed))
  UNION ALL
  SELECT 'conversion:'||c.id,c.kind,c.occurred_at,coalesce(e.path,'/go/'||r.slug,r.source_path),c.event_name,c.amount::text,c.currency,c.click_id
  FROM public.redirect_link_conversions c JOIN public.redirect_events e ON e.workspace_id=c.workspace_id AND e.click_id=c.click_id JOIN public.redirects r ON r.workspace_id=e.workspace_id AND r.id=e.redirect_id
  WHERE c.workspace_id=selected_workspace AND c.customer_key=p_customer AND(allowed IS NULL OR e.redirect_id=ANY(allowed))
 ), page AS(SELECT * FROM journey WHERE p_after_at IS NULL OR(occurred_at,id)>(p_after_at,p_after_id) ORDER BY occurred_at,id LIMIT p_limit+1),
 shown AS(SELECT * FROM page ORDER BY occurred_at,id LIMIT p_limit)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(shown) ORDER BY occurred_at,id) FROM shown),'[]'::jsonb),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT jsonb_build_object('at',occurred_at,'id',id) FROM shown ORDER BY occurred_at DESC,id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_analytics_filtered(p_filters jsonb, p_allowed_ids uuid[] DEFAULT NULL::uuid[], p_snapshot timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF redirect_analytics_events
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid; links uuid[];start_at timestamptz;end_at timestamptz;folder uuid;tag uuid;
BEGIN
 IF current_user='service_role' THEN selected_workspace:=public.redirect_request_workspace();END IF;
 IF jsonb_typeof(p_filters)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_filters) AS keys(key) WHERE key<>ALL(ARRAY['linkIds','folderId','tagId','start','end','event','country','city','device','browser','os','domain','referrer','variant','excludeBots','qr','interval'])) THEN
  RAISE EXCEPTION 'Invalid analytics filters' USING ERRCODE='22023';
 END IF;
 IF p_filters ? 'linkIds' THEN SELECT array_agg(value::uuid) INTO links FROM jsonb_array_elements_text(p_filters->'linkIds'); IF links IS NULL THEN links:='{}'; END IF; END IF;
 start_at:=nullif(p_filters->>'start','')::timestamptz;end_at:=nullif(p_filters->>'end','')::timestamptz;
 folder:=nullif(p_filters->>'folderId','')::uuid;tag:=nullif(p_filters->>'tagId','')::uuid;
 IF start_at IS NOT NULL AND end_at IS NOT NULL AND start_at>=end_at THEN RAISE EXCEPTION 'Start must precede end' USING ERRCODE='22023'; END IF;
 IF p_filters->>'event' IS NOT NULL AND p_filters->>'event'<>ALL(ARRAY['all','click','lead','sale']) THEN RAISE EXCEPTION 'Invalid event type' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.* FROM public.redirect_analytics_events a
 WHERE EXISTS(SELECT FROM public.redirect_events scoped_visit WHERE scoped_visit.click_id=a.click_id AND scoped_visit.workspace_id=selected_workspace) AND (links IS NULL OR a.redirect_id=ANY(links)) AND (p_allowed_ids IS NULL OR a.redirect_id=ANY(p_allowed_ids))
 AND (start_at IS NULL OR a.occurred_at>=start_at) AND (end_at IS NULL OR a.occurred_at<end_at)
 AND (p_snapshot IS NULL OR a.received_at<=p_snapshot)
 AND (coalesce(p_filters->>'event','all')='all' OR a.kind=p_filters->>'event')
 AND (NOT coalesce((p_filters->>'excludeBots')::boolean,true) OR NOT a.is_bot)
 AND (p_filters->>'qr' IS NULL OR a.is_qr=(p_filters->>'qr')::boolean)
 AND (p_filters->>'country' IS NULL OR coalesce(a.country,'Unknown')=CASE WHEN upper(p_filters->>'country')='UNKNOWN' THEN 'Unknown' ELSE upper(p_filters->>'country') END)
 AND (p_filters->>'city' IS NULL OR a.city=p_filters->>'city')
 AND (p_filters->>'device' IS NULL OR a.device=p_filters->>'device')
 AND (p_filters->>'browser' IS NULL OR a.browser=p_filters->>'browser')
 AND (p_filters->>'os' IS NULL OR a.os=p_filters->>'os')
 AND (p_filters->>'domain' IS NULL OR a.domain=p_filters->>'domain')
 AND (p_filters->>'referrer' IS NULL OR a.referrer=p_filters->>'referrer')
 AND (p_filters->>'variant' IS NULL OR a.variant_id=p_filters->>'variant')
 AND (folder IS NULL OR EXISTS(SELECT FROM public.redirect_link_metadata m WHERE m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||a.redirect_id AND m.folder_id=folder))
 AND (tag IS NULL OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||a.redirect_id AND t.tag_id=tag));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_analytics_report(p_filters jsonb, p_allowed_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;grain text:=coalesce(p_filters->>'interval','day');snapshot timestamptz:=statement_timestamp();begin_at timestamptz;finish_at timestamptz;step interval;
BEGIN
 IF grain<>ALL(ARRAY['hour','day','week','month']) THEN RAISE EXCEPTION 'Invalid interval' USING ERRCODE='22023'; END IF;
 SELECT coalesce(nullif(p_filters->>'start','')::timestamptz,min(occurred_at),snapshot),coalesce(nullif(p_filters->>'end','')::timestamptz,snapshot) INTO begin_at,finish_at FROM public.redirect_analytics_filtered(p_filters,p_allowed_ids,snapshot);
 step:=('1 '||grain)::interval;
 IF extract(epoch FROM finish_at-begin_at)>(CASE grain WHEN 'hour' THEN 7200000 WHEN 'day' THEN 172800000 WHEN 'week' THEN 1209600000 ELSE 5184000000 END) THEN RAISE EXCEPTION 'Choose a larger interval for this date range' USING ERRCODE='22023'; END IF;
 WITH events AS MATERIALIZED (SELECT * FROM public.redirect_analytics_filtered(p_filters,p_allowed_ids,snapshot)),
 totals AS (SELECT count(*) FILTER(WHERE kind='click') AS clicks,count(*) FILTER(WHERE kind='lead') AS leads,count(*) FILTER(WHERE kind='sale') AS sales,count(DISTINCT customer_key) AS customers FROM events),
 revenue AS (SELECT currency,sum(amount::numeric)::text AS amount FROM events WHERE kind='sale' GROUP BY currency),
 buckets AS (SELECT date_trunc(grain,occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS at,
 count(*) FILTER(WHERE kind='click') AS clicks,count(*) FILTER(WHERE kind='lead') AS leads,count(*) FILTER(WHERE kind='sale') AS sales FROM events GROUP BY 1),
 series AS (
  SELECT g.at,coalesce(b.clicks,0) AS clicks,coalesce(b.leads,0) AS leads,coalesce(b.sales,0) AS sales
  FROM generate_series(date_trunc(grain,begin_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',date_trunc(grain,(finish_at-interval '1 microsecond') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',step) g(at)
  LEFT JOIN buckets b ON b.at=g.at
 ), dimensions AS (
  SELECT dimension,label,count(*) AS count FROM events CROSS JOIN LATERAL (VALUES
   ('country',coalesce(country,'Unknown')),('city',city),('region',region),('continent',continent),('domain',domain),('device',device),('browser',browser),('os',os),('referrer',referrer),('event',kind),('qr',CASE WHEN is_qr THEN 'QR' ELSE 'Link' END)
  ) d(dimension,label) GROUP BY dimension,label
 ), ranked AS (SELECT *,row_number() OVER(PARTITION BY dimension ORDER BY count DESC,label) AS n FROM dimensions),
 grouped AS (SELECT dimension,jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label) AS data FROM ranked WHERE n<=100 GROUP BY dimension)
 SELECT jsonb_build_object('snapshot',snapshot,'totals',to_jsonb(totals),'revenue',coalesce((SELECT jsonb_agg(to_jsonb(revenue) ORDER BY currency) FROM revenue),'[]'),
 'series',coalesce((SELECT jsonb_agg(to_jsonb(series) ORDER BY at) FROM series),'[]'),
 'breakdowns',coalesce((SELECT jsonb_object_agg(dimension,data) FROM grouped),'{}'),'interval',grain) INTO result FROM totals;
 IF jsonb_array_length(result->'series')>2000 THEN RAISE EXCEPTION 'Choose a larger interval for this date range' USING ERRCODE='22023'; END IF;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_analytics_page(p_filters jsonb, p_snapshot timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_allowed_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public'
AS $function$
 WITH events AS (SELECT * FROM public.redirect_analytics_filtered(p_filters,p_allowed_ids,coalesce(p_snapshot,statement_timestamp()))),
 page AS (SELECT * FROM events WHERE p_before_at IS NULL OR (received_at,id)<(p_before_at,p_before_id) ORDER BY received_at DESC,id DESC LIMIT greatest(1,least(p_limit,100))+1),
 shown AS (SELECT * FROM page ORDER BY received_at DESC,id DESC LIMIT greatest(1,least(p_limit,100)))
 SELECT jsonb_build_object('snapshot',coalesce(p_snapshot,statement_timestamp()),'data',coalesce((SELECT jsonb_agg(to_jsonb(shown) ORDER BY received_at DESC,id DESC) FROM shown),'[]'),
 'nextCursor',CASE WHEN (SELECT count(*) FROM page)>greatest(1,least(p_limit,100)) THEN (SELECT jsonb_build_object('at',received_at,'id',id) FROM shown ORDER BY received_at,id LIMIT 1) ELSE NULL END);
$function$;

CREATE OR REPLACE FUNCTION public.redirect_variant_performance(p_redirect_id uuid)
 RETURNS TABLE(id text, clicks bigint, leads bigint, sales bigint)
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';
BEGIN
 IF current_user='service_role' THEN selected_workspace:=public.redirect_request_workspace();END IF;
 RETURN QUERY
  SELECT e.variant_id,count(DISTINCT e.click_id),
    count(DISTINCT c.id) FILTER (WHERE c.kind='lead'),
    count(DISTINCT c.id) FILTER (WHERE c.kind='sale')
  FROM public.redirect_events e LEFT JOIN public.redirect_link_conversions c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id
  WHERE e.workspace_id=selected_workspace AND e.redirect_id=p_redirect_id AND e.variant_id IS NOT NULL GROUP BY e.variant_id;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_customer_journey(p_customer_key text, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';
BEGIN
 IF current_user='service_role' THEN selected_workspace:=public.redirect_request_workspace();END IF;
 RETURN (
 WITH visits AS (
  SELECT DISTINCT e.click_id FROM public.redirect_events e JOIN public.redirect_link_conversions c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id WHERE e.workspace_id=selected_workspace AND c.customer_key=p_customer_key
  UNION SELECT click_id FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=p_customer_key
 ), journey AS (
  SELECT 'click:'||e.click_id AS id,'click' AS kind,e.ts AS occurred_at,coalesce(e.path,'/go/'||r.slug,r.source_path) AS source,'Visit' AS event_name,NULL::text AS amount,NULL::text AS currency,e.click_id
  FROM visits v JOIN public.redirect_events e ON e.workspace_id=selected_workspace AND e.click_id=v.click_id JOIN public.redirects r ON r.workspace_id=e.workspace_id AND r.id=e.redirect_id
  UNION ALL
  SELECT 'conversion:'||c.id,c.kind,c.occurred_at,coalesce(e.path,'/go/'||r.slug,r.source_path),c.event_name,c.amount::text,c.currency,c.click_id
  FROM public.redirect_link_conversions c JOIN public.redirect_events e ON e.workspace_id=c.workspace_id AND e.click_id=c.click_id JOIN public.redirects r ON r.workspace_id=e.workspace_id AND r.id=e.redirect_id
  WHERE c.workspace_id=selected_workspace AND c.customer_key=p_customer_key
 ), page AS (
  SELECT * FROM journey WHERE p_after_at IS NULL OR (occurred_at,id)>(p_after_at,p_after_id)
  ORDER BY occurred_at,id LIMIT greatest(1,least(p_limit,100))+1
 ), shown AS (
  SELECT * FROM page ORDER BY occurred_at,id LIMIT greatest(1,least(p_limit,100))
 )
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(shown) ORDER BY occurred_at,id) FROM shown),'[]'::jsonb),
  'nextCursor',CASE WHEN (SELECT count(*) FROM page)>greatest(1,least(p_limit,100)) THEN
   (SELECT jsonb_build_object('at',occurred_at,'id',id) FROM shown ORDER BY occurred_at DESC,id DESC LIMIT 1) ELSE NULL END));
END $function$;

CREATE OR REPLACE FUNCTION public.record_redirect_conversion(p_event jsonb, p_token_id uuid DEFAULT NULL::uuid, p_registered_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();
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
 -- Native signups have separate verified-account/timing checks. Manual account
 -- conversions must recheck current owner state at the write boundary.
 IF p_token_id IS NULL AND p_registered_at IS NULL THEN PERFORM public.redirect_management_scope(NULL,'conversions:write');END IF;
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
 IF p_token_id IS NOT NULL AND NOT(visit.redirect_id=ANY(coalesce(public.redirect_management_scope(p_token_id,'conversions:write'),ARRAY[visit.redirect_id]))) THEN
  RAISE EXCEPTION 'Credential cannot attribute this link' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT FROM public.redirect_link_customers WHERE customer_key=customer AND workspace_id<>selected_workspace) THEN RAISE EXCEPTION 'Customer identity is unavailable in this workspace' USING ERRCODE='23505';END IF;
 INSERT INTO public.redirect_link_conversions(workspace_id,click_id,kind,amount,currency,customer_key,provider_event_id,metadata,event_name,occurred_at)
 VALUES(selected_workspace,event_click,event_kind,event_amount,event_currency,customer,event_key,coalesce(p_event->'metadata','{}'),p_event->>'eventName',event_time)
 ON CONFLICT(provider_event_id) DO NOTHING RETURNING id INTO inserted;
 SELECT * INTO saved FROM public.redirect_link_conversions WHERE workspace_id=selected_workspace AND provider_event_id=event_key;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Event ID is unavailable in this workspace' USING ERRCODE='23505';END IF;
 IF inserted IS NULL AND (saved.click_id IS DISTINCT FROM event_click OR saved.kind IS DISTINCT FROM event_kind
  OR saved.amount IS DISTINCT FROM event_amount OR saved.currency IS DISTINCT FROM event_currency
  OR saved.customer_key IS DISTINCT FROM customer OR saved.event_name IS DISTINCT FROM (p_event->>'eventName')
  OR saved.metadata IS DISTINCT FROM coalesce(p_event->'metadata','{}')
  OR (p_event ? 'occurredAt' AND saved.occurred_at IS DISTINCT FROM event_time)) THEN
  RAISE EXCEPTION 'Event ID was already used with different data' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.redirect_link_customers(workspace_id,customer_key,click_id) VALUES(selected_workspace,customer,event_click) ON CONFLICT(customer_key) DO NOTHING;
 IF NOT EXISTS(SELECT FROM public.redirect_link_customers WHERE workspace_id=selected_workspace AND customer_key=customer) THEN RAISE EXCEPTION 'Customer identity is unavailable in this workspace' USING ERRCODE='23505';END IF;
 RETURN jsonb_build_object('id',saved.id,'clickId',saved.click_id,'kind',saved.kind,'duplicate',inserted IS NULL);
END $function$;
