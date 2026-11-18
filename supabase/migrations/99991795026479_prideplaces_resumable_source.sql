-- Prepared during the coordinated production migration hold. Apply only after release.
begin;
create table public.prideplaces_scan_runs (
  id uuid primary key references public.pipeline_runs(id),
  period date not null,
  status text not null default 'running' check(status in ('running','completed','failed')),
  expected_businesses integer,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index prideplaces_one_active_scan on public.prideplaces_scan_runs ((true)) where status='running';
create index prideplaces_scan_period on public.prideplaces_scan_runs(period,created_at desc);
create table public.prideplaces_scan_work (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.prideplaces_scan_runs(id),
  kind text not null check(kind in ('business_index','event_index','business','event')),
  url text not null check(url ~ '^https://www[.]prideplaces[.]org/'),
  status text not null default 'pending' check(status in ('pending','done','failed')),
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  outcome text check(outcome in ('discovered','unchanged','staged','review')),
  staging_id uuid references public.ingestion_staging(id),
  error text,
  unique(run_id,kind,url)
);
create index prideplaces_scan_ready on public.prideplaces_scan_work(run_id,status,retry_at,id);
create table public.prideplaces_observations (
  source_id text primary key,
  fact_hash text not null check(fact_hash ~ '^[a-f0-9]{64}$'),
  last_seen_run uuid not null references public.prideplaces_scan_runs(id),
  last_seen_at timestamptz not null default now()
);
alter table public.prideplaces_scan_runs enable row level security;
alter table public.prideplaces_scan_work enable row level security;
alter table public.prideplaces_observations enable row level security;
revoke all on public.prideplaces_scan_runs,public.prideplaces_scan_work,public.prideplaces_observations from public,anon,authenticated;
grant all on public.prideplaces_scan_runs,public.prideplaces_scan_work,public.prideplaces_observations to service_role;
grant usage,select on sequence public.prideplaces_scan_work_id_seq to service_role;
create policy prideplaces_scan_service on public.prideplaces_scan_runs for all to service_role using(true) with check(true);
create policy prideplaces_work_service on public.prideplaces_scan_work for all to service_role using(true) with check(true);
create policy prideplaces_observations_service on public.prideplaces_observations for all to service_role using(true) with check(true);

-- All queue mutations and staging writes are fenced by a single expiring run
-- lease. These INVOKER functions are deliberately executable by service_role only.
create function public.prideplaces_start_scan(p_force boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare rid uuid; period_day date;
begin
  perform pg_advisory_xact_lock(hashtextextended('prideplaces-scan-start',0));
  update public.pipeline_runs p set status='failed',completed_at=now(),error_message='Pride Places scan exceeded six hours; coverage incomplete',
    context=context||jsonb_build_object('source_run_id',p.id,'collection_status','failed','complete',false)
    from public.prideplaces_scan_runs r where r.id=p.id and r.status='running' and r.created_at<now()-interval '6 hours';
  update public.prideplaces_scan_runs set status='failed',completed_at=now(),lease_token=null,lease_until=null
    where status='running' and created_at<now()-interval '6 hours';
  select id into rid from public.prideplaces_scan_runs where status='running';
  if rid is not null then return rid;end if;
  -- A parent scheduler calling later on Sunday reuses the same source scan.
  period_day:=((now() at time zone 'UTC')-interval '3 hours')::date;
  period_day:=period_day-extract(dow from period_day)::integer;
  if not p_force then
    select id into rid from public.prideplaces_scan_runs where period=period_day and status='completed' order by created_at desc limit 1;
    if rid is not null then return rid;end if;
  end if;
  insert into public.pipeline_runs(pipeline_id,pipeline_name,status,started_at,triggered_by,context)
    select id,'prideplaces-weekly-sync','running',now(),'source-prideplaces',
      '{"source":"prideplaces","collection_scope":"all_businesses_and_events","collection_status":"running","downstream_status":"independent_ingestion_gates"}'::jsonb
    from public.pipeline_definitions where name='prideplaces-weekly-sync' returning id into rid;
  if rid is null then raise exception 'Pride Places pipeline definition missing';end if;
  insert into public.prideplaces_scan_runs(id,period) values(rid,period_day);
  update public.ingestion_sources set last_run_at=now() where slug='prideplaces';
  insert into public.prideplaces_scan_work(run_id,kind,url) values
    (rid,'business_index','https://www.prideplaces.org/search_results'),
    (rid,'event_index','https://www.prideplaces.org/events');
  return rid;
end $$;

create function public.prideplaces_claim_scan(p_run uuid,p_batch integer default 4)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.prideplaces_scan_runs; token uuid:=gen_random_uuid(); items jsonb;
begin
  -- Refresh terminal state and enforce the deadline before granting a lease.
  perform public.prideplaces_scan_progress(p_run);
  select * into r from public.prideplaces_scan_runs where id=p_run for update;
  if not found then raise exception 'Unknown Pride Places scan';end if;
  if r.status<>'running' or r.lease_until>now() then return jsonb_build_object('run_id',p_run,'status',r.status,'items','[]'::jsonb);end if;
  -- An unacknowledged fetch consumes an attempt too, preventing endless crash loops.
  update public.prideplaces_scan_work set status='failed',error=coalesce(error,'Worker repeatedly interrupted')
    where run_id=p_run and status='pending' and attempts>=3;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into items from (
    select id,kind,url from public.prideplaces_scan_work
    where run_id=p_run and status='pending' and retry_at<=now() and attempts<3
    order by case when kind like '%index' then 0 else 1 end,id limit least(8,greatest(1,p_batch))
  ) w;
  if jsonb_array_length(items)>0 then
    update public.prideplaces_scan_runs set lease_token=token,lease_until=now()+interval '3 minutes' where id=p_run;
    update public.prideplaces_scan_work set attempts=attempts+1,retry_at=now()+interval '3 minutes'
      where id in(select (x->>'id')::bigint from jsonb_array_elements(items)x);
  end if;
  return jsonb_build_object('run_id',p_run,'status',r.status,'lease',token,'items',items);
end $$;

create function public.prideplaces_finish_work(p_run uuid,p_lease uuid,p_work bigint,p_result jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.prideplaces_scan_runs; w public.prideplaces_scan_work;
  n jsonb; prior public.ingestion_staging; sid text; digest text; old_hash text;
  staged uuid; v_outcome text; needs_review boolean; reason text; link text; next_kind text;
begin
  select * into r from public.prideplaces_scan_runs where id=p_run for update;
  if r.status<>'running' or r.created_at<now()-interval '6 hours' or r.lease_token is distinct from p_lease or r.lease_until<=now() then raise exception 'Stale Pride Places worker lease';end if;
  select * into w from public.prideplaces_scan_work where id=p_work and run_id=p_run for update;
  if not found then raise exception 'Unknown Pride Places work item';end if;
  if w.status<>'pending' then return w.outcome;end if;
  if p_result ? 'error' then
    update public.prideplaces_scan_work set error=left(p_result->>'error',500),
      status=case when attempts>=3 then 'failed' else 'pending' end,
      retry_at=now()+make_interval(secs=>30*attempts) where id=p_work;
    return 'retry';
  end if;
  if w.kind in ('business_index','event_index') then
    if w.kind='business_index' then
      if nullif(p_result->>'expected','') is null then raise exception 'Missing business coverage total';end if;
      if r.expected_businesses is not null and r.expected_businesses<>(p_result->>'expected')::integer then raise exception 'Directory changed during scan; coverage must be retried';end if;
      update public.prideplaces_scan_runs set expected_businesses=(p_result->>'expected')::integer where id=p_run;
    end if;
    next_kind:=case when w.kind='business_index' then 'business' else 'event' end;
    for link in select jsonb_array_elements_text(p_result->'urls') loop
      if link !~ '^https://www[.]prideplaces[.]org/[^?#]+$' then raise exception 'Invalid source detail URL';end if;
      insert into public.prideplaces_scan_work(run_id,kind,url) values(p_run,next_kind,link) on conflict do nothing;
    end loop;
    for link in select jsonb_array_elements_text(p_result->'pages') loop
      if link !~ '^https://www[.]prideplaces[.]org/(search_results|events)([?]page=[0-9]+)?$' then raise exception 'Invalid source index URL';end if;
      insert into public.prideplaces_scan_work(run_id,kind,url) values(p_run,w.kind,link) on conflict do nothing;
    end loop;
    if (select count(*) from public.prideplaces_scan_work where run_id=p_run and kind like '%index')>1000 then raise exception 'Pagination budget exceeded';end if;
    v_outcome:='discovered';
  else
    n:=p_result->'normalized';sid:=n->>'sourceId';digest:=p_result->>'fact_hash';
    if sid is null or digest !~ '^[a-f0-9]{64}$' or n->>'sourceName'<>'prideplaces'
      or (w.kind='business' and sid<>w.url) or (w.kind='event' and not coalesce(
        (sid=w.url and n->'metadata'->>'date_unknown'='true' and n->'metadata'->>'requires_review'='true')
        or (sid=w.url||':'||(n->'metadata'->>'source_next_date') and n->'metadata'->>'source_next_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),false))
      then raise exception 'Invalid normalized source identity or hash';end if;
    select fact_hash into old_hash from public.prideplaces_observations where source_id=sid;
    select * into prior from public.ingestion_staging where source_name='prideplaces' and source_entity_id=sid
      order by created_at desc,id desc limit 1;
    -- The initial import has historical factual payloads but no cache yet.
    -- Worker supplies their independently recomputed projection hash, not an AI verdict.
    if old_hash is null and prior.id is not null and p_result->>'baseline_id'=prior.id::text then old_hash:=p_result->>'baseline_hash';end if;
    if old_hash=digest then v_outcome:='unchanged';
    else
      needs_review:=prior.id is not null or coalesce((n->'metadata'->>'requires_review')::boolean,false)
        or coalesce((n->'metadata'->>'incomplete_business_profile')::boolean,false);
      reason:=case when prior.id is not null then 'Source facts changed; preserve existing canonical corrections, quarantines and entity-type decisions until reviewed.'
        else 'Incomplete source identity, venue or local event time; confirmation required.' end;
      -- Event series already known under an earlier occurrence is also a conflict
      -- candidate, rather than a new auto-published parallel recurring series.
      if w.kind='event' and prior.id is null then
        select * into prior from public.ingestion_staging where source_name='prideplaces' and entity_type='event'
          and normalized_data->'metadata'->>'url'=w.url order by created_at desc,id desc limit 1;
        if prior.id is not null then needs_review:=true;reason:='Existing recurring event series; reconcile the new occurrence with the canonical calendar before publishing.';end if;
      end if;
      if prior.target_table='organizations' then n:=jsonb_set(n,'{entityType}','"organization"');end if;
      n:=jsonb_set(n,'{metadata}',coalesce(n->'metadata','{}')||jsonb_build_object('scan_run_id',p_run,'prior_staging_id',prior.id,'source_fact_hash',digest));
      insert into public.ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,
        raw_data,normalized_data,pipeline_run_id,payload_hash,idempotency_key,review_status,ai_validation_status,ai_validation_result,review_notes,dedup_details)
      values('prideplaces','prideplaces',sid,case when prior.target_table='organizations' then 'organization' when w.kind='business' then 'venue' else 'event' end,
        case when prior.target_table='organizations' then 'organizations' when w.kind='business' then 'venues' else 'events' end,
        jsonb_build_object('source','prideplaces','url',w.url,'fact_hash',digest),n,p_run,digest,
        'prideplaces:'||p_run::text||':'||sid||':'||digest,
        case when needs_review then 'pending_review' else 'auto' end,
        case when needs_review then 'needs_review' else 'pending' end,
        case when needs_review then jsonb_build_object('source_review_required',true,'reason',reason) else '{}'::jsonb end,
        case when needs_review then reason end,
        jsonb_build_object('previous_source_staging_id',prior.id,'existing_entity_id',prior.target_record_id,'existing_entity_table',prior.target_table,'fresh_dedup_required',true))
      returning id into staged;
      v_outcome:=case when needs_review then 'review' else 'staged' end;
    end if;
    insert into public.prideplaces_observations(source_id,fact_hash,last_seen_run) values(sid,digest,p_run)
      on conflict(source_id) do update set fact_hash=excluded.fact_hash,last_seen_run=excluded.last_seen_run,last_seen_at=now();
  end if;
  update public.prideplaces_scan_work set status='done',outcome=v_outcome,staging_id=staged,error=null where id=p_work;
  return v_outcome;
end $$;

create function public.prideplaces_scan_progress(p_run uuid,p_lease uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.prideplaces_scan_runs; counts jsonb; remaining integer; failed integer; businesses integer; staged integer; processed integer; message text; final_status text;
begin
  select * into r from public.prideplaces_scan_runs where id=p_run for update;
  if not found then raise exception 'Unknown Pride Places scan';end if;
  if r.status<>'running' then
    select context into counts from public.pipeline_runs where id=p_run;
    return counts;
  end if;
  if p_lease is not null and r.lease_token=p_lease then
    update public.prideplaces_scan_runs set lease_token=null,lease_until=null where id=p_run;
  end if;
  select count(*) filter(where status='pending'),count(*) filter(where status='failed'),
    count(*) filter(where kind='business'),count(*) filter(where staging_id is not null),
    count(*) filter(where kind in ('business','event') and status='done')
    into remaining,failed,businesses,staged,processed from public.prideplaces_scan_work where run_id=p_run;
  select coalesce(jsonb_object_agg(outcome,n),'{}') into counts from (
    select outcome,count(*) n from public.prideplaces_scan_work where run_id=p_run and outcome is not null group by outcome) x;
  final_status:=r.status;
  if r.status='running' and (remaining=0 or r.created_at<now()-interval '6 hours') then
    final_status:=case when r.created_at<now()-interval '6 hours' or failed>0 or r.expected_businesses is null or businesses<>r.expected_businesses then 'failed' else 'completed' end;
    if r.created_at<now()-interval '6 hours' then message:='Pride Places scan exceeded six hours; coverage incomplete';
    elsif final_status='failed' then message:='Incomplete source coverage: failed pages or distinct business count differs from published total';end if;
    update public.prideplaces_scan_runs set status=final_status,completed_at=now(),lease_token=null,lease_until=null where id=p_run;
  end if;
  counts:=counts||jsonb_build_object('source_run_id',p_run,'collection_status',final_status,'expected_businesses',r.expected_businesses,
    'businesses_discovered',businesses,'pending',remaining,'failed',failed,'staged_total',staged,
    'events_discovered',(select count(*) from public.prideplaces_scan_work where run_id=p_run and kind='event'),
    'missing_known_businesses',(select count(*) from public.prideplaces_observations where last_seen_run<>p_run and source_id not like 'https://www.prideplaces.org/events/%'),
    'source_errors',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select url,status,attempts,error from public.prideplaces_scan_work where run_id=p_run and error is not null order by id limit 10)e),
    'downstream_status','independent_ingestion_gates','complete',final_status='completed');
  update public.pipeline_runs set items_total=(select count(*) from public.prideplaces_scan_work where run_id=p_run and kind in ('business','event')),
    items_processed=processed,items_succeeded=processed,items_failed=failed,
    context=context||counts,status=final_status,error_message=coalesce(message,error_message),
    completed_at=case when final_status<>'running' then coalesce(completed_at,now()) end,
    duration_ms=case when final_status<>'running' then least(2147483647,(extract(epoch from (now()-started_at))*1000)::bigint)::integer end
    where id=p_run;
  if r.status='running' and final_status<>'running' then
    update public.ingestion_sources set
      last_success_at=case when final_status='completed' then now() else last_success_at end,
      last_error=case when final_status='failed' then message else null end,
      total_items_fetched=coalesce(total_items_fetched,0)+processed
      where slug='prideplaces';
  end if;
  return counts;
end $$;

revoke all on function public.prideplaces_start_scan(boolean),public.prideplaces_claim_scan(uuid,integer),
  public.prideplaces_finish_work(uuid,uuid,bigint,jsonb),public.prideplaces_scan_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prideplaces_start_scan(boolean),public.prideplaces_claim_scan(uuid,integer),
  public.prideplaces_finish_work(uuid,uuid,bigint,jsonb),public.prideplaces_scan_progress(uuid,uuid) to service_role;

insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema)
values('source-prideplaces','source','Pride Places','All businesses and events; resumable source scan with factual change detection.','Database','#be185d','source-prideplaces','{}')
on conflict(slug) do nothing;
insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,schedule,is_enabled)
values('prideplaces-weekly-sync','Pride Places weekly sync','Full source collection; downstream validation, deduplication and conflict review remain separate gates.',
 '[{"id":"prideplaces","type":"source-prideplaces","position":{"x":180,"y":120},"data":{"label":"Pride Places","config":{}}}]',
 '[]','{"batch_size":4}',1,21600,'0 3 * * 0',false) on conflict(name) do nothing;
insert into public.ingestion_sources(name,slug,source_type,target_table,edge_function,config,schedule,is_enabled)
values('Pride Places','prideplaces','api','venues','source-prideplaces','{"batch_size":4,"collection_scope":"all_businesses_and_events"}','0 3 * * 0',false)
on conflict(slug) do nothing;

-- Registered but initially disabled: enable only after the deployed worker and
-- a real full scan are verified. The coordinated hold also covers this migration.
-- Continuations are conditional SQL, so idle minutes do not invoke an Edge Function.
do $$
declare starter text; pump text;
begin
 starter:=$cmd$select net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-prideplaces',
 headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
 body:='{"action":"start","batch_size":4}'::jsonb,timeout_milliseconds:=115000);$cmd$;
 pump:=$cmd$select net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-prideplaces',
 headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
 body:=jsonb_build_object('action','continue','run_id',r.id,'batch_size',4),timeout_milliseconds:=115000)
 from public.prideplaces_scan_runs r where r.status='running' and (r.lease_until is null or r.lease_until<now());$cmd$;
 insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,action,schedule)
 values('prideplaces_weekly_sync','Pride Places weekly sync','All business categories and events, Sundays 03:00 UTC.','system',false,
   '{"type":"schedule"}',jsonb_build_object('type','cron','jobname','prideplaces_weekly_sync','command',starter),'0 3 * * 0'),
 ('prideplaces_scan_continue','Pride Places scan continuation','Resume bounded source batches only while a full scan is active.','system',false,
   '{"type":"schedule"}',jsonb_build_object('type','cron','jobname','prideplaces_scan_continue','command',pump),'* * * * *')
 on conflict(slug) do nothing;
end $$;
commit;
