-- Queer Connect: native, checkpointed weekly pipeline. No new source auto-publishes.
create table public.queer_connect_sync_cursors (
  kind text primary key check(kind in('listings','venues','organizers','events')),
  scan_id uuid not null default gen_random_uuid(), run_id uuid references public.pipeline_runs(id) on delete set null,
  owner uuid, next_page integer not null default 1 check(next_page>0),
  expected_total integer, expected_pages integer, seen_count integer not null default 0,
  status text not null default 'idle' check(status in('idle','running','failed','completed')),
  lease_until timestamptz, started_at timestamptz, completed_at timestamptz, error_message text
);
create table public.queer_connect_source_records (
  source_id text primary key check(source_id ~ '^(listing|venue|organizer|event):[0-9]+$'),
  kind text not null check(kind in('listings','venues','organizers','events')),
  targets jsonb not null default '[]', raw_data jsonb, normalized_data jsonb,
  previous_normalized_data jsonb, content_hash text,
  last_seen_scan_id uuid, last_seen_at timestamptz, changed_at timestamptz,
  pending boolean not null default false, disposition text not null default 'seeded',
  staging_id uuid references public.ingestion_staging(id) on delete set null, applied_at timestamptz
);
create index queer_connect_source_pending on public.queer_connect_source_records(kind,source_id)where pending;
create index queer_connect_source_staging on public.queer_connect_source_records(staging_id)where staging_id is not null;
alter table public.queer_connect_sync_cursors enable row level security;
alter table public.queer_connect_source_records enable row level security;
revoke all on public.queer_connect_sync_cursors,public.queer_connect_source_records from public,anon,authenticated;
grant all on public.queer_connect_sync_cursors,public.queer_connect_source_records to service_role;

-- Seed canonical source identities from the completed import, including merges
-- and people corrected during review. A listing can describe an org AND venue.
with mappings as(
 select source_entity_id sid,'personalities' target,personality_id id from public.personality_sources where source_slug='queer-connect'
 union all select source_entity_id,'venues',venue_id from public.venue_sources where source_slug='queer-connect'
 union all select source_entity_id,'events',event_id from public.event_sources where source_slug='queer-connect'
 union all select k,'organizations',o.id from public.organizations o cross join lateral jsonb_object_keys(o.enrichment_status->'queer_connect'->'records')k where o.duplicate_of_id is null and o.enrichment_status?'queer_connect'
),aggregated as(select sid,jsonb_agg(distinct jsonb_build_object('table',target,'id',id))targets from mappings where sid is not null group by sid)
insert into public.queer_connect_source_records(source_id,kind,targets)
select sid,case split_part(sid,':',1)when'listing'then'listings'when'venue'then'venues'when'organizer'then'organizers'else'events'end,targets from aggregated;
insert into public.queer_connect_source_records(source_id,kind,disposition)
select distinct source_entity_id,'venues','reference'from public.ingestion_staging where source_name='queer-connect'and normalized_data?'reference_kind'and disposition='rejected' on conflict do nothing;
with latest as(select distinct on(source_entity_id)source_entity_id,normalized_data from public.ingestion_staging where source_name='queer-connect'and normalized_data is not null order by source_entity_id,created_at desc)
update public.queer_connect_source_records r set normalized_data=s.normalized_data from latest s where s.source_entity_id=r.source_id;

create function public.queer_connect_claim(p_kind text,p_run uuid,p_owner uuid)returns jsonb
language plpgsql security invoker set search_path='' as $qc$
declare r public.queer_connect_sync_cursors;begin
 if p_kind not in('listings','venues','organizers','events')or p_owner is null or p_run is null or not exists(select 1 from public.pipeline_runs where id=p_run and pipeline_name='queer-connect-weekly')then raise exception'invalid sync context';end if;
 insert into public.queer_connect_sync_cursors(kind)values(p_kind)on conflict do nothing;
 select * into r from public.queer_connect_sync_cursors where kind=p_kind for update;
 if r.status='completed'and r.run_id=p_run then return to_jsonb(r)||'{"done":true}'::jsonb;end if;
 if r.status='running'and r.owner<>p_owner and r.lease_until>now()then raise exception'collector already leased';end if;
 if r.status in('idle','completed')or(r.status='failed'and r.started_at<now()-interval'1 day')then
  update public.queer_connect_sync_cursors set scan_id=gen_random_uuid(),next_page=1,expected_total=null,expected_pages=null,seen_count=0,started_at=now(),completed_at=null where kind=p_kind;
 end if;
 update public.queer_connect_sync_cursors set owner=p_owner,run_id=p_run,status='running',lease_until=now()+interval'90 seconds',error_message=null where kind=p_kind returning * into r;
 return to_jsonb(r);
end $qc$;

create function public.queer_connect_stage_page(p_kind text,p_run uuid,p_owner uuid,p_page integer,p_total integer,p_pages integer,p_items jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $qc$
declare c public.queer_connect_sync_cursors;x jsonb;sid text;h text;n integer:=0;changed integer:=0;begin
 select * into c from public.queer_connect_sync_cursors where kind=p_kind for update;
 if not found or c.owner<>p_owner or c.run_id<>p_run or c.status<>'running'or c.next_page<>p_page then raise exception'checkpoint ownership or page mismatch';end if;
 if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)>50 or p_total<0 or p_pages<1 or p_page>p_pages then raise exception'invalid page';end if;
 if c.expected_total is not null and(c.expected_total<>p_total or c.expected_pages<>p_pages)then raise exception'upstream totals changed during scan; restart required';end if;
 for x in select value from jsonb_array_elements(p_items)loop
  sid:=x->'normalized'->>'sourceId';
  if sid is null or sid<>(case p_kind when 'listings' then 'listing:' when 'venues' then 'venue:' when 'organizers' then 'organizer:' else 'event:' end || (x->'raw'->>'id'))then raise exception'source identity mismatch';end if;
  if exists(select 1 from public.queer_connect_source_records where source_id=sid and last_seen_scan_id=c.scan_id)then raise exception'duplicate source identity across pages';end if;
  h:=encode(extensions.digest(((x->'raw')-array['views_count','date_modified','date_modified_gmt','modified','modified_date','modified_date_utc','popular','new','related_ids'])::text,'sha256'),'hex');
  insert into public.queer_connect_source_records(source_id,kind,raw_data,normalized_data,content_hash,last_seen_scan_id,last_seen_at,changed_at,pending,disposition)
  values(sid,p_kind,x->'raw',x->'normalized',h,c.scan_id,now(),now(),true,'pending')on conflict(source_id)do update set
   previous_normalized_data=case when queer_connect_source_records.content_hash is distinct from excluded.content_hash then queer_connect_source_records.normalized_data else queer_connect_source_records.previous_normalized_data end,
   raw_data=excluded.raw_data,normalized_data=excluded.normalized_data,content_hash=excluded.content_hash,last_seen_scan_id=c.scan_id,last_seen_at=now(),
   changed_at=case when queer_connect_source_records.content_hash is distinct from excluded.content_hash then now()else queer_connect_source_records.changed_at end,
   pending=queer_connect_source_records.pending or queer_connect_source_records.content_hash is distinct from excluded.content_hash;
  n:=n+1;
 end loop;
 if c.seen_count+n>p_total or(p_page=p_pages and c.seen_count+n<>p_total)then raise exception'incomplete source coverage: % / %',c.seen_count+n,p_total;end if;
 update public.queer_connect_sync_cursors set next_page=p_page+1,expected_total=p_total,expected_pages=p_pages,seen_count=seen_count+n,status=case when p_page=p_pages then'completed'else'running'end,completed_at=case when p_page=p_pages then now()else null end,lease_until=case when p_page=p_pages then null else now()+interval'90 seconds'end where kind=p_kind returning * into c;
 select count(*)into changed from public.queer_connect_source_records where last_seen_scan_id=c.scan_id and pending;
 return jsonb_build_object('items',n,'changed',changed,'next_page',c.next_page,'done',c.status='completed','total',c.expected_total);
end $qc$;

create function public.queer_connect_apply(p_run uuid,p_limit integer default 100)returns jsonb
language plpgsql security invoker set search_path='' as $qc$
declare r public.queer_connect_source_records;n jsonb;t jsonb;tid uuid;tab text;protected boolean;changes integer:=0;processed integer:=0;queued integer:=0;stage uuid;canonical uuid;v_before jsonb;v_after jsonb;adopted jsonb;begin
 if p_run is null or not exists(select 1 from public.pipeline_runs where id=p_run and pipeline_name='queer-connect-weekly')then raise exception'invalid run';end if;
 -- A later complete scan can supersede an interrupted snapshot. Retain its
 -- history without applying stale or disappeared records to canonical entities.
 update public.queer_connect_source_records stale set pending=false,disposition='not_seen'
 from public.queer_connect_sync_cursors c where stale.kind=c.kind and stale.pending and c.run_id=p_run and c.status='completed'and stale.last_seen_scan_id is not null and stale.last_seen_scan_id<>c.scan_id;
 for r in select *from public.queer_connect_source_records where pending or(disposition='review'and exists(select 1 from public.ingestion_staging s where s.id=queer_connect_source_records.staging_id and s.target_record_id is not null and s.disposition in('inserted','updated','committed')))order by case kind when'venues'then 0 when'organizers'then 1 when'listings'then 2 else 3 end,source_id limit greatest(1,least(p_limit,200))for update skip locked loop
  n:=r.normalized_data;processed:=processed+1;
  if r.disposition='review'and exists(select 1 from public.ingestion_staging s where s.id=r.staging_id and s.target_record_id is not null and s.disposition in('inserted','updated','committed'))then
   r.previous_normalized_data:=n;update public.queer_connect_source_records set previous_normalized_data=n where source_id=r.source_id;
  end if;
  if jsonb_array_length(r.targets)=0 and r.staging_id is not null then
   select jsonb_build_array(jsonb_build_object('table',s.target_table,'id',s.target_record_id))into adopted from public.ingestion_staging s where s.id=r.staging_id and s.source_name='queer-connect'and s.disposition in('inserted','updated','committed')and s.target_table in('personalities','organizations','venues','events')and s.target_record_id is not null;
   if adopted is not null then r.targets:=adopted;update public.queer_connect_source_records set targets=adopted where source_id=r.source_id;end if;
  end if;
  if jsonb_array_length(r.targets)=0 or jsonb_array_length(coalesce(n->'metadata'->'validation_errors','[]'))>0 or(r.previous_normalized_data->>'name'is not null and n->>'name'is distinct from r.previous_normalized_data->>'name')then
   if n->'metadata'->>'reference_kind'is not null and jsonb_array_length(r.targets)=0 then
    update public.queer_connect_source_records set disposition='reference',pending=false,applied_at=now()where source_id=r.source_id;continue;
   end if;
   tab:=case n->>'entityType'when'event'then'events'when'venue'then'venues'when'personality'then'personalities'else'organizations'end;
   insert into public.ingestion_staging(source_name,source_type,source_entity_id,entity_type,target_table,raw_data,normalized_data,payload_hash,pipeline_run_id,ai_validation_status,ai_validation_result,review_status,review_notes,dedup_status,dedup_match_id,dedup_match_table,disposition)
   values('queer-connect','queer-connect',r.source_id,n->>'entityType',tab,r.raw_data,n,encode(extensions.digest(jsonb_build_object('raw',r.raw_data,'normalized',n,'sync_contract',1)::text,'sha256'),'hex'),p_run,'needs_review',jsonb_build_object('method','deterministic-source-contract','errors',n->'metadata'->'validation_errors'),'pending_review','Weekly source sync: confirm identity and changes before commit.',case when jsonb_array_length(r.targets)>0 then'merge_candidate'else'pending'end,(select (value->>'id')::uuid from jsonb_array_elements(r.targets)where value->>'table'=tab limit 1),tab,'pending')on conflict do nothing returning id into stage;
   if stage is null then select id into stage from public.ingestion_staging where source_name='queer-connect'and source_entity_id=r.source_id order by created_at desc limit 1;end if;
   if stage is not null and not exists(select 1 from public.review_queue where entity_type='ingestion_staging'and entity_id=stage and status='pending')then
    insert into public.review_queue(entity_type,entity_id,review_type,status,details)values('ingestion_staging',stage,'source_sync_identity','pending',jsonb_build_object('source','queer-connect','source_id',r.source_id,'target_table',tab));
   end if;
   update public.queer_connect_source_records set pending=false,disposition='review',staging_id=stage,applied_at=now()where source_id=r.source_id;queued:=queued+1;continue;
  end if;
  for t in select value from jsonb_array_elements(r.targets)loop
   tab:=t->>'table';tid:=(t->>'id')::uuid;
   -- Follow canonical merges without any name-based identity matching.
   for i in 1..12 loop
    canonical:=null;
    if tab='personalities'then select duplicate_of_id into canonical from public.personalities where id=tid;
    elsif tab='organizations'then select duplicate_of_id into canonical from public.organizations where id=tid;
    elsif tab='venues'then select duplicate_of_id into canonical from public.venues where id=tid;
    elsif tab='events'then select duplicate_of_id into canonical from public.events where id=tid;end if;
    exit when canonical is null;tid:=canonical;
   end loop;
   if canonical is not null then raise exception'canonical identity redirect chain is cyclic or too deep';end if;
   if tab='personalities'then
    -- Reviewed profiles (including intentionally empty rejected links) stay intact.
    select to_jsonb(p)into v_before from public.personalities p where id=tid;
    protected:=coalesce(v_before->'enrichment_status','{}')?'draft_profile_review'or coalesce(nullif(v_before->'field_provenance','null'::jsonb),'{}')<>'{}';
    if not protected then
     update public.personalities p set website_url=coalesce(nullif(btrim(p.website_url),''),n->'contacts'->>'website'),updated_at=now()where id=tid and nullif(btrim(p.website_url),'')is null and nullif(n->'contacts'->>'website','')is not null;
    end if;
    update public.personality_sources set raw=r.raw_data,last_seen_at=now()where source_slug='queer-connect'and source_entity_id=r.source_id;
   elsif tab='organizations'then
    select to_jsonb(o)into v_before from public.organizations o where id=tid;
    protected:=coalesce(v_before->'enrichment_status','{}')?'draft_profile_review'or coalesce(v_before->'enrichment_status','{}')?'draft_profile_merge'or coalesce(nullif(v_before->'field_provenance','null'::jsonb),'{}')<>'{}';
    if not protected then
     update public.organizations o set email=coalesce(nullif(btrim(o.email),''),case when n->'contacts'->>'email'~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'then n->'contacts'->>'email'end),website=coalesce(nullif(btrim(o.website),''),n->'contacts'->>'website'),updated_at=now()where id=tid and((nullif(btrim(o.email),'')is null and n->'contacts'->>'email'~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')or(nullif(btrim(o.website),'')is null and nullif(n->'contacts'->>'website','')is not null));
    end if;
   elsif tab='venues'then
    select to_jsonb(v)into v_before from public.venues v where id=tid;
    protected:=coalesce(v_before->'enrichment_status','{}')?'draft_profile_review'or coalesce(v_before->'enrichment_status','{}')?'closure_review'or coalesce(v_before->'enrichment_status','{}')?'official_contact_verification';
    if not protected then
     update public.venues v set email=coalesce(nullif(btrim(v.email),''),case when n->'contacts'->>'email'~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'then n->'contacts'->>'email'end),updated_at=now()where id=tid and nullif(btrim(v.email),'')is null and n->'contacts'->>'email'~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
    end if;
   elsif tab='events'then
    select to_jsonb(e)into v_before from public.events e where id=tid;
    protected:=coalesce(v_before->'enrichment_status','{}')?'draft_profile_review'or coalesce(nullif(v_before->'field_provenance','null'::jsonb),'{}')<>'{}';
    -- Only replace dates still equal to the previous source observation. An
    -- editorial correction that differs from that baseline wins permanently.
    if not protected and r.previous_normalized_data->>'start_date'is not null then
     update public.events e set start_date=(n->>'start_date')::timestamptz,end_date=(n->>'end_date')::timestamptz,timezone=n->>'timezone',updated_at=now()
     where id=tid and e.start_date=(r.previous_normalized_data->>'start_date')::timestamptz and e.end_date=(r.previous_normalized_data->>'end_date')::timestamptz and(e.start_date,e.end_date,e.timezone)is distinct from((n->>'start_date')::timestamptz,(n->>'end_date')::timestamptz,n->>'timezone');
    end if;
   else raise exception'unsupported canonical target';end if;
   if tab='personalities'then select to_jsonb(p)into v_after from public.personalities p where id=tid;
   elsif tab='organizations'then select to_jsonb(o)into v_after from public.organizations o where id=tid;
   elsif tab='venues'then select to_jsonb(v)into v_after from public.venues v where id=tid;
   else select to_jsonb(e)into v_after from public.events e where id=tid;end if;
   if v_after is null then raise exception'missing canonical target % %',tab,tid;end if;
   if v_after is distinct from v_before then changes:=changes+1;end if;
  end loop;
  update public.queer_connect_source_records set pending=false,disposition='synced',applied_at=now()where source_id=r.source_id;
 end loop;
 return jsonb_build_object('items',processed,'updated',changes,'review',queued,'remaining',(select count(*)from public.queer_connect_source_records rr where rr.pending or(rr.disposition='review'and exists(select 1 from public.ingestion_staging s where s.id=rr.staging_id and s.target_record_id is not null and s.disposition in('inserted','updated','committed')))));
end $qc$;
revoke all on function public.queer_connect_claim(text,uuid,uuid),public.queer_connect_stage_page(text,uuid,uuid,integer,integer,integer,jsonb),public.queer_connect_apply(uuid,integer)from public,anon,authenticated;
grant execute on function public.queer_connect_claim(text,uuid,uuid),public.queer_connect_stage_page(text,uuid,uuid,integer,integer,integer,jsonb),public.queer_connect_apply(uuid,integer)to service_role;

insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema,input_ports,output_ports)
values('source-queer-connect','source','Queer Connect','Checkpointed source-ID matching with protected editorial data.','Globe','#8b5cf6','source-queer-connect','{"type":"object","properties":{"mode":{"type":"string","enum":["collect","validate","apply"]},"kind":{"type":"string","enum":["listings","venues","organizers","events"]}}}','[]','[{"id":"out","label":"Source records","type":"data"}]')on conflict(slug)do update set edge_function=excluded.edge_function,config_schema=excluded.config_schema,is_enabled=true;
insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema,input_ports,output_ports)
values('validate-queer-connect','validator','Verify Queer Connect coverage','Require complete source scans before applying updates.','CheckCircle','#22c55e','source-queer-connect','{}','[{"id":"in","label":"Source records","type":"data"}]','[{"id":"out","label":"Validated","type":"data"}]'),('apply-queer-connect','output','Sync Queer Connect records','Preserve reviewed data and queue new identities for review.','Database','#22c55e','source-queer-connect','{}','[{"id":"in","label":"Validated","type":"data"}]','[]')on conflict(slug)do update set edge_function=excluded.edge_function,is_enabled=true;
insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,schedule,is_template,is_enabled)
values('queer-connect-weekly','Queer Connect weekly sync','Monday source sync: resumable pagination, stable source IDs, protected reviewed fields, and review for new identities.','[{"id":"qc-listings","type":"source-queer-connect","position":{"x":0,"y":100},"data":{"label":"Directory listings","config":{"mode":"collect","kind":"listings"}}},{"id":"qc-venues","type":"source-queer-connect","position":{"x":260,"y":100},"data":{"label":"Calendar venues","config":{"mode":"collect","kind":"venues"}}},{"id":"qc-organizers","type":"source-queer-connect","position":{"x":520,"y":100},"data":{"label":"Calendar organizers","config":{"mode":"collect","kind":"organizers"}}},{"id":"qc-events","type":"source-queer-connect","position":{"x":780,"y":100},"data":{"label":"Event occurrences","config":{"mode":"collect","kind":"events"}}},{"id":"qc-validate","type":"validate-queer-connect","position":{"x":1040,"y":100},"data":{"label":"Verify source coverage","config":{"mode":"validate"}}},{"id":"qc-apply","type":"apply-queer-connect","position":{"x":1300,"y":100},"data":{"label":"Sync canonical records / queue review","config":{"mode":"apply"}}}]','[{"id":"q0","source":"qc-listings","target":"qc-venues"},{"id":"q1","source":"qc-venues","target":"qc-organizers"},{"id":"q2","source":"qc-organizers","target":"qc-events"},{"id":"q3","source":"qc-events","target":"qc-validate"},{"id":"q4","source":"qc-validate","target":"qc-apply"}]','{"source_name":"queer-connect","batch_size":100}',1,300,'0 3 * * 1',false,true)
on conflict(name)do update set display_name=excluded.display_name,description=excluded.description,nodes=excluded.nodes,edges=excluded.edges,default_context=excluded.default_context,schedule=excluded.schedule,is_enabled=true;
insert into public.ingestion_sources(name,slug,source_type,target_table,edge_function,is_enabled,requires_api_key,schedule)
values('Queer Connect','queer-connect','api','events','source-queer-connect',true,false,'0 3 * * 1')on conflict(slug)do update set edge_function=excluded.edge_function,is_enabled=true,schedule=excluded.schedule;
insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
values('pipeline_queer_connect_weekly','Queer Connect weekly sync','Monday 03:00 UTC. Runs the Queer Connect DAG with resumable collection and protected reviewed content.','system',true,'{"type":"schedule"}','[]',jsonb_build_object('type','cron','jobname','pipeline-queer-connect-weekly','command',$command$SELECT public.enqueue_workflow('pipeline-executor',jsonb_build_object('action','start','pipeline_name','queer-connect-weekly','triggered_by','cron'));$command$),'0 3 * * 1')on conflict(slug)do update set name=excluded.name,description=excluded.description,action=excluded.action,schedule=excluded.schedule,enabled=true;
select public.sync_automations_to_cron();
