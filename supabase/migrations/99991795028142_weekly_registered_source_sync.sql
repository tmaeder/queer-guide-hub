-- Weekly, registry-driven source intake. Credentials remain in their existing
-- server-side registries/Vault; run snapshots contain no source configuration.
begin;

create table public.weekly_source_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  registry text not null check (registry in ('scrape_sources','ingestion_sources','news_sources')),
  source_id uuid not null,
  source_name text not null,
  source_slug text,
  status text not null default 'pending' check (status in ('pending','queued','running','waiting','succeeded','skipped','blocked','failed')),
  reason text check (length(reason)<=500),
  required_settings text[] not null default '{}',
  attempts integer not null default 0 check (attempts between 0 and 3),
  poll_errors integer not null default 0 check (poll_errors between 0 and 3),
  child_run_id uuid references public.pipeline_runs(id) on delete set null,
  child_pipeline text,
  deliveries integer not null default 0,
  interrupted_attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  queued_at timestamptz,
  delivery_msg_id bigint,
  started_at timestamptz,
  completed_at timestamptz,
  items_fetched bigint not null default 0 check (items_fetched>=0),
  items_staged bigint not null default 0 check (items_staged>=0),
  items_skipped bigint not null default 0 check (items_skipped>=0),
  items_failed bigint not null default 0 check (items_failed>=0),
  unique (run_id,registry,source_id),
  check (child_run_id is null or child_run_id<>run_id)
);
create index weekly_source_sync_jobs_child on public.weekly_source_sync_jobs(child_run_id) where child_run_id is not null;
create index weekly_source_sync_jobs_ready on public.weekly_source_sync_jobs(run_id,status,next_attempt_at,id);
alter table public.weekly_source_sync_jobs enable row level security;
revoke all on public.weekly_source_sync_jobs from public,anon,authenticated;
grant select on public.weekly_source_sync_jobs to authenticated;
grant all on public.weekly_source_sync_jobs to service_role;
create policy weekly_source_sync_jobs_admin_read on public.weekly_source_sync_jobs
  for select to authenticated using (public.has_role((select auth.uid()),'admin'::public.app_role));
create policy weekly_source_sync_jobs_service on public.weekly_source_sync_jobs
  for all to service_role using (true) with check (true);

insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema)
values ('weekly-source-sync','source','Registered data sources',
  'Managed weekly parent: dynamically sync registered scrapers, imports and feeds with individual outcomes.',
  'Database','#2563eb','pipeline-weekly-source-sync','{}')
on conflict (slug) do nothing;

insert into public.ingestion_sources(name,slug,source_type,target_table,edge_function,config,is_enabled)
select 'OUT x OUT','outxout','scraper','events','source-outxout',
  '{"pipeline":"outxout-catalogue-sync","target_tables":["events","venues","organizations"]}'::jsonb,true
where exists(select 1 from public.pipeline_node_types where slug='source-outxout' and is_enabled)
on conflict (slug) do nothing;

insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,schedule,is_enabled)
values ('weekly-data-source-sync','Weekly data source sync',
  'All registered sources, with disabled/paused entries reported as skipped and source-specific failures retained.',
  '[{"id":"weekly-sync","type":"weekly-source-sync","position":{"x":180,"y":120},"data":{"label":"Sync registered data sources","config":{}}}]',
  '[]','{"batch_size":50,"metrics_unit":"sources"}',3,172800,'0 6 * * 0',true)
on conflict (name) do nothing;

insert into public.workflow_definitions(name,display_name,description,edge_function,queue_name,
  max_concurrency,timeout_seconds,max_retries,is_enabled)
values ('weekly-source-sync-worker','Weekly source sync worker','Durable per-source jobs for the weekly parent pipeline.',
  'pipeline-weekly-source-sync','pipeline_steps',3,140,3,true)
on conflict (name) do nothing;

-- OSM already has a live managed import, but lacked a canonical registry row.
insert into public.ingestion_sources(name,slug,source_type,target_table,edge_function,config,schedule,is_enabled)
values ('OpenStreetMap LGBTQ+ venues','osm','api','venues','source-osm-venue','{}',null,true)
on conflict (slug) do nothing;

create function api_private.schedule_weekly_source_sync(p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.pipeline_runs%rowtype;
  j public.weekly_source_sync_jobs%rowtype;
  slot_limit integer;
  active_count integer;
  source_count integer;
  terminal_count integer;
  success_count integer;
  skipped_count integer;
  blocked_count integer;
  failure_count integer;
  fetched bigint;
  staged bigint;
  stamp timestamptz:=clock_timestamp();
  wakes jsonb:='[]';
  summary jsonb;
  terminal_status text;
  message_id bigint;
begin
  select * into r from public.pipeline_runs where id=p_run
    and pipeline_name='weekly-data-source-sync' for update;
  if not found or r.status<>'running' then return jsonb_build_object('run_id',p_run,'job_ids',wakes);end if;
  if not exists(select 1 from public.workflow_definitions where name='weekly-source-sync-worker' and is_enabled) then
    update public.pipeline_runs set status='paused',error_message='Weekly source worker is disabled' where id=p_run;
    return jsonb_build_object('run_id',p_run,'job_ids',wakes);
  end if;
  select least(3,greatest(1,coalesce(max_concurrency,3))) into slot_limit
    from public.pipeline_definitions where id=r.pipeline_id;
  slot_limit:=coalesce(slot_limit,1);

  -- A lost worker is retried only after its child request's maximum lifetime.
  update public.weekly_source_sync_jobs set
    status=case when child_run_id is not null and poll_errors<2 then 'waiting'
      when child_run_id is null and attempts<3 then 'pending' else 'failed' end,
    reason='Previous worker lease expired; its reported counts may be incomplete',
    interrupted_attempts=interrupted_attempts+1,
    lease_token=null,lease_until=null,next_attempt_at=stamp,delivery_msg_id=null,
    poll_errors=case when child_run_id is not null then least(3,poll_errors+1) else poll_errors end,
    completed_at=case when (child_run_id is null and attempts>=3) or (child_run_id is not null and poll_errors>=2) then stamp else null end
    where run_id=p_run and status='running' and lease_until<stamp;
  update public.weekly_source_sync_jobs set
    status=case when deliveries>=4 then 'failed' when child_run_id is not null then 'waiting' else 'pending' end,
    reason='Queued source delivery was not claimed',next_attempt_at=stamp,delivery_msg_id=null,
    completed_at=case when deliveries>=4 then stamp else null end
    where run_id=p_run and status in ('queued','waiting') and delivery_msg_id is not null
      and queued_at<stamp-interval '10 minutes';

  -- Waiting children retain their slot. Polls do not launch more source runs.
  for j in select * from public.weekly_source_sync_jobs where run_id=p_run and status='waiting'
    and delivery_msg_id is null order by next_attempt_at,id for update
  loop
    message_id:=public.pgmq_send('pipeline_steps',jsonb_build_object(
      'workflow','weekly-source-sync-worker','action','continue','pipeline_run_id',p_run,
      'current_node_id',j.id),greatest(0,ceil(extract(epoch from j.next_attempt_at-stamp))::integer));
    update public.weekly_source_sync_jobs set delivery_msg_id=message_id,
      queued_at=greatest(stamp,j.next_attempt_at),deliveries=deliveries+1 where id=j.id;
    if j.next_attempt_at<=stamp then wakes:=wakes||jsonb_build_array(j.id);end if;
  end loop;

  select count(*) into active_count from public.weekly_source_sync_jobs
    where run_id=p_run and status in ('queued','running','waiting');
  for j in select * from public.weekly_source_sync_jobs
    where run_id=p_run and status='pending'
    order by next_attempt_at,id limit greatest(0,slot_limit-active_count) for update skip locked
  loop
    update public.weekly_source_sync_jobs set status='queued',queued_at=stamp,deliveries=deliveries+1 where id=j.id;
    message_id:=public.pgmq_send('pipeline_steps',jsonb_build_object(
      'workflow','weekly-source-sync-worker','action','continue','pipeline_run_id',p_run,
      'pipeline_id',r.pipeline_id,'pipeline_name',r.pipeline_name,'current_node_id',j.id,
      'current_step',0,'total_steps',1,'context','{}'::jsonb),
      greatest(0,ceil(extract(epoch from j.next_attempt_at-stamp))::integer));
    update public.weekly_source_sync_jobs set delivery_msg_id=message_id where id=j.id;
    if j.next_attempt_at<=stamp then wakes:=wakes||jsonb_build_array(j.id);end if;
  end loop;

  select count(*),count(*) filter(where status in ('succeeded','skipped','blocked','failed')),
    count(*) filter(where status='succeeded'),count(*) filter(where status='skipped'),
    count(*) filter(where status='blocked'),count(*) filter(where status='failed'),
    coalesce(sum(items_fetched),0),coalesce(sum(items_staged),0)
  into source_count,terminal_count,success_count,skipped_count,blocked_count,failure_count,fetched,staged
  from public.weekly_source_sync_jobs where run_id=p_run;
  summary:=jsonb_build_object('sources',source_count,'processed',terminal_count,'succeeded',success_count,
    'skipped',skipped_count,'blocked',blocked_count,'failed',failure_count,
    'records_fetched',fetched,'records_staged',staged,'metrics_unit','sources');
  terminal_status:=case when terminal_count<source_count then 'running'
    when blocked_count+failure_count>0 then 'failed' else 'completed' end;
  update public.pipeline_runs set status=terminal_status,updated_at=stamp,
    completed_at=case when terminal_status<>'running' then stamp else null end,
    context=coalesce(context,'{}')||jsonb_build_object('weekly_summary',summary,'metrics_unit','sources'),
    items_total=source_count,items_processed=terminal_count,items_succeeded=success_count,
    items_failed=blocked_count+failure_count,
    node_states=jsonb_build_object('weekly-sync',jsonb_build_object(
      'status',terminal_status,'items_in',source_count,'items_out',staged,
      'started_at',r.started_at,'summary',summary)
      ||case when terminal_status<>'running' then jsonb_build_object('completed_at',stamp) else '{}'::jsonb end),
    error_message=case when terminal_status='failed' then
      format('Weekly sync: %s failed source(s), %s blocked source(s)',failure_count,blocked_count) else null end
    where id=p_run;
  return jsonb_build_object('run_id',p_run,'job_ids',wakes,'total_sources',source_count,'summary',summary);
end;
$$;

-- Stopping a parent invalidates its leases without cancelling independent child imports.
create function api_private.stop_weekly_source_sync_jobs()
returns trigger language plpgsql security definer set search_path='' as $$
declare summary jsonb;
begin
  if new.pipeline_name='weekly-data-source-sync' and new.status in ('cancelled','failed','completed') then
    update public.weekly_source_sync_jobs set status='skipped',
      reason='Parent pipeline stopped: '||new.status,completed_at=clock_timestamp(),
      lease_token=null,lease_until=null,delivery_msg_id=null
    where run_id=new.id and status in ('pending','queued','running','waiting');
    if found then
      select jsonb_build_object('sources',count(*),'processed',count(*),
        'succeeded',count(*) filter(where status='succeeded'),
        'skipped',count(*) filter(where status='skipped'),
        'blocked',count(*) filter(where status='blocked'),'failed',count(*) filter(where status='failed'),
        'records_fetched',coalesce(sum(items_fetched),0),'records_staged',coalesce(sum(items_staged),0),
        'metrics_unit','sources') into summary
      from public.weekly_source_sync_jobs where run_id=new.id;
      update public.pipeline_runs set context=coalesce(context,'{}')||jsonb_build_object('weekly_summary',summary,'metrics_unit','sources'),
        items_total=(summary->>'sources')::integer,items_processed=(summary->>'processed')::integer,
        items_succeeded=(summary->>'succeeded')::integer,
        items_failed=(summary->>'blocked')::integer+(summary->>'failed')::integer,
        completed_at=coalesce(new.completed_at,clock_timestamp()),updated_at=clock_timestamp(),
        node_states=jsonb_build_object('weekly-sync',jsonb_build_object('status',new.status,
          'summary',summary,'started_at',new.started_at,'completed_at',coalesce(new.completed_at,clock_timestamp()),
          'items_in',summary->'sources','items_out',summary->'records_staged'))
      where id=new.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger stop_weekly_source_sync_jobs after update of status on public.pipeline_runs
  for each row when (old.status is distinct from new.status)
  execute function api_private.stop_weekly_source_sync_jobs();

create function api_private.start_weekly_source_sync(p_pipeline uuid,p_context jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d public.pipeline_definitions%rowtype;
  v_run uuid;
  response jsonb;
  dry_run boolean:=coalesce((p_context->>'dry_run')::boolean,false);
begin
  perform pg_advisory_xact_lock(hashtextextended('weekly-data-source-sync',0));
  select * into d from public.pipeline_definitions where id=p_pipeline
    and name='weekly-data-source-sync' and is_enabled for update;
  if not found then return null;end if;
  if jsonb_typeof(d.nodes) is distinct from 'array' or jsonb_typeof(d.edges) is distinct from 'array' then
    raise exception 'Weekly sync graph is managed; configure its sources in the source registry';
  end if;
  if jsonb_array_length(d.nodes)<>1 or coalesce(d.nodes->0->>'id','')<>'weekly-sync'
    or coalesce(d.nodes->0->>'type','')<>'weekly-source-sync' or d.edges<>'[]'::jsonb
    or coalesce(d.nodes->0->'data'->'config','{}'::jsonb)<>'{}'::jsonb then
    raise exception 'Weekly sync graph is managed; configure its sources in the source registry';
  end if;
  perform api_private.recover_weekly_source_sync_jobs();
  select id into v_run from public.pipeline_runs where pipeline_id=d.id
    and status in ('queued','running','paused') order by created_at desc limit 1;
  if found then return jsonb_build_object('run_id',v_run,'reused',true,'job_ids','[]'::jsonb,
    'total_sources',(select count(*) from public.weekly_source_sync_jobs j where j.run_id=v_run),
    'dry_run',(select context->'dry_run' from public.pipeline_runs where id=v_run));end if;

  insert into public.pipeline_runs(pipeline_id,pipeline_name,status,node_states,context,started_at,
    triggered_by,pipeline_snapshot,pipeline_version)
  values(d.id,d.name,'running','{}',jsonb_build_object(
    'dry_run',dry_run,'batch_size',least(500,greatest(1,coalesce((p_context->>'batch_size')::integer,50))),
    'triggered_by',case when p_context->>'triggered_by'='cron' then 'cron' else 'manual' end,'metrics_unit','sources'),
    clock_timestamp(),case when p_context->>'triggered_by'='cron' then 'cron' else 'manual' end,
    jsonb_build_object('id',d.id,'name',d.name,'display_name',d.display_name,'nodes',d.nodes,'edges',d.edges,
      'timeout_seconds',d.timeout_seconds,'schedule',d.schedule,'max_concurrency',least(3,greatest(1,coalesce(d.max_concurrency,3)))),d.version)
  returning id into v_run;

  insert into public.weekly_source_sync_jobs(run_id,registry,source_id,source_name,source_slug,status,reason,completed_at)
  select v_run,'scrape_sources',s.id,left(s.name,200),s.slug,
    case when s.is_enabled then 'pending' else 'skipped' end,
    case when not coalesce(s.is_enabled,false) then 'Source is disabled' end,
    case when not coalesce(s.is_enabled,false) then now() end from public.scrape_sources s;

  insert into public.weekly_source_sync_jobs(run_id,registry,source_id,source_name,source_slug,status,reason,completed_at)
  select v_run,'ingestion_sources',s.id,left(s.name,200),s.slug,
    case when skip.reason is null then 'pending' else 'skipped' end,skip.reason,
    case when skip.reason is not null then now() end
  from public.ingestion_sources s cross join lateral(select case
    when not coalesce(s.is_enabled,false) then 'Source is disabled'
    when s.edge_function='scrape-web-sources' and exists(select 1 from public.scrape_sources c where c.slug=s.slug)
      then 'Canonical scraper registration is covered by this run'
    when s.edge_function='source-rss-news' then 'Feed registrations are synced individually'
    when s.slug='foursquare' and exists(select 1 from public.ingestion_sources c where c.slug='foursquare-os' and c.is_enabled)
      then 'Canonical Foursquare Open Source registration is covered by this run'
    end reason) skip;

  insert into public.weekly_source_sync_jobs(run_id,registry,source_id,source_name,status,reason,completed_at)
  select v_run,'news_sources',s.id,left(s.name,200),
    case when skip.reason is null then 'pending' else 'skipped' end,skip.reason,
    case when skip.reason is not null then now() end
  from public.news_sources s cross join lateral(select case
    when not coalesce(s.is_active,false) then 'Source is disabled'
    when coalesce(s.auto_paused,false) then 'Source is paused'
    when s.backoff_until>now() then 'Source backoff is active' end reason) skip;

  response:=api_private.schedule_weekly_source_sync(v_run);
  return response||jsonb_build_object('reused',false,'dry_run',dry_run);
end;
$$;

create function api_private.claim_weekly_source_sync_job(p_run uuid,p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.weekly_source_sync_jobs%rowtype;token uuid:=gen_random_uuid();
begin
  perform 1 from public.pipeline_runs where id=p_run and pipeline_name='weekly-data-source-sync' and status='running' for update;
  if not found then return null;end if;
  if not exists(select 1 from public.workflow_definitions where name='weekly-source-sync-worker' and is_enabled) then return null;end if;
  select * into j from public.weekly_source_sync_jobs where id=p_job and run_id=p_run
    and (status='queued' or (status='waiting' and delivery_msg_id is not null))
    and next_attempt_at<=clock_timestamp() and (attempts<3 or child_run_id is not null) for update;
  if not found then return null;end if;
  -- Claims archive the redundant delivery, including fast wakes. A crash is
  -- recovered from the durable job lease, so completed wakes cannot clog the
  -- shared pipeline queue behind hundreds of already-finished source jobs.
  if j.delivery_msg_id is not null and exists(select 1 from pgmq.q_pipeline_steps q
    where q.msg_id=j.delivery_msg_id and q.message->>'pipeline_run_id'=p_run::text
      and q.message->>'current_node_id'=j.id::text and q.message->>'workflow'='weekly-source-sync-worker') then
    perform public.pgmq_archive('pipeline_steps',j.delivery_msg_id);
  end if;
  update public.weekly_source_sync_jobs set status='running',attempts=attempts+case when child_run_id is null then 1 else 0 end,
    delivery_msg_id=null,deliveries=0,
    started_at=coalesce(started_at,clock_timestamp()),lease_token=token,
    lease_until=clock_timestamp()+interval '3 minutes' where id=j.id returning * into j;
  return jsonb_build_object('id',j.id,'run_id',j.run_id,'registry',j.registry,'source_id',j.source_id,
    'source_name',j.source_name,'source_slug',j.source_slug,'attempts',j.attempts,'token',token,
    'child_run_id',j.child_run_id,'child_pipeline',j.child_pipeline);
end;
$$;

create function api_private.finish_weekly_source_sync_job(p_run uuid,p_job uuid,p_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.weekly_source_sync_jobs%rowtype;outcome text:=p_result->>'outcome';retry boolean;response jsonb;
  waiting boolean:=coalesce((p_result->>'waiting')::boolean,false);child_error boolean;
begin
  if outcome is null or outcome not in ('succeeded','skipped','blocked','failed') then raise exception 'Invalid source outcome';end if;
  perform 1 from public.pipeline_runs where id=p_run and pipeline_name='weekly-data-source-sync' and status='running' for update;
  if not found then return jsonb_build_object('accepted',false,'run_id',p_run,'job_ids','[]'::jsonb);end if;
  select * into j from public.weekly_source_sync_jobs where id=p_job and run_id=p_run
    and status='running' and lease_token=p_token and lease_until>=clock_timestamp() for update;
  if not found then return jsonb_build_object('accepted',false,'run_id',p_run,'job_ids','[]'::jsonb);end if;
  if waiting and (outcome<>'succeeded' or p_result->>'child_run_id' is null or p_result->>'child_pipeline' is null) then
    raise exception 'Invalid child pipeline continuation';end if;
  child_error:=outcome='failed' and coalesce((p_result->>'retryable')::boolean,false) and j.child_run_id is not null;
  retry:=outcome='failed' and coalesce((p_result->>'retryable')::boolean,false)
    and case when j.child_run_id is null then j.attempts<3 else j.poll_errors<2 end;
  update public.weekly_source_sync_jobs set status=case
    when waiting or (retry and j.child_run_id is not null) then 'waiting'
    when retry then 'pending' else outcome end,
    child_run_id=coalesce((p_result->>'child_run_id')::uuid,child_run_id),
    child_pipeline=coalesce(left(p_result->>'child_pipeline',200),child_pipeline),
    poll_errors=case when child_error then least(3,poll_errors+1) else 0 end,delivery_msg_id=null,
    reason=left(p_result->>'reason',500),
    required_settings=array(select left(value,100) from jsonb_array_elements_text(coalesce(p_result->'required_settings','[]')) limit 20),
    items_fetched=items_fetched+greatest(0,coalesce((p_result->>'fetched')::bigint,0)),
    items_staged=items_staged+greatest(0,coalesce((p_result->>'staged')::bigint,0)),
    items_skipped=items_skipped+greatest(0,coalesce((p_result->>'skipped')::bigint,0)),
    items_failed=items_failed+greatest(0,coalesce((p_result->>'failed')::bigint,0)),
    next_attempt_at=clock_timestamp()+make_interval(secs=>case when waiting then 60
      when retry then 30*case when j.child_run_id is null then j.attempts else j.poll_errors+1 end else 0 end),
    completed_at=case when not retry and not waiting then clock_timestamp() end,lease_token=null,lease_until=null
    where id=j.id;
  response:=api_private.schedule_weekly_source_sync(p_run);
  return response||jsonb_build_object('accepted',true);
end;
$$;

create function public.start_weekly_source_sync(p_pipeline uuid,p_context jsonb)
returns jsonb language sql set search_path='' as $$select api_private.start_weekly_source_sync($1,$2)$$;
create function public.claim_weekly_source_sync_job(p_run uuid,p_job uuid)
returns jsonb language sql set search_path='' as $$select api_private.claim_weekly_source_sync_job($1,$2)$$;
create function public.finish_weekly_source_sync_job(p_run uuid,p_job uuid,p_token uuid,p_result jsonb)
returns jsonb language sql set search_path='' as $$select api_private.finish_weekly_source_sync_job($1,$2,$3,$4)$$;

create function api_private.recover_weekly_source_sync_jobs()
returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;
begin
  update public.pipeline_runs set status='running',error_message=null
  where pipeline_name='weekly-data-source-sync' and status='paused'
    and error_message='Weekly source worker is disabled'
    and exists(select 1 from public.workflow_definitions where name='weekly-source-sync-worker' and is_enabled);
  update public.pipeline_runs p set status='failed',completed_at=clock_timestamp(),
    error_message='Weekly source sync exceeded its configured timeout'
  where pipeline_name='weekly-data-source-sync' and status='running'
    and started_at<clock_timestamp()-make_interval(secs=>coalesce((pipeline_snapshot->>'timeout_seconds')::integer,172800));
  for r in select id from public.pipeline_runs where pipeline_name='weekly-data-source-sync' and status='running' loop
    perform api_private.schedule_weekly_source_sync(r.id);n:=n+1;
  end loop;
  return n;
end;
$$;
create function public.recover_weekly_source_sync_jobs()
returns integer language sql set search_path='' as $$select api_private.recover_weekly_source_sync_jobs()$$;

-- The pipeline editor's schedule remains canonical. The automation registry
-- manages the derived cron entry and keeps its normal pause/reconciliation net.
create function api_private.sync_weekly_source_sync_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
declare command text;sync_enabled boolean;
begin
  if new.name<>'weekly-data-source-sync' then return new;end if;
  sync_enabled:=tg_op='INSERT';
  if tg_op='UPDATE' then sync_enabled:=old.is_enabled is distinct from new.is_enabled
    or (old.schedule is null and new.schedule is not null);end if;
  command:=$cmd$select public.start_weekly_source_sync(id,jsonb_build_object(
    'triggered_by','cron','dry_run',false,'batch_size',default_context->'batch_size'))
    from public.pipeline_definitions where name='weekly-data-source-sync' and is_enabled;$cmd$;
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values ('weekly_data_source_sync','Weekly data source sync','Run the native registered-source pipeline.',
    'system',new.is_enabled and new.schedule is not null,'{"type":"schedule"}','[]',
    jsonb_build_object('type','cron','jobname','pipeline-weekly-data-source-sync','command',command),new.schedule)
  on conflict (slug) do update set schedule=excluded.schedule,
    enabled=(case when sync_enabled then excluded.enabled
      else public.admin_automations.enabled and excluded.enabled end)
      and public.admin_automations.lifecycle_state='active',
    action=excluded.action,updated_at=now();
  return new;
end;
$$;
create trigger sync_weekly_source_sync_schedule after insert or update of schedule,is_enabled on public.pipeline_definitions
  for each row execute function api_private.sync_weekly_source_sync_schedule();
update public.pipeline_definitions set schedule=schedule where name='weekly-data-source-sync';

insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
values ('weekly_source_sync_recovery','Recover weekly source sync jobs','Recover expired source leases and unclaimed durable deliveries.',
  'system',true,'{"type":"schedule"}','[]',
  '{"type":"cron","jobname":"weekly-source-sync-recovery","command":"select public.recover_weekly_source_sync_jobs();"}',
  '1-59/5 * * * *') on conflict (slug) do nothing;

revoke all on function api_private.stop_weekly_source_sync_jobs(),api_private.schedule_weekly_source_sync(uuid),
  api_private.start_weekly_source_sync(uuid,jsonb),api_private.claim_weekly_source_sync_job(uuid,uuid),
  api_private.finish_weekly_source_sync_job(uuid,uuid,uuid,jsonb),api_private.recover_weekly_source_sync_jobs(),
  api_private.sync_weekly_source_sync_schedule(),public.start_weekly_source_sync(uuid,jsonb),
  public.claim_weekly_source_sync_job(uuid,uuid),public.finish_weekly_source_sync_job(uuid,uuid,uuid,jsonb),
  public.recover_weekly_source_sync_jobs() from public,anon,authenticated;
grant execute on function api_private.start_weekly_source_sync(uuid,jsonb),
  api_private.claim_weekly_source_sync_job(uuid,uuid),api_private.finish_weekly_source_sync_job(uuid,uuid,uuid,jsonb),
  api_private.recover_weekly_source_sync_jobs(),public.start_weekly_source_sync(uuid,jsonb),
  public.claim_weekly_source_sync_job(uuid,uuid),public.finish_weekly_source_sync_job(uuid,uuid,uuid,jsonb),
  public.recover_weekly_source_sync_jobs() to service_role;

commit;
