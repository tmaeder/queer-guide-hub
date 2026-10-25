-- Public report authority and analytics use the published resource workspace.
-- The existing authenticated analytics functions retain their legacy RLS path.
-- These service-only helpers intentionally mirror that aggregation contract;
-- public report fixtures exercise filters/dates/conversions on this path too.
-- No public tenant lookup, activation fence, or authenticated grant changes.
CREATE FUNCTION redirect_internal.analytics_filtered_for_workspace(p_workspace uuid, p_filters jsonb, p_allowed_ids uuid[] DEFAULT NULL::uuid[], p_snapshot timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF redirect_analytics_events
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE selected_workspace uuid:=p_workspace; links uuid[];start_at timestamptz;end_at timestamptz;folder uuid;tag uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF NOT EXISTS(SELECT FROM public.redirect_workspaces WHERE id=selected_workspace AND status='active') THEN RAISE EXCEPTION 'Active workspace required' USING ERRCODE='42501';END IF;
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
END $function$
;
CREATE FUNCTION redirect_internal.analytics_report_for_workspace(p_workspace uuid, p_filters jsonb, p_allowed_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;grain text:=coalesce(p_filters->>'interval','day');snapshot timestamptz:=statement_timestamp();begin_at timestamptz;finish_at timestamptz;step interval;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF grain<>ALL(ARRAY['hour','day','week','month']) THEN RAISE EXCEPTION 'Invalid interval' USING ERRCODE='22023'; END IF;
 SELECT coalesce(nullif(p_filters->>'start','')::timestamptz,min(occurred_at),snapshot),coalesce(nullif(p_filters->>'end','')::timestamptz,snapshot) INTO begin_at,finish_at FROM redirect_internal.analytics_filtered_for_workspace(p_workspace,p_filters,p_allowed_ids,snapshot);
 step:=('1 '||grain)::interval;
 IF extract(epoch FROM finish_at-begin_at)>(CASE grain WHEN 'hour' THEN 7200000 WHEN 'day' THEN 172800000 WHEN 'week' THEN 1209600000 ELSE 5184000000 END) THEN RAISE EXCEPTION 'Choose a larger interval for this date range' USING ERRCODE='22023'; END IF;
 WITH events AS MATERIALIZED (SELECT * FROM redirect_internal.analytics_filtered_for_workspace(p_workspace,p_filters,p_allowed_ids,snapshot)),
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
END $function$
;
REVOKE ALL ON FUNCTION redirect_internal.analytics_filtered_for_workspace(uuid,jsonb,uuid[],timestamptz),redirect_internal.analytics_report_for_workspace(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.analytics_filtered_for_workspace(uuid,jsonb,uuid[],timestamptz),redirect_internal.analytics_report_for_workspace(uuid,jsonb,uuid[]) TO service_role;
CREATE OR REPLACE FUNCTION public.redirect_report_share_ids(p_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid;s public.redirect_report_shares;principal uuid;allowed uuid[];ids uuid[];owner boolean:=false;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id=selected_workspace AND id=p_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(s.workspace_id,s.owner_user_id);
 owner:=FOUND;
 IF NOT owner THEN
  IF s.requires_workspace_owner THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  SELECT id INTO principal FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND user_id=s.owner_user_id AND active AND kind='user' AND role='member' FOR SHARE;
  IF principal IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  allowed:=redirect_internal.principal_link_scope(s.workspace_id,principal,'events:read');
 END IF;
 SELECT coalesce(array_agg(d.id),ARRAY[]::uuid[]) INTO ids FROM public.redirects d LEFT JOIN public.redirect_link_metadata m ON m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||d.id::text
 LEFT JOIN public.redirect_link_folders f ON f.workspace_id=s.workspace_id AND f.id=m.folder_id
 LEFT JOIN public.redirect_folder_members a ON a.workspace_id=s.workspace_id AND a.folder_id=f.id AND a.member_id=principal
 WHERE d.workspace_id=selected_workspace AND d.type='SHORT' AND (s.scope_mode='folder' OR d.id=ANY(s.link_ids))
 AND (allowed IS NULL OR d.id=ANY(allowed)) AND (owner OR m.folder_id IS NULL OR coalesce(a.permission,f.default_permission) IN('edit','owner'))
 AND (NOT(s.filters?'folderId') OR m.folder_id=(s.filters->>'folderId')::uuid)
 AND (NOT(s.filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||d.id::text AND t.tag_id=(s.filters->>'tagId')::uuid))
 AND (NOT(s.filters?'linkIds') OR d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(s.filters->'linkIds')));
 IF NOT owner AND cardinality(ids)=0 THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 RETURN ids;
END $function$
;
CREATE OR REPLACE FUNCTION public.redirect_public_report_read(p_id uuid, p_version uuid, p_password_verified boolean, p_dates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.redirect_report_shares;ids uuid[];filters jsonb;key text;value text;
 earliest timestamptz;latest timestamptz;selected_start timestamptz;selected_end timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND id=p_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 IF p_version IS DISTINCT FROM s.version OR (s.password_hash IS NOT NULL AND NOT coalesce(p_password_verified,false)) THEN RAISE EXCEPTION 'Dashboard access changed' USING ERRCODE='42501';END IF;
 ids:=public.redirect_report_share_ids(s.id);filters:=s.filters;
 IF p_dates IS NULL OR jsonb_typeof(p_dates)<>'object' OR p_dates-ARRAY['start','end']::text[]<>'{}' THEN RAISE EXCEPTION 'Only start and end dates are supported' USING ERRCODE='22023';END IF;
 earliest:=nullif(filters->>'start','')::timestamptz;latest:=nullif(filters->>'end','')::timestamptz;
 FOREACH key IN ARRAY ARRAY['start','end'] LOOP
  IF p_dates?key THEN
   value:=p_dates->>key;
   IF jsonb_typeof(p_dates->key)<>'string' OR value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' THEN RAISE EXCEPTION 'Use UTC ISO dates' USING ERRCODE='22023';END IF;
   filters:=jsonb_set(filters,ARRAY[key],to_jsonb(value::timestamptz));
  END IF;
 END LOOP;
 selected_start:=nullif(filters->>'start','')::timestamptz;selected_end:=nullif(filters->>'end','')::timestamptz;
 IF (earliest IS NOT NULL AND (selected_start IS NULL OR selected_start<earliest)) OR
    (latest IS NOT NULL AND (selected_end IS NULL OR selected_end>latest)) OR
    (selected_start IS NOT NULL AND selected_end IS NOT NULL AND selected_start>=selected_end) THEN
  RAISE EXCEPTION 'Choose dates within the published reporting period, with start before end' USING ERRCODE='22023';
 END IF;
 IF NOT s.include_conversions THEN filters:=filters||'{"event":"click"}'::jsonb;END IF;
 RETURN jsonb_build_object('allowIndexing',s.allow_indexing AND s.password_hash IS NULL,'title',s.title,'includeConversions',s.include_conversions,'linkCount',cardinality(ids),'scopeMode',s.scope_mode,'expiresAt',s.expires_at,
 'dateRange',jsonb_build_object('start',selected_start,'end',selected_end,'earliest',earliest,'latest',latest),
 'report',redirect_internal.analytics_report_for_workspace(s.workspace_id,filters,ids));
END $function$
;
