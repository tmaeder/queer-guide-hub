-- Weekly GayOut acquisition uses the existing pipeline DAG and commit gates.
-- These queues contain source facts/checkpoints, never public canonical data.
create table if not exists public.gayout_sync_cycles (
  pipeline_run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  inventory text not null check (inventory in ('places','events')),
  status text not null default 'running' check (status in ('running','completed','blocked')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  primary key (pipeline_run_id, inventory)
);
create table if not exists public.gayout_sync_urls (
  inventory text not null check (inventory in ('places','events')),
  url text not null check (url ~ '^https://www[.]gayout[.]com/'),
  work_kind text not null check (work_kind in ('sitemap','detail')),
  source_entity_id text,
  target_table text check (target_table in ('venues','organizations','events')),
  source_lastmod text,
  active_run_id uuid references public.pipeline_runs(id) on delete set null,
  state text not null default 'pending' check (state in ('pending','leased','retry','done','review','gone')),
  attempts integer not null default 0,
  lease_token uuid,
  leased_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  document_hash text,
  document_offset integer not null default 0 check (document_offset >= 0),
  last_fetched_at timestamptz,
  last_seen_at timestamptz not null default now(),
  last_error text,
  primary key (inventory,url)
);
create index if not exists gayout_sync_urls_due_idx
  on public.gayout_sync_urls(active_run_id,inventory,state,next_attempt_at,work_kind,url);
alter table public.gayout_sync_cycles enable row level security;
alter table public.gayout_sync_urls enable row level security;
revoke all on public.gayout_sync_cycles, public.gayout_sync_urls from public, anon, authenticated;
grant select,insert,update,delete on public.gayout_sync_cycles, public.gayout_sync_urls to service_role;

create or replace function public.start_gayout_weekly_sync(p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.pipeline_definitions; r uuid; snapshot jsonb; states jsonb; context jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('gayout-weekly-sync:start',0));
  select * into strict p from public.pipeline_definitions where name='gayout-weekly-sync';
  if not p.is_enabled and not coalesce((p_context->>'dry_run')::boolean,false) then raise exception 'GayOut weekly pipeline is disabled'; end if;
  update public.pipeline_runs set status='failed',completed_at=now(),error_message='GayOut sync exceeded its configured run timeout; checkpoints retained'
   where pipeline_id=p.id and status in ('queued','running')
     and started_at < now()-make_interval(secs=>p.timeout_seconds);
  select id into r from public.pipeline_runs where pipeline_id=p.id and status in('queued','running') order by started_at limit 1;
  if r is not null then return jsonb_build_object('pipeline_run_id',r,'created',false); end if;
  context:=coalesce(p.default_context,'{}')||coalesce(p_context,'{}');
  snapshot:=public.snapshot_pipeline_definition(p.id);
  select jsonb_object_agg(n->>'id',jsonb_build_object('status','pending','items_in',0,'items_out',0)) into states
    from jsonb_array_elements(p.nodes)n;
  insert into public.pipeline_runs(pipeline_id,pipeline_name,status,node_states,context,started_at,triggered_by,pipeline_snapshot,pipeline_version)
    values(p.id,p.name,'running',states,context,now(),coalesce(context->>'triggered_by','cron'),snapshot,p.version) returning id into r;
  -- Creating the run and its first delivery is one transaction.
  perform public.pgmq_send('pipeline_steps',jsonb_build_object('workflow','pipeline-executor','action','continue',
    'pipeline_run_id',r,'pipeline_id',p.id,'pipeline_name',p.name,'current_node_id','source-places',
    'current_step',0,'total_steps',jsonb_array_length(p.nodes),'context',context),0);
  return jsonb_build_object('pipeline_run_id',r,'created',true);
end $$;

create or replace function public.gayout_init_cycle(p_run uuid,p_inventory text)
returns void language plpgsql security invoker set search_path='' as $$
declare inserted integer; root text;
begin
  if p_inventory not in('places','events') then raise exception 'Invalid GayOut inventory'; end if;
  if not exists(select 1 from public.pipeline_runs where id=p_run and pipeline_name='gayout-weekly-sync' and status='running') then raise exception 'GayOut run is not active'; end if;
  insert into public.gayout_sync_cycles(pipeline_run_id,inventory)values(p_run,p_inventory)on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return; end if;
  root:=case p_inventory when 'places' then 'https://www.gayout.com/sitemap-venues.xml' else 'https://www.gayout.com/sitemap-events.xml' end;
  insert into public.gayout_sync_urls(inventory,url,work_kind,active_run_id,state)
    values(p_inventory,root,'sitemap',p_run,'pending') on conflict(inventory,url)do update set
      active_run_id=p_run,state='pending',attempts=0,lease_token=null,leased_until=null,
      next_attempt_at=now(),document_offset=0,document_hash=null,last_error=null;
  -- Resume eligible staged work from interrupted older runs; preserve human review.
  update public.ingestion_staging s set pipeline_run_id=p_run,updated_at=now()
   where s.source_name='gayout' and s.disposition='pending' and s.review_status in('auto','approved')
     and s.normalized_data is not null
     and ((p_inventory='events' and s.target_table='events') or(p_inventory='places' and s.target_table in('venues','organizations')))
     and (s.pipeline_run_id is null or exists(select 1 from public.pipeline_runs old where old.id=s.pipeline_run_id and old.status not in('queued','running')));
end $$;

create or replace function public.gayout_claim_urls(p_run uuid,p_inventory text,p_limit integer default 5)
returns setof public.gayout_sync_urls language sql security invoker set search_path='' as $$
  with candidates as materialized (
    select q.inventory,q.url from public.gayout_sync_urls q
     where q.active_run_id=p_run and q.inventory=p_inventory
       and exists(select 1 from public.pipeline_runs r where r.id=p_run and r.pipeline_name='gayout-weekly-sync' and r.status='running')
       and ((q.state in('pending','retry') and q.next_attempt_at<=now()) or(q.state='leased' and q.leased_until<now()))
     order by case q.work_kind when 'sitemap' then 0 else 1 end,q.next_attempt_at,q.url
     limit greatest(1,least(coalesce(p_limit,5),10)) for update skip locked
  ) update public.gayout_sync_urls q set state='leased',lease_token=gen_random_uuid(),leased_until=now()+interval '3 minutes',attempts=q.attempts+1
     from candidates c where q.inventory=c.inventory and q.url=c.url returning q.*;
$$;

create or replace function public.gayout_save_inventory(p_run uuid,p_inventory text,p_url text,p_token uuid,
  p_hash text,p_jobs jsonb,p_offset integer,p_done boolean)
returns integer language plpgsql security invoker set search_path='' as $$
declare q public.gayout_sync_urls; job jsonb; inserted integer:=0; week_start timestamptz;
begin
  select * into q from public.gayout_sync_urls where inventory=p_inventory and url=p_url and active_run_id=p_run
    and state='leased' and lease_token=p_token for update;
  if not found then raise exception 'GayOut inventory lease is stale'; end if;
  if not exists(select 1 from public.pipeline_runs where id=p_run and status='running') then raise exception 'GayOut run is not active'; end if;
  if jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>1000 or p_offset<0 then raise exception 'Invalid inventory batch'; end if;
  if q.document_hash=p_hash and p_offset<q.document_offset then raise exception 'GayOut inventory cursor regressed'; end if;
  select date_trunc('week',started_at at time zone 'UTC') at time zone 'UTC' into week_start from public.pipeline_runs where id=p_run;
  for job in select value from jsonb_array_elements(p_jobs) loop
    if job->>'url' !~ '^https://www[.]gayout[.]com/' or job->>'work_kind' not in('sitemap','detail') then raise exception 'Invalid GayOut source job'; end if;
    if job->>'work_kind'='detail' and job->>'target_table' not in('venues','organizations','events') then raise exception 'Invalid GayOut target'; end if;
    insert into public.gayout_sync_urls as old(inventory,url,work_kind,source_entity_id,target_table,source_lastmod,active_run_id)
      values(p_inventory,job->>'url',job->>'work_kind',job->>'source_entity_id',job->>'target_table',job->>'lastmod',p_run)
    on conflict(inventory,url)do update set
      source_entity_id=excluded.source_entity_id,target_table=excluded.target_table,
      state=case when old.active_run_id=p_run then old.state
        when excluded.work_kind='detail' and old.last_fetched_at>=week_start and old.source_lastmod is not distinct from excluded.source_lastmod and old.state in('done','review','gone') then old.state else 'pending' end,
      next_attempt_at=case when old.active_run_id=p_run then old.next_attempt_at else now() end,
      attempts=case when old.active_run_id=p_run then old.attempts else 0 end,
      document_offset=case when old.active_run_id=p_run then old.document_offset else 0 end,
      document_hash=case when old.active_run_id=p_run then old.document_hash else null end,
      lease_token=case when old.active_run_id=p_run then old.lease_token else null end,
      leased_until=case when old.active_run_id=p_run then old.leased_until else null end,
      source_lastmod=excluded.source_lastmod,active_run_id=p_run,last_seen_at=now();
    inserted:=inserted+1;
  end loop;
  update public.gayout_sync_urls set document_hash=p_hash,document_offset=p_offset,
    state=case when p_done then 'done' else 'leased' end,
    lease_token=case when p_done then null else lease_token end,leased_until=case when p_done then null else now()+interval '3 minutes' end,
    last_fetched_at=case when p_done then now() else last_fetched_at end,last_error=null
    where inventory=p_inventory and url=p_url and lease_token=p_token;
  return inserted;
end $$;

create or replace function public.gayout_finish_url(p_run uuid,p_inventory text,p_url text,p_token uuid,
  p_state text,p_error text default null,p_delay integer default 0)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_state not in('pending','retry','done','review','gone') then raise exception 'Invalid GayOut completion state'; end if;
  update public.gayout_sync_urls set state=p_state,last_error=left(p_error,2000),lease_token=null,leased_until=null,
    next_attempt_at=now()+make_interval(secs=>greatest(0,least(coalesce(p_delay,0),86400))),
    last_fetched_at=case when p_state in('done','review','gone') then now() else last_fetched_at end
    where active_run_id=p_run and inventory=p_inventory and url=p_url and lease_token=p_token and state='leased';
  get diagnostics n=row_count; return n=1;
end $$;

create or replace function public.gayout_cycle_summary(p_run uuid,p_inventory text,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; remaining integer;
begin
  select jsonb_build_object('discovered',count(*)filter(where work_kind='detail'),
    'pending',count(*)filter(where state in('pending','retry','leased')),
    'done',count(*)filter(where work_kind='detail' and state='done'),
    'review',count(*)filter(where work_kind='detail' and state='review'),
    'gone',count(*)filter(where work_kind='detail' and state='gone')) into result
   from public.gayout_sync_urls where active_run_id=p_run and inventory=p_inventory;
  remaining:=(result->>'pending')::integer;
  update public.gayout_sync_cycles set status=case when p_error is not null then 'blocked' when remaining=0 then 'completed' else 'running' end,
    last_error=left(p_error,2000),completed_at=case when p_error is not null or remaining=0 then now() else null end
    where pipeline_run_id=p_run and inventory=p_inventory;
  return result;
end $$;

-- Revalidate changed facts rather than retaining approval for an older payload.
create or replace function public.gayout_stage_item(p_run uuid,p_node text,p_target text,p_url text,p_token uuid,p_normalized jsonb,p_raw jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.ingestion_staging; n jsonb:=p_normalized; sid uuid; h text; held boolean; country uuid; lat numeric; lng numeric;
begin
  if p_target not in('venues','organizations','events') or n->>'sourceName' is distinct from 'gayout' or nullif(n->>'sourceId','') is null then raise exception 'Invalid GayOut staging identity'; end if;
  if n->>'entityType' is distinct from (case p_target when 'venues' then 'venue' when 'organizations' then 'organization' else 'event' end) then raise exception 'GayOut entity type contradicts target'; end if;
  if not exists(select 1 from public.pipeline_runs where id=p_run and pipeline_name='gayout-weekly-sync' and status='running') then raise exception 'GayOut run is not active'; end if;
  perform 1 from public.gayout_sync_urls where active_run_id=p_run and url=p_url and inventory=case when p_target='events' then 'events' else 'places' end and state='leased' and lease_token=p_token and leased_until>now() for update;
  if not found then raise exception 'GayOut source lease is stale'; end if;
  if n#>>'{metadata,url}' is distinct from p_url then raise exception 'GayOut evidence contradicts its lease'; end if;
  if coalesce(n#>>'{metadata,url}','') !~ '^https://www[.]gayout[.]com/' then raise exception 'Invalid GayOut evidence URL'; end if;
  select id into country from public.countries where upper(code)=n#>>'{location,country}' limit 1;
  if country is null then raise exception 'Unresolved GayOut country'; end if;
  if n#>>'{location,lat}' is not null and n#>>'{location,lng}' is not null then
    lat:=(n#>>'{location,lat}')::numeric; lng:=(n#>>'{location,lng}')::numeric;
    if lat not between -90 and 90 or lng not between -180 and 180 or(lat=0 and lng=0) then raise exception 'Invalid GayOut coordinates'; end if;
    if exists(select 1 from public.cities c where c.country_id=country and round(c.latitude::numeric,6)=round(lat,6) and round(c.longitude::numeric,6)=round(lng,6)) then
      n:=n #- '{location,lat}' #- '{location,lng}';
      n:=jsonb_set(n,'{metadata}',coalesce(n->'metadata','{}')||jsonb_build_object('coordinate_status','city_centroid_withheld','source_reported_coordinates',jsonb_build_object('lat',lat,'lng',lng)));
    end if;
  end if;
  h:=encode(extensions.digest(((n-'metadata')||jsonb_build_object('metadata',coalesce(n->'metadata','{}')-'lastmod'))::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('gayout:'||p_target||':'||(n->>'sourceId'),0));
  select * into s from public.ingestion_staging where source_name='gayout' and target_table=p_target and source_entity_id=n->>'sourceId'
    order by (target_record_id is not null)desc,updated_at desc,id limit 1 for update;
  if found and s.payload_hash=h then return jsonb_build_object('changed',false,'staging_id',s.id); end if;
  held:=coalesce((n#>>'{metadata,source_unverified}')::boolean,false) or n#>>'{metadata,review_reason}' is not null or coalesce(s.review_status='pending_review',false);
  if s.id is null then
    insert into public.ingestion_staging(source_type,source_name,source_entity_id,target_table,entity_type,normalized_data,raw_data,payload_hash,
      pipeline_run_id,node_id,job_id,disposition,ai_validation_status,dedup_status,enrichment_status,review_status,error_message)
    values('gayout','gayout',n->>'sourceId',p_target,n->>'entityType',n,p_raw,h,p_run,p_node,p_run,'pending',
      case when held then 'needs_review' else 'pending' end,'pending','pending',case when held then 'pending_review' else 'auto' end,n#>>'{metadata,review_reason}') returning id into sid;
  else
    if s.pipeline_run_id is distinct from p_run and exists(select 1 from public.pipeline_runs r where r.id=s.pipeline_run_id and r.status in('queued','running')) then raise exception 'GayOut staging identity is owned by an active run'; end if;
    sid:=s.id;
    update public.ingestion_staging set normalized_data=n,raw_data=p_raw,payload_hash=h,pipeline_run_id=p_run,node_id=p_node,job_id=p_run,
      entity_type=n->>'entityType',disposition='pending',ai_validation_status=case when held then 'needs_review' else 'pending' end,
      dedup_status='pending',dedup_match_id=null,dedup_match_score=null,dedup_details=null,enrichment_status='pending',
      review_status=case when held then 'pending_review' else 'auto' end,error_message=n#>>'{metadata,review_reason}',processed_at=null,updated_at=now()
      where id=sid;
  end if;
  insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)values(sid,'source',case when held then 'needs_review' else 'pending' end,'gayout-weekly-sync',jsonb_build_object('evidence_url',n#>>'{metadata,url}','payload_hash',h,'target_table',p_target));
  if held then
    insert into public.review_queue(entity_type,entity_id,review_type,details,status)
      select 'ingestion_staging',sid,'gayout_source_quality',jsonb_build_object('reason',coalesce(n#>>'{metadata,review_reason}','Source marks this listing unverified'),'source_url',n#>>'{metadata,url}'),'pending'
      where not exists(select 1 from public.review_queue where entity_type='ingestion_staging' and entity_id=sid and status='pending');
  end if;
  return jsonb_build_object('changed',true,'staging_id',sid,'review',held);
end $$;

-- Source- and run-scoped wrapper: the global venue/event batch RPCs are not
-- suitable for a source-specific DAG. Existing item RPCs retain their gates.
create or replace function public.commit_gayout_staging_batch(p_run uuid,p_target text,p_limit integer default 10)
returns table(staging_id uuid,entity_id uuid,action text) language plpgsql security invoker set search_path='' as $$
declare s public.ingestion_staging; result record; target uuid; outcome text; old public.organizations;
  n jsonb; loc jsonb; donor jsonb; patch jsonb; country uuid; city uuid; target_name text; src_key text; dst_key text;
begin
  if p_target not in('venues','organizations','events') then raise exception 'Invalid GayOut commit target'; end if;
  if not exists(select 1 from public.pipeline_runs where id=p_run and pipeline_name='gayout-weekly-sync' and status='running') then raise exception 'GayOut run is not active'; end if;
  for s in select * from public.ingestion_staging st where st.pipeline_run_id=p_run and st.source_name='gayout'
    and st.target_table=p_target and st.disposition='pending' and st.ai_validation_status='approved'
    and st.dedup_status in('unique','duplicate','merge_candidate') and st.review_status in('auto','approved')
    order by st.created_at,st.id limit greatest(1,least(coalesce(p_limit,10),10)) for update skip locked loop
   begin
    n:=s.normalized_data; loc:=coalesce(n->'location','{}'); target:=null; outcome:=null;
    -- A lossy ASCII matcher must never merge distinct non-Latin names.
    if s.dedup_match_id is not null then
      if p_target='venues' then select name into target_name from public.venues where id=s.dedup_match_id;
      elsif p_target='events' then select title into target_name from public.events where id=s.dedup_match_id;
      else select name into target_name from public.organizations where id=s.dedup_match_id; end if;
      src_key:=regexp_replace(lower(extensions.unaccent(n->>'name')),'[^[:alnum:]]','','g');
      dst_key:=regexp_replace(lower(extensions.unaccent(coalesce(target_name,''))),'[^[:alnum:]]','','g');
      if regexp_replace(lower(extensions.unaccent(n->>'name')),'[^a-z0-9]','','g')<>src_key and src_key<>dst_key then
        update public.ingestion_staging set review_status='pending_review',error_message='E_GAYOUT_UNICODE_MATCH_REQUIRES_REVIEW',updated_at=now()where id=s.id;
        insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)values(s.id,'review','pending_review','gayout-weekly-sync',jsonb_build_object('reason','Distinct Unicode identities cannot be auto-merged','source_name',n->>'name','candidate_name',target_name));
        return query select s.id,null::uuid,'review'::text; continue;
      end if;
    end if;
    if p_target='venues' then
      select * into result from public.commit_venue_staging_item(s.id,'gayout-weekly-sync'); target:=result.venue_id; outcome:=result.action;
    elsif p_target='events' then
      select * into result from public.commit_event_staging_item(s.id,'gayout-weekly-sync'); target:=result.event_id; outcome:=result.action;
    else
      select id into country from public.countries where upper(code)=loc->>'country' limit 1;
      city:=null;
      if country is not null and nullif(loc->>'city','') is not null then city:=public.city_pick_in_country(country,loc->>'city',null,true); end if;
      if city is not null and loc->>'lat' is not null and loc->>'lng' is not null and exists(
        select 1 from public.cities c where c.id=city and c.latitude is not null and c.longitude is not null
          and 6371*2*asin(sqrt(least(1.0,power(sin(radians(c.latitude-(loc->>'lat')::double precision)/2),2)
          +cos(radians(c.latitude))*cos(radians((loc->>'lat')::double precision))*power(sin(radians(c.longitude-(loc->>'lng')::double precision)/2),2))))>50
      ) then city:=null;end if;
      target:=coalesce(s.target_record_id,s.dedup_match_id); old:=null;
      if target is not null then select * into old from public.organizations where id=target for update;
        if not found then raise exception 'Organization identity no longer exists'; end if;
        if old.duplicate_of_id is not null then target:=old.duplicate_of_id;select * into strict old from public.organizations where id=target for update;end if;
        if old.country_id is not null and country is not null and old.country_id<>country then
          update public.ingestion_staging set review_status='pending_review',error_message='E_GAYOUT_ORGANIZATION_COUNTRY_CONFLICT',updated_at=now()where id=s.id;
          return query select s.id,null::uuid,'review'::text; continue;
        end if;
      end if;
      donor:=jsonb_strip_nulls(jsonb_build_object('description',n->>'description','website',n#>>'{contacts,website}',
        'email',n#>>'{contacts,email}','phone',n#>>'{contacts,phone}','address',loc->>'address','latitude',loc->'lat','longitude',loc->'lng'));
      if old.id is null then
        target:=gen_random_uuid();
        insert into public.organizations(id,name,slug,roles,status,description,website,email,phone,address,latitude,longitude,country_id,city_id,field_provenance)
        values(target,n->>'name',coalesce(nullif(trim(both '-' from regexp_replace(lower(extensions.unaccent(n->>'name')),'[^[:alnum:]]+','-','g')),''),'organization')||'-'||substr(target::text,1,8),
          array['community'],'active',donor->>'description',donor->>'website',donor->>'email',donor->>'phone',donor->>'address',
          (donor->>'latitude')::double precision,(donor->>'longitude')::double precision,country,city,
          jsonb_build_object('gayout',jsonb_build_object('source_id',s.source_entity_id,'url',n#>>'{metadata,url}','pipeline_run_id',p_run)));
        outcome:='inserted';
      else
        patch:=public.merge_gap_patch('organization',to_jsonb(old),donor);
        perform public.merge_gap_write('organizations',target,patch);
        update public.organizations set country_id=coalesce(country_id,country),city_id=coalesce(city_id,city),
          field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('gayout',jsonb_build_object('source_id',s.source_entity_id,'url',n#>>'{metadata,url}','pipeline_run_id',p_run)),updated_at=now()where id=target;
        outcome:='updated';
      end if;
      update public.ingestion_staging set disposition=outcome,target_record_id=target,processed_at=now(),updated_at=now(),error_message=null where id=s.id;
      insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)values(s.id,'commit',outcome,'gayout-weekly-sync',jsonb_build_object('organization_id',target,'source_url',n#>>'{metadata,url}'));
      insert into public.enrichment_audit(staging_id,pipeline_run_id,stage,status,changed_fields,before_data,after_data,actor)
        values(s.id,p_run,'commit','success',array(select jsonb_object_keys(donor)),to_jsonb(old),jsonb_build_object('entity_table','organizations','entity_id',target,'source_facts',n),'gayout-weekly-sync');
    end if;
    return query select s.id,target,outcome;
   exception when others then
    update public.ingestion_staging set disposition='rejected',error_message='commit_fn: '||sqlerrm,updated_at=now()where id=s.id;
    insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)values(s.id,'commit','rejected','gayout-weekly-sync',jsonb_build_object('error',sqlerrm));
    return query select s.id,null::uuid,'rejected'::text;
   end;
  end loop;
end $$;

revoke all on function public.start_gayout_weekly_sync(jsonb),public.gayout_init_cycle(uuid,text),
  public.gayout_claim_urls(uuid,text,integer),public.gayout_save_inventory(uuid,text,text,uuid,text,jsonb,integer,boolean),
  public.gayout_finish_url(uuid,text,text,uuid,text,text,integer),public.gayout_cycle_summary(uuid,text,text),
  public.gayout_stage_item(uuid,text,text,text,uuid,jsonb,jsonb),public.commit_gayout_staging_batch(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.start_gayout_weekly_sync(jsonb),public.gayout_init_cycle(uuid,text),
  public.gayout_claim_urls(uuid,text,integer),public.gayout_save_inventory(uuid,text,text,uuid,text,jsonb,integer,boolean),
  public.gayout_finish_url(uuid,text,text,uuid,text,text,integer),public.gayout_cycle_summary(uuid,text,text),
  public.gayout_stage_item(uuid,text,text,text,uuid,jsonb,jsonb),public.commit_gayout_staging_batch(uuid,text,integer) to service_role;

-- Step leases fence duplicate dispatcher deliveries. Finishing a step and
-- enqueueing its continuation/successor are one transaction.
create or replace function public.gayout_claim_step(p_run uuid,p_node text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.pipeline_runs; state jsonb; token uuid:=gen_random_uuid(); edge jsonb;
begin
  select * into r from public.pipeline_runs where id=p_run and pipeline_name='gayout-weekly-sync' and status='running' for update;
  if not found then return null; end if;
  if not exists(select 1 from jsonb_array_elements(r.pipeline_snapshot->'nodes')n where n->>'id'=p_node) then raise exception 'Unknown GayOut step'; end if;
  state:=r.node_states->p_node;
  if state->>'status' in('completed','skipped','failed') then return null; end if;
  if state->>'status'='running' and (state->>'leased_until')::timestamptz>now() then return null; end if;
  for edge in select value from jsonb_array_elements(r.pipeline_snapshot->'edges') where value->>'target'=p_node loop
    if coalesce(r.node_states->(edge->>'source')->>'status','pending') not in('completed','skipped') then return null; end if;
  end loop;
  state:=state||jsonb_build_object('status','running','started_at',coalesce(state->>'started_at',now()::text),
    'lease_token',token,'leased_until',now()+interval '3 minutes');
  update public.pipeline_runs set node_states=jsonb_set(node_states,array[p_node],state) where id=p_run;
  return jsonb_build_object('token',token,'state',state);
end $$;

create or replace function public.gayout_finish_step(p_run uuid,p_node text,p_token uuid,p_state jsonb,
  p_processed integer,p_succeeded integer,p_failed integer,p_repeat boolean default false,p_delay integer default 1)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.pipeline_runs; states jsonb; edge jsonb; node jsonb; target text; ready boolean; all_done boolean;
begin
  select * into r from public.pipeline_runs where id=p_run and pipeline_name='gayout-weekly-sync' and status='running' for update;
  if not found or r.node_states->p_node->>'lease_token' is distinct from p_token::text then return false; end if;
  if p_state->>'status' not in('pending','completed','failed') or p_processed<0 or p_succeeded<0 or p_failed<0 then raise exception 'Invalid GayOut step result'; end if;
  if not p_repeat and p_state->>'status'='pending' then raise exception 'Pending steps require a continuation'; end if;
  states:=jsonb_set(r.node_states,array[p_node],p_state-'lease_token'-'leased_until');
  update public.pipeline_runs set node_states=states,items_processed=coalesce(items_processed,0)+p_processed,
    items_succeeded=coalesce(items_succeeded,0)+p_succeeded,items_failed=coalesce(items_failed,0)+p_failed where id=p_run;
  if p_state->>'status'='failed' then
    for node in select value from jsonb_array_elements(r.pipeline_snapshot->'nodes') loop
      if states->(node->>'id')->>'status'='pending' then states:=jsonb_set(states,array[node->>'id'],(states->(node->>'id'))||'{"status":"skipped"}'::jsonb); end if;
    end loop;
    update public.pipeline_runs set status='failed',node_states=states,completed_at=now(),
      error_message='Node '||p_node||' failed: '||coalesce(p_state->>'error','unknown source failure') where id=p_run;
    return true;
  end if;
  if p_repeat then
    if p_state->>'status'<>'pending' then raise exception 'Continuation must remain pending'; end if;
    perform public.pgmq_send('pipeline_steps',jsonb_build_object('workflow','pipeline-executor','action','continue','pipeline_run_id',p_run,
      'pipeline_id',r.pipeline_id,'pipeline_name',r.pipeline_name,'current_node_id',p_node,'context',r.context),greatest(1,least(coalesce(p_delay,1),300)));
    return true;
  end if;
  for edge in select value from jsonb_array_elements(r.pipeline_snapshot->'edges') where value->>'source'=p_node loop
    target:=edge->>'target';
    if states->target->>'status'<>'pending' then continue; end if;
    select not exists(select 1 from jsonb_array_elements(r.pipeline_snapshot->'edges')e
      where e->>'target'=target and coalesce(states->(e->>'source')->>'status','pending')not in('completed','skipped')) into ready;
    if ready then
      perform public.pgmq_send('pipeline_steps',jsonb_build_object('workflow','pipeline-executor','action','continue','pipeline_run_id',p_run,
        'pipeline_id',r.pipeline_id,'pipeline_name',r.pipeline_name,'current_node_id',target,'context',r.context),0);
    end if;
  end loop;
  select not exists(select 1 from jsonb_each(states)s where s.value->>'status' not in('completed','skipped'))into all_done;
  if all_done then update public.pipeline_runs set status='completed',completed_at=now(),duration_ms=(extract(epoch from(now()-started_at))*1000)::bigint where id=p_run;end if;
  return true;
end $$;
revoke all on function public.gayout_claim_step(uuid,text),public.gayout_finish_step(uuid,text,uuid,jsonb,integer,integer,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.gayout_claim_step(uuid,text),public.gayout_finish_step(uuid,text,uuid,jsonb,integer,integer,integer,boolean,integer) to service_role;

insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema,input_ports,output_ports,is_enabled)
values('source-gayout','source','GayOut','Resumable factual venue, organisation and event sitemap sync','Globe','#b60d3d','source-gayout',
  '{"type":"object","properties":{"inventory":{"type":"string","enum":["places","events"],"default":"places"},"batch_size":{"type":"integer","minimum":1,"maximum":5,"default":5}}}'::jsonb,
  '[]'::jsonb,'[{"id":"out","type":"any","label":"Source facts"}]'::jsonb,true)
on conflict(slug)do update set edge_function=excluded.edge_function,config_schema=excluded.config_schema,description=excluded.description,is_enabled=true;

do $$
declare nodes jsonb:='[]';edges jsonb:='[]'; spec record; previous text:=null; n integer:=0; cfg jsonb;
begin
  for spec in select * from (values
    ('source-places','source-gayout','GayOut venues and organisations',null::text,'places'),
    ('validate-venues','pipeline-validate','Validate venues','venues',null),
    ('dedup-venues','pipeline-deduplicate','Deduplicate venues','venues',null),
    ('commit-venues','pipeline-commit','Review gate and commit venues','venues',null),
    ('validate-organizations','pipeline-validate','Validate organisations','organizations',null),
    ('dedup-organizations','pipeline-deduplicate','Deduplicate organisations','organizations',null),
    ('commit-organizations','pipeline-commit','Review gate and commit organisations','organizations',null),
    ('source-events','source-gayout','GayOut events',null,'events'),
    ('validate-events','pipeline-validate','Validate events','events',null),
    ('dedup-events','pipeline-deduplicate','Deduplicate events','events',null),
    ('commit-events','pipeline-commit','Review gate and commit events','events',null)
  )as s(id,type,label,target,inventory)loop
    cfg:=jsonb_build_object('batch_size',case when spec.type='source-gayout' then 5 when spec.type='pipeline-commit' then 10 else 50 end,'invocation_timeout_seconds',100);
    if spec.inventory is not null then cfg:=cfg||jsonb_build_object('inventory',spec.inventory);
    else cfg:=cfg||jsonb_build_object('targetTable',spec.target,'drain_until_empty',true);
      if spec.type='pipeline-commit' then cfg:=cfg||'{"source_scope":"gayout"}'::jsonb;end if;
    end if;
    nodes:=nodes||jsonb_build_array(jsonb_build_object('id',spec.id,'type',spec.type,'position',jsonb_build_object('x',n*260,'y',case when n<7 then 100 else 360 end),
      'data',jsonb_build_object('label',spec.label,'nodeTypeSlug',spec.type,'config',cfg)));
    if previous is not null then edges:=edges||jsonb_build_array(jsonb_build_object('id','gayout-'||previous||'-'||spec.id,'source',previous,'target',spec.id));end if;
    previous:=spec.id;n:=n+1;
  end loop;
  insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,schedule,is_template,is_enabled)
    values('gayout-weekly-sync','GayOut Weekly Sync','Weekly factual venues, organisations and events; resumable acquisition and source-scoped quality gates.',nodes,edges,
      '{"source_name":"gayout","batch_size":50}'::jsonb,1,518400,'0 3 * * 1',false,false)
  on conflict(name)do update set display_name=excluded.display_name,description=excluded.description,nodes=excluded.nodes,edges=excluded.edges,
    default_context=excluded.default_context,max_concurrency=excluded.max_concurrency,timeout_seconds=excluded.timeout_seconds,schedule=excluded.schedule;
end $$;
