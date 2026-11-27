-- Out x Out: durable, source-scoped ingestion, independent of desktop clients.
create table public.outxout_sync_runs (
 id uuid primary key references public.pipeline_runs(id), phase text not null default 'collect' check(phase in('collect','process','completed','failed')),
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(), heartbeat_at timestamptz not null default now(),
 observed integer not null default 0, changed integer not null default 0, unchanged integer not null default 0, held integer not null default 0,
 error text, scope text not null default 'catalogue'
);
create unique index outxout_one_active_run on public.outxout_sync_runs((true)) where phase in('collect','process');
create table public.outxout_sync_work (
 id bigint generated always as identity primary key, run_id uuid not null references public.outxout_sync_runs(id), kind text not null,
 url text not null check(url like 'https://outxout.com/%'), payload jsonb not null default '{}', priority integer not null default 10,
 status text not null default 'pending' check(status in('pending','done','failed')), attempts integer not null default 0,
 retry_at timestamptz not null default now(), error text, completed_at timestamptz,
 unique(run_id,kind,url)
);
create index outxout_work_pending on public.outxout_sync_work(run_id,priority,id) where status='pending';
create table public.outxout_sync_entities (
 source_entity_id text primary key, target_table text not null check(target_table in('venues','events','organizations')),
 native_id text, staging_id uuid references public.ingestion_staging(id), target_id uuid,
 normalized jsonb not null, last_seen_run uuid references public.outxout_sync_runs(id), last_seen_at timestamptz not null default now()
);
create index outxout_native_identity on public.outxout_sync_entities(target_table,native_id) where native_id is not null;
create table public.outxout_sync_changes (
 id bigint generated always as identity primary key, run_id uuid not null references public.outxout_sync_runs(id),
 source_entity_id text not null, staging_id uuid, target_id uuid, outcome text not null,
 previous_data jsonb, proposed_data jsonb not null, applied_patch jsonb not null default '{}', conflicts jsonb not null default '[]',
 created_at timestamptz not null default now(), unique(run_id,source_entity_id)
);
create index outxout_changes_run on public.outxout_sync_changes(run_id,outcome);
alter table public.outxout_sync_runs enable row level security;
alter table public.outxout_sync_work enable row level security;
alter table public.outxout_sync_entities enable row level security;
alter table public.outxout_sync_changes enable row level security;
revoke all on public.outxout_sync_runs,public.outxout_sync_work,public.outxout_sync_entities,public.outxout_sync_changes from anon,authenticated;
grant all on public.outxout_sync_runs,public.outxout_sync_work,public.outxout_sync_entities,public.outxout_sync_changes to service_role;
grant usage,select on sequence public.outxout_sync_work_id_seq,public.outxout_sync_changes_id_seq to service_role;
-- Existing catalogue identities remain authoritative; do not start a new source namespace.
insert into public.outxout_sync_entities(source_entity_id,target_table,native_id,staging_id,target_id,normalized)
 select distinct on(source_entity_id) source_entity_id,target_table,nullif(normalized_data->'metadata'->>'source_native_id',''),id,target_record_id,normalized_data
 from public.ingestion_staging where source_name='outxout' and target_table in('events','venues','organizations')
 order by source_entity_id,created_at desc;

create function public.outxout_source_fields(n jsonb,t text) returns jsonb language plpgsql immutable set search_path=public as $$
declare p jsonb;
begin
 p:=jsonb_build_object('website',case when t='events' then n->'website' else n->'contacts'->'website' end,'address',n->'location'->'address','__images',n->'images','__tags',n->'tags','__services',n->'metadata'->'services','__sports_details',n->'metadata'->'sports_details');
 if t='events' then
  p:=p||jsonb_build_object('title',coalesce(n->'title',n->'name'),'start_date',to_jsonb(nullif(n->>'start_date','')::timestamptz),'end_date',to_jsonb(nullif(n->>'end_date','')::timestamptz),'venue_name',n->'venue_name','timezone',n->'location'->'timezone');
 else
  p:=p||jsonb_build_object('name',n->'name','phone',n->'contacts'->'phone','email',n->'contacts'->'email');
  if t='venues' then p:=p||jsonb_build_object('category',n->'category','hours',n->'hours','instagram',n->'contacts'->'instagram');end if;
 end if;
 return jsonb_strip_nulls(p);
end $$;

create function public.outxout_open_run(p_trigger text default 'manual',p_run_id uuid default null,p_scope text default 'catalogue') returns uuid
language plpgsql set search_path=public,extensions as $$
declare r uuid; definition_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('outxout-sync-start'));
 select id into r from outxout_sync_runs where phase in('collect','process') limit 1;
 if r is not null then return r;end if;
 select id into definition_id from pipeline_definitions where name='outxout-catalogue-sync';
 if p_run_id is null then
  insert into pipeline_runs(pipeline_id,pipeline_name,status,context,started_at,triggered_by,node_states)
  values(definition_id,'outxout-catalogue-sync','running',jsonb_build_object('source_name','outxout','scope',p_scope),now(),p_trigger,'{"outxout":{"status":"running","items_in":0,"items_out":0}}') returning id into r;
 else
  if not exists(select 1 from pipeline_runs where id=p_run_id and pipeline_id=definition_id and status='running') then raise exception 'invalid_outxout_pipeline_run';end if;
  r:=p_run_id;
 end if;
 insert into outxout_sync_runs(id,scope) values(r,p_scope);
 if p_scope='catalogue' then
  insert into outxout_sync_work(run_id,kind,url,priority) values(r,'sitemap','https://outxout.com/sitemap.xml',0),(r,'catalogue','https://outxout.com/venues',1),(r,'catalogue','https://outxout.com/cities',1),(r,'sports','https://outxout.com/sports/download',4);
 elsif p_scope='canary' then
  insert into outxout_sync_work(run_id,kind,url,priority) values
   (r,'detail','https://outxout.com/venue/thehoxtonwilliamsburgnewyorkcity',10),
   (r,'detail','https://outxout.com/event/newcastle-pride-2027-hub',10),
   (r,'detail','https://outxout.com/service-provider/randall-oneill',10),
   (r,'sports','https://outxout.com/sports/download',4);
 else raise exception 'unknown_scope';end if;
 return r;
end $$;

create function public.outxout_claim(p_run uuid,p_token uuid) returns jsonb language plpgsql set search_path=public as $$
declare r outxout_sync_runs%rowtype; jobs jsonb;
begin
 select * into r from outxout_sync_runs where id=p_run for update;
 if not found then raise exception 'run_not_found';end if;
 if r.phase not in('collect','process') then return jsonb_build_object('phase',r.phase,'jobs','[]'::jsonb);end if;
 if r.lease_until>now() and r.lease_token is distinct from p_token then return jsonb_build_object('busy',true);end if;
 update outxout_sync_runs set lease_token=p_token,lease_until=now()+interval '110 seconds',heartbeat_at=now() where id=p_run;
 update pipeline_runs set updated_at=now() where id=p_run and status='running';
 -- Catalogue/API observations supersede redundant detail downloads, not missing pages.
 update outxout_sync_work w set status='done',completed_at=now() where w.run_id=p_run and w.status='pending' and w.kind='detail'
 and exists(select 1 from outxout_sync_entities e where e.last_seen_run=p_run and 'https://outxout.com/'||e.source_entity_id=w.url);
 select coalesce(jsonb_agg(to_jsonb(w)),'[]') into jobs from(select * from outxout_sync_work where run_id=p_run and status='pending' and retry_at<=now() order by priority,id limit 12)w;
 if jobs='[]' and not exists(select 1 from outxout_sync_work where run_id=p_run and status='pending') then
  if exists(select 1 from outxout_sync_work where run_id=p_run and status='failed') then
   update outxout_sync_runs set phase='failed',error='source_work_failed_after_retries',lease_until=null where id=p_run;
   update pipeline_runs set status='failed',error_message='Out x Out source work failed; inspect outxout_sync_work',completed_at=now(),updated_at=now() where id=p_run;
   return jsonb_build_object('phase','failed','jobs','[]'::jsonb);
  end if;
  update outxout_sync_runs set phase='process' where id=p_run;r.phase:='process';
 end if;
 return jsonb_build_object('phase',r.phase,'jobs',jobs,'scope',r.scope);
end $$;

create function public.outxout_ingest(p_run uuid,p_items jsonb) returns void language plpgsql set search_path=public,extensions as $$
declare item jsonb;n jsonb;raw jsonb;sid text;tab text;native text;known outxout_sync_entities%rowtype;stage ingestion_staging%rowtype;
 oldfields jsonb;fields jsonb;cur jsonb;patch jsonb;conflicts jsonb;k text;v jsonb;owned boolean;target uuid;stage_id uuid;why text;count_targets integer;
begin
 for item in select value from jsonb_array_elements(p_items) loop
  sid:=item->>'source_entity_id';tab:=item->>'target_table';n:=item->'normalized';raw:=item->'raw';native:=nullif(n->'metadata'->>'source_native_id','');
  if tab not in('events','venues','organizations') or sid is null then raise exception 'invalid_source_entity';end if;
  perform pg_advisory_xact_lock(hashtextextended('outxout:'||tab||':'||coalesce(native,sid),0));
  select * into known from outxout_sync_entities where source_entity_id=sid for update;
  if not found and native is not null then
   select count(distinct target_id) into count_targets from outxout_sync_entities where target_table=tab and native_id=native;
   if count_targets>1 then raise exception 'ambiguous_native_identity: %',native;end if;
   select * into known from outxout_sync_entities where target_table=tab and native_id=native order by target_id nulls last limit 1;
  end if;
  if known.last_seen_run=p_run and known.source_entity_id=sid then continue;end if;
  target:=known.target_id;stage_id:=known.staging_id;
  fields:=outxout_source_fields(n,tab);oldfields:=outxout_source_fields(known.normalized,tab);patch:='{}';conflicts:='[]';cur:=null;why:=null;
  if target is not null then
   execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into cur using target;
   if cur is null or cur->>'duplicate_of_id' is not null then why:='canonical_missing_or_redirected';end if;
  end if;
  if (known.staging_id is not null and fields=oldfields and coalesce(n->'metadata'->>'identity_review_required','false')='false') then why:='unchanged';
  elsif target is not null and cur is not null then
   owned:=cur->>'data_source'='outxout';
   for k,v in select key,value from jsonb_each(fields) loop
    if v is not distinct from oldfields->k then continue;end if;
    if k like '\_\_%' escape '\' then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','changed_media_tags_or_service_scope_requires_review'));continue;
    end if;
    if (tab='events' and k in('title','start_date','end_date') and (cur->'enrichment_status'->'date_confirmation'->>'state' in('confirmed','needs_review') or n->'metadata'->>'date_status'='unconfirmed'))
       or (k='address' and cur->'enrichment_status'?'current_location_verified')
       or (cur->'field_provenance'->k->>'source' is not null and cur->'field_provenance'->k->>'source' not like 'outxout%') then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','protected_verified_or_reviewed_field'));continue;
    end if;
    if (cur->k is null or cur->k='null' or cur->k='""' or cur->k='{}') or (owned and cur->k is not distinct from oldfields->k) then patch:=patch||jsonb_build_object(k,v);
    elsif v is distinct from cur->k then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','existing_value_not_owned_by_source'));end if;
   end loop;
   if jsonb_array_length(coalesce(item->'validation_errors','[]'))>0 or coalesce(n->'metadata'->>'identity_review_required','false')='true' then patch:='{}';conflicts:=conflicts||'[{"reason":"new_source_facts_require_validation"}]';end if;
   -- Missing/moved source geography is held, never used to move a current or historical record.
   if n->'location'->>'country' is distinct from known.normalized->'location'->>'country' or n->'location'->>'city' is distinct from known.normalized->'location'->>'city' then
    patch:=patch-'address';conflicts:=conflicts||'[{"reason":"source_geography_changed_or_incomplete"}]';
   end if;
   if patch<>'{}' then
    execute format('update public.%1$I t set %2$s,updated_at=now() from jsonb_populate_record(null::public.%1$I,$1) d where t.id=$2',tab,(select string_agg(format('%1$I=d.%1$I',key),',') from jsonb_each(patch))) using patch,target;
   end if;
   why:=case when conflicts<>'[]' then 'held' when patch<>'{}' then 'updated' else 'unchanged' end;
   if known.source_entity_id is distinct from sid and native is not null then
    if tab='events' then
     insert into event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
      values(target,'outxout',sid,n->'metadata'->>'url',n,encode(extensions.digest(n::text,'sha256'),'hex'),.99,false,now(),now()) on conflict(source_slug,source_entity_id) do nothing;
    elsif tab='venues' then
     insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
      values(target,'outxout',sid,n->'metadata'->>'url',n,encode(extensions.digest(n::text,'sha256'),'hex'),.99,false,now(),now()) on conflict(source_slug,source_entity_id) do nothing;
    end if;
   end if;
  else
   select * into stage from ingestion_staging where source_name='outxout' and source_entity_id=sid order by created_at desc limit 1 for update;
   if found then stage_id:=stage.id;target:=stage.target_record_id;
   else
    insert into ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,raw_data,normalized_data,pipeline_run_id,job_id,node_id,ai_validation_status,dedup_status,review_status)
    values('outxout','outxout',sid,case tab when 'events' then 'event' when 'venues' then 'venue' else 'organization' end,tab,raw,n,p_run,p_run,'outxout','pending','pending',case when n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then 'pending_review' else 'auto' end) returning id into stage_id;
   end if;
   why:='staged';
  end if;
  if conflicts<>'[]' and stage_id is not null and not exists(select 1 from review_queue where entity_type='ingestion_staging' and entity_id=stage_id and status='pending' and details->>'reason'='outxout_source_change') then
   insert into review_queue(entity_type,entity_id,review_type,status,details) values('ingestion_staging',stage_id,'validate_flag','pending',jsonb_build_object('reason','outxout_source_change','source','outxout','run_id',p_run,'conflicts',conflicts,'source_url',n->'metadata'->>'url','proposed_normalized_data',n));
  end if;
  insert into outxout_sync_changes(run_id,source_entity_id,staging_id,target_id,outcome,previous_data,proposed_data,applied_patch,conflicts)
   values(p_run,sid,stage_id,target,why,known.normalized,n,patch,conflicts)
   on conflict(run_id,source_entity_id) do nothing;
  insert into outxout_sync_entities(source_entity_id,target_table,native_id,staging_id,target_id,normalized,last_seen_run)
   values(sid,tab,native,stage_id,target,n,p_run)
   on conflict(source_entity_id) do update set native_id=coalesce(excluded.native_id,outxout_sync_entities.native_id),normalized=excluded.normalized,staging_id=excluded.staging_id,target_id=excluded.target_id,last_seen_run=p_run,last_seen_at=now();
  update outxout_sync_runs set observed=observed+1,changed=changed+(why in('updated','staged'))::int,unchanged=unchanged+(why='unchanged')::int,held=held+(why='held')::int where id=p_run;
 end loop;
end $$;

create function public.outxout_finish_work(p_run uuid,p_token uuid,p_work bigint,p_items jsonb default '[]',p_tasks jsonb default '[]',p_error text default null) returns void
language plpgsql set search_path=public as $$
declare task jsonb;
begin
 if not exists(select 1 from outxout_sync_runs where id=p_run and lease_token=p_token and lease_until>now() and phase='collect' for update) then raise exception 'lease_expired';end if;
 if not exists(select 1 from outxout_sync_work where id=p_work and run_id=p_run and status='pending' for update) then return;end if;
 if p_error is not null then
  update outxout_sync_work set attempts=attempts+1,error=p_error,status=case when attempts>=2 then 'failed' else 'pending' end,retry_at=now()+interval '1 minute' where id=p_work;return;
 end if;
 perform outxout_ingest(p_run,p_items);
 for task in select value from jsonb_array_elements(p_tasks) loop
  insert into outxout_sync_work(run_id,kind,url,payload,priority) values(p_run,task->>'kind',task->>'url',coalesce(task->'payload','{}'),coalesce((task->>'priority')::int,10)) on conflict do nothing;
 end loop;
 update outxout_sync_work set status='done',completed_at=now(),error=null where id=p_work;
end $$;

create function public.outxout_release(p_run uuid,p_token uuid) returns void language sql set search_path=public as $$
 update outxout_sync_runs set lease_until=null,heartbeat_at=now() where id=p_run and lease_token=p_token;
$$;

create function public.outxout_commit_batch(p_run uuid,p_limit integer default 20) returns jsonb language plpgsql set search_path=public,extensions as $$
declare s ingestion_staging%rowtype;n jsonb;co uuid;ci uuid;oid uuid;matches uuid[];res record;ct integer:=0;held integer:=0;sl text;
begin
 for s in select * from ingestion_staging where source_name='outxout' and pipeline_run_id=p_run and disposition='pending' and ai_validation_status='approved' and dedup_status in('unique','duplicate') and review_status in('auto','approved') order by case target_table when 'venues' then 0 when 'organizations' then 1 else 2 end,created_at limit least(p_limit,50) for update skip locked loop
  begin
   n:=s.normalized_data;
   if n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then
    update ingestion_staging set review_status='pending_review',ai_validation_status='needs_review',error_message='outxout_requires_official_verification' where id=s.id;held:=held+1;continue;
   end if;
   if s.target_table='events' then
    -- Identity links from this publisher are stronger than coincident name/geography.
    select target_id into oid from outxout_sync_entities where source_entity_id='venue/'||(n->'metadata'->>'source_venue_slug') and target_table='venues';
    if oid is not null then
     update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{venue_id}',to_jsonb(oid::text)) where id=s.id;
    end if;
    perform * from commit_event_staging_item(s.id,'outxout-backend-sync');
   elsif s.target_table='venues' then perform * from commit_venue_staging_item(s.id,'outxout-backend-sync');
   else
    co:=null;ci:=null;oid:=null;
    select id into co from countries where code=n->'location'->>'country' and duplicate_of_id is null limit 1;
    if co is null then raise exception 'organization_country_unverified';end if;
    ci:=city_pick_in_country(co,n->'location'->>'city',n->'location'->>'state',false);
    if ci is null then raise exception 'organization_city_unverified';end if;
    perform pg_advisory_xact_lock(hashtextextended('outxout-org:'||normalize_name(n->>'name')||ci::text,0));
    select array_agg(id) into matches from organizations where duplicate_of_id is null and normalize_name(name)=normalize_name(n->>'name') and city_id=ci and country_id=co;
    if cardinality(matches)>1 then raise exception 'ambiguous_organization_identity';end if;
    if s.dedup_status='duplicate' and (cardinality(matches) is distinct from 1 or matches[1] is distinct from s.dedup_match_id) then raise exception 'organization_match_not_exact';end if;
    if cardinality(matches)=1 then oid:=matches[1];
    else
     sl:=trim(both '-' from regexp_replace(lower(n->>'name'),'[^a-z0-9]+','-','g'))||'-outxout-'||substr(md5(s.source_entity_id),1,8);
     insert into organizations(name,slug,description,roles,website,email,phone,address,state,city_id,country_id,status,field_provenance)
      values(n->>'name',sl,n->>'description',array['community'],n->'contacts'->>'website',n->'contacts'->>'email',n->'contacts'->>'phone',n->'location'->>'address',n->'location'->>'state',ci,co,'draft',jsonb_build_object('outxout',jsonb_build_object(s.source_entity_id,jsonb_build_object('source_url',n->'metadata'->>'url','at',now())))) returning id into oid;
    end if;
    update ingestion_staging set target_record_id=oid,disposition=case when cardinality(matches)=1 then 'updated' else 'inserted' end,processed_at=now() where id=s.id;
   end if;
   select target_record_id into oid from ingestion_staging where id=s.id;
   update outxout_sync_entities set target_id=oid where staging_id=s.id;
   update outxout_sync_changes set target_id=oid,outcome='committed' where run_id=p_run and staging_id=s.id;
   ct:=ct+1;
  exception when others then
   update ingestion_staging set review_status='pending_review',error_message='outxout_backend_commit: '||sqlerrm where id=s.id;
   insert into review_queue(entity_type,entity_id,review_type,status,details) values('ingestion_staging',s.id,'validate_flag','pending',jsonb_build_object('source','outxout','reason','outxout_commit_requires_review','error',sqlerrm));held:=held+1;
  end;
 end loop;
 return jsonb_build_object('committed',ct,'held',held);
end $$;

create function public.outxout_complete(p_run uuid,p_token uuid) returns jsonb language plpgsql set search_path=public as $$
declare remaining integer;r outxout_sync_runs%rowtype;tot integer;holds integer;
begin
 select * into r from outxout_sync_runs where id=p_run and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'lease_expired';end if;
 select count(*) into remaining from ingestion_staging where source_name='outxout' and pipeline_run_id=p_run and disposition='pending' and review_status in('auto','approved') and (ai_validation_status='pending' or (ai_validation_status='approved' and dedup_status in('pending','unique','duplicate')));
 if remaining>0 then return jsonb_build_object('remaining',remaining,'complete',false);end if;
 select count(*) into holds from ingestion_staging where source_name='outxout' and pipeline_run_id=p_run and disposition='pending';
 select count(*) into tot from outxout_sync_work where run_id=p_run;
 update outxout_sync_runs set phase='completed',lease_until=null,heartbeat_at=now() where id=p_run;
 update pipeline_runs set status='completed',started_at=r.created_at,completed_at=now(),duration_ms=least(2147483647,extract(epoch from(now()-r.created_at))*1000)::int,items_total=r.observed,items_processed=r.observed,items_succeeded=r.observed-r.held,items_failed=0,updated_at=now(),context=context||jsonb_build_object('source_name','outxout','scope',r.scope,'observed',r.observed,'changed',r.changed,'unchanged',r.unchanged,'held',r.held+holds,'source_work',tot),node_states=jsonb_build_object('outxout',jsonb_build_object('status','completed','items_in',r.observed,'items_out',r.changed,'completed_at',now())) where id=p_run;
 return jsonb_build_object('complete',true,'observed',r.observed,'changed',r.changed,'held',r.held+holds);
end $$;

create function public.outxout_processing_counts(p_run uuid) returns jsonb language sql set search_path=public as $$
 select jsonb_build_object('validate',count(*) filter(where ai_validation_status='pending'),'dedup',count(*) filter(where ai_validation_status='approved' and dedup_status='pending'))
 from ingestion_staging where source_name='outxout' and pipeline_run_id=p_run and disposition='pending' and review_status in('auto','approved');
$$;

-- The runner is opt-in resumable: the shared executor must not treat a bounded
-- HTTP acknowledgement as completion. The registered source node uses this flag.
insert into public.pipeline_node_types(slug,category,display_name,description,edge_function,config_schema,input_ports,output_ports)
 values('source-outxout','source','Out x Out catalogue sync','Resumable public catalogue collection, validation, deduplication and guarded updates.','source-outxout','{"type":"object","properties":{"resumable":{"type":"boolean","default":true}}}', '[]','[{"id":"output","type":"items"}]') on conflict(slug) do update set edge_function=excluded.edge_function;
insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,is_enabled)
 values('outxout-catalogue-sync','Out x Out weekly catalogue sync','Backend-owned, checkpointed weekly imports. Protected changes are held for review.',
 '[{"id":"outxout","type":"source-outxout","position":{"x":100,"y":100},"data":{"label":"Discover → validate → deduplicate → apply","config":{"resumable":true}}}]','[]','{"source_name":"outxout"}',1,120,true)
 on conflict(name) do nothing;

create function public.outxout_tick(p_start boolean default false) returns bigint language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare rid uuid;local_now timestamp;due timestamp;request_id bigint;
begin
 perform pg_advisory_xact_lock(hashtext('outxout-sync-tick'));
 select id into rid from outxout_sync_runs where phase in('collect','process') limit 1;
 local_now:=now() at time zone 'Europe/Zurich';due:=date_trunc('week',local_now)+interval '2 days 8 hours';
 if rid is null and p_start and local_now>=due and not exists(select 1 from outxout_sync_runs where scope='catalogue' and created_at>=due at time zone 'Europe/Zurich') then rid:=outxout_open_run('cron');end if;
 if rid is null then return null;end if;
 if exists(select 1 from outxout_sync_runs where id=rid and lease_until>now()) then return null;end if;
 select net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-outxout',headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),body:=jsonb_build_object('run_id',rid),timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;

-- Disabled until the deployed preview/canary passes. Enable registry rows,
-- then call sync_automations_to_cron() to install their managed cron jobs.
insert into public.admin_automations(slug,name,description,trigger,action,schedule,enabled,managed_by)
 values
 ('outxout_weekly_sync','Out x Out weekly catalogue sync','Wednesday 08:00 Europe/Zurich; the due guard handles DST and prevents two starts.','{"type":"schedule","timezone":"Europe/Zurich"}',jsonb_build_object('type','cron','jobname','outxout_weekly_sync','command','select public.outxout_tick(true);'),'0 6,7 * * 3',false,'system'),
 ('outxout_sync_continue','Out x Out scan continuation','Resumes an active bounded scan only; never starts a new weekly scan.','{"type":"schedule"}',jsonb_build_object('type','cron','jobname','outxout_sync_continue','command','select public.outxout_tick(false);'),'* * * * *',false,'system')
 on conflict(slug) do nothing;

-- All data-plane RPCs are service-only, including invoker functions. The cron
-- entrypoint needs Vault privileges but is not executable by public clients.
do $$ declare r record;begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('outxout_source_fields','outxout_open_run','outxout_claim','outxout_ingest','outxout_finish_work','outxout_release','outxout_commit_batch','outxout_complete','outxout_processing_counts','outxout_tick') loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
