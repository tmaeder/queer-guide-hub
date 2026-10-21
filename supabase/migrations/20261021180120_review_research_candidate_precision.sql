-- Keep per-attempt evidence across retries and source-version changes.
create table public.admin_review_research_attempts (
 id bigint generated always as identity primary key,case_id uuid not null references public.admin_review_cases(id),
 fingerprint text not null,lease_token uuid unique,status text not null,outcome jsonb not null,
 recorded_at timestamptz not null default now()
);
alter table public.admin_review_research_attempts enable row level security;
revoke all on public.admin_review_research_attempts from public,anon,authenticated;
grant all on public.admin_review_research_attempts to service_role;
grant usage,select on sequence public.admin_review_research_attempts_id_seq to service_role;
create index admin_review_research_attempts_case on public.admin_review_research_attempts(case_id,recorded_at desc);
insert into public.admin_review_research_attempts(case_id,fingerprint,status,outcome)
select case_id,fingerprint,'pilot_'||status,outcome from public.admin_review_research_jobs where outcome<>'{}';

create or replace function public.finish_admin_review_research_job(p_case_id uuid,p_lease_token uuid,p_status text,p_outcome jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_changed boolean;
begin
 if p_status not in ('completed','blocked','retry') then raise exception 'Invalid research result'; end if;
 insert into public.admin_review_research_attempts(case_id,fingerprint,lease_token,status,outcome)
 select j.case_id,j.fingerprint,p_lease_token,p_status,coalesce(p_outcome,'{}') from public.admin_review_research_jobs j
 where j.case_id=p_case_id and j.status='running' and j.lease_token=p_lease_token and j.lease_expires_at>now()
 on conflict(lease_token) do nothing;
 update public.admin_review_research_jobs j set status=case when p_status='retry' and attempts>=3 then 'blocked' else p_status end,
 outcome=coalesce(p_outcome,'{}'),next_attempt_at=now()+make_interval(hours=>case when attempts=1 then 1 else 6 end),
 lease_token=null,lease_expires_at=null,updated_at=now()
 where case_id=p_case_id and status='running' and lease_token=p_lease_token and lease_expires_at>now()
 and exists(select 1 from public.admin_review_cases c where c.id=j.case_id and c.active and c.fingerprint=j.fingerprint);
 v_changed:=found;
 if not v_changed then update public.admin_review_research_attempts set status='stale' where lease_token=p_lease_token; end if;
 return v_changed;
end $$;

-- Catalogue-only research can run in a large, inexpensive SQL batch. Network
-- attempts retain a separate three-attempt budget and do not starve behind it.
create function public.process_admin_review_local_research(p_batch integer default 100) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_token uuid; v_outcome jsonb; v_examined integer:=0; v_repaired integer:=0; v_ready integer:=0;
begin
 if not exists(select 1 from public.admin_automations where slug='review_research' and enabled) then return jsonb_build_object('skipped','paused'); end if;
 if not pg_try_advisory_xact_lock(hashtext('review_local_research')) then return jsonb_build_object('skipped','already_running'); end if;
 for r in select j.case_id from public.admin_review_research_jobs j join public.admin_review_cases c on c.id=j.case_id
 where c.active and c.family='venue' and c.fingerprint=j.fingerprint and j.status='queued' and j.outcome->>'local_search_complete' is distinct from 'true'
 order by c.created_at,j.case_id limit greatest(0,least(200,p_batch)) for update of j skip locked loop
  v_examined:=v_examined+1; v_token:=gen_random_uuid();
  update public.admin_review_research_jobs set status='running',lease_token=v_token,lease_expires_at=now()+interval '2 minutes',last_attempt_at=now() where case_id=r.case_id;
  v_outcome:=public.research_admin_review_local(r.case_id,v_token)||'{"local_search_complete":true}'::jsonb;
  insert into public.admin_review_research_attempts(case_id,fingerprint,lease_token,status,outcome)
   select case_id,fingerprint,v_token,'local_search',v_outcome from public.admin_review_research_jobs where case_id=r.case_id;
  update public.admin_review_research_jobs set status=case when v_outcome->>'repaired'='true' or v_outcome->>'decision_ready'='true' then 'completed' else 'queued' end,
   outcome=v_outcome,lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now() where case_id=r.case_id;
  if v_outcome->>'repaired'='true' then
   v_repaired:=v_repaired+1; update public.admin_review_cases set active=false,updated_at=now() where id=r.case_id;
  elsif v_outcome->>'decision_ready'='true' then v_ready:=v_ready+1; end if;
 end loop;
 return jsonb_build_object('examined',v_examined,'repaired',v_repaired,'ready',v_ready);
end $$;
revoke all on function public.process_admin_review_local_research(integer) from public,anon,authenticated;
grant execute on function public.process_admin_review_local_research(integer) to service_role;

-- Supersede the pilot's weak proposals; preserve them in the attempt journal.
update public.admin_review_cases set stage='research' where active and family='venue';
insert into public.admin_review_research_jobs(case_id,fingerprint)
select id,fingerprint from public.admin_review_cases where active and family='venue'
on conflict(case_id) do update set status='queued',attempts=0,outcome='{}',next_attempt_at=now(),lease_token=null,lease_expires_at=null,updated_at=now();
create or replace function public.research_admin_review_local(p_case_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare c public.admin_review_cases; e public.events; v_candidates jsonb; v_exact uuid[];
begin
 select x.* into c from public.admin_review_cases x join public.admin_review_research_jobs j on j.case_id=x.id
 where x.id=p_case_id and x.active and j.status='running' and j.lease_token=p_lease_token
 and j.lease_expires_at>now() and j.fingerprint=x.fingerprint;
 if not found then raise exception 'Research lease is no longer current' using errcode='40001'; end if;
 if c.family='venue' then
  select * into e from public.events where id=(c.item->>'entity_id')::uuid and duplicate_of_id is null;
  if not found then return jsonb_build_object('reason','Event is no longer canonical'); end if;
  if e.venue_id is not null then
   update public.event_quality_issues set status='resolved',resolved_at=now(),resolution='auto-research: event already has a canonical venue'
    where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open';
   update public.review_queue set status='resolved',resolved_at=now(),details=coalesce(details,'{}')||jsonb_build_object('resolution','venue_already_linked','resolved_automatically',true)
    where entity_type='event' and entity_id=e.id and review_type='venue_link_candidate' and status='pending';
   update public.event_quality_current set open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED') where event_id=e.id;
   return jsonb_build_object('repaired',true,'reason','Event already has a canonical venue'); end if;
  if exists(select 1 from public.cities p where p.duplicate_of_id is null and public.normalize_name(p.name)=public.normalize_name(e.venue_name))
   or exists(select 1 from public.queer_villages p where public.normalize_name(p.name)=public.normalize_name(e.venue_name)) then
   return jsonb_build_object('decision_ready',false,'reason','The supplied venue name identifies a geographic place; source research must establish a specific venue','source_url',coalesce(e.website,e.ticket_url));
  end if;
  select jsonb_agg(to_jsonb(v)) into v_candidates from (
   select v.id,v.name,v.address,v.website,v.city_id,v.country_id,
    public.dedup_despace(v.name)=public.dedup_despace(e.venue_name) exact_name,
    case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null then
      6371008.8*2*asin(least(1.0,sqrt(power(sin(radians(v.latitude-e.latitude)/2),2)+cos(radians(e.latitude))*cos(radians(v.latitude))*power(sin(radians(v.longitude-e.longitude)/2),2)))) end distance_m
   from public.venues v where v.city_id=e.city_id and v.country_id=e.country_id and v.duplicate_of_id is null and v.closed_at is null
    and (public.dedup_despace(v.name)=public.dedup_despace(e.venue_name) or similarity(v.name,e.venue_name)>=0.80)
   order by (public.dedup_despace(v.name)=public.dedup_despace(e.venue_name)) desc,similarity(v.name,e.venue_name) desc,v.id limit 6) v;
  select array_agg((v->>'id')::uuid) into v_exact from jsonb_array_elements(coalesce(v_candidates,'[]')) v
   where v->>'exact_name'='true';
  if cardinality(v_exact)=1 and e.is_public and coalesce(e.status,'active') not in ('archived','cancelled')
   and not exists(select 1 from jsonb_array_elements(v_candidates) v where v->>'id'=v_exact[1]::text and (v->>'distance_m')::numeric>=500)
   and not exists(select 1 from public.events other where other.id<>e.id
    and (other.venue_id=v_exact[1] or other.venue_id is null and other.city_id=e.city_id and public.dedup_despace(other.venue_name)=public.dedup_despace(e.venue_name))
    and lower(btrim(other.title))=lower(btrim(e.title)) and other.start_date=e.start_date and other.duplicate_of_id is null) then
   update public.events set venue_id=v_exact[1],updated_at=now(),field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object(
    'venue_id',jsonb_build_object('source','review_research','method','unique_exact_name_same_city_country','source_id',v_exact[1],'at',now(),'human_reviewed',false))
   where id=e.id and venue_id is null;
   update public.event_quality_issues set status='resolved',resolved_at=now(),resolution='auto-research: unique exact canonical venue in same city/country'
    where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open';
   update public.event_quality_current set open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED') where event_id=e.id;
   return jsonb_build_object('repaired',true,'venue_id',v_exact[1],'reason','Linked unique exact canonical venue');
  end if;
  return jsonb_build_object('candidates',coalesce(v_candidates,'[]'),'decision_ready',coalesce(jsonb_array_length(v_candidates),0)>0,
   'reason',case when v_candidates is null then 'No canonical venue candidates in the same city and country' else 'Compare the supplied venue with canonical candidates' end,
   'source_url',coalesce(e.website,e.ticket_url),'venue_name',e.venue_name,'city',e.city,'address',e.address);
 elsif c.family='business_link' then
  -- Name candidates are evidence for review, never ownership or identity assertions.
  select jsonb_agg(to_jsonb(v)) into v_candidates from (
   select o.id,o.name,o.website,o.address,o.city_id,o.country_id from public.organizations src join public.organizations o
    on o.id<>src.id and o.duplicate_of_id is null and o.city_id=src.city_id and o.country_id=src.country_id
    and public.dedup_despace(o.name)=public.dedup_despace(src.name)
   where src.id=(c.item->>'entity_id')::uuid limit 6) v;
  return jsonb_build_object('candidates',coalesce(v_candidates,'[]'),'decision_ready',false,
   'reason','Business linkage requires an explicit relationship and corroborating source; name matches do not establish ownership');
 end if;
 return jsonb_build_object('reason','External identity research required');
end $$;

create or replace function public.refresh_admin_review_worklist() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_union text; v_count integer; v_started timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtext('admin_review_worklist')) then
   return jsonb_build_object('skipped','already_running'); end if;
 if exists(select 1 from public.admin_automations where slug='review_worklist_refresh' and not enabled) then
  return jsonb_build_object('skipped','paused'); end if;
 perform public.repair_admin_review_mechanical(200,false);
 select string_agg(format(
 'select to_jsonb(u)||jsonb_build_object(''source_label'',%L,''risk'',coalesce(u.risk_flags->>''risk'',%L),''public_impact'',%L::boolean,''sla_hours'',%L::integer,''can_reopen'',%L::boolean) item,%L::text min_role from public.%I u where not exists(select 1 from public.admin_review_finding_codes f where f.queue_key=%L and f.subtitle_match=u.subtitle)',
 r.label,r.risk,r.public_impact,r.sla_hours,r.can_reopen,r.min_role,r.view_name,r.queue_key),' union all ' order by r.queue_key)
 into v_union from public.admin_review_sources r where active;
 if v_union is null then raise exception 'No active review sources'; end if;
 create temporary table if not exists review_worklist_refresh_ids(id uuid primary key) on commit drop;
 truncate review_worklist_refresh_ids;
 execute format($q$
 with raw as (%s), keyed as (
 select item,min_role,public.review_case_key(item) case_key,public.review_case_family(item) family,
 case when public.review_case_family(item)='venue' then (
  select jsonb_build_object('venue_name',e.venue_name,'venue_id',e.venue_id,'city_id',e.city_id,'country_id',e.country_id,
   'catalogue_updated_at',(select max(v.updated_at) from public.venues v where v.city_id=e.city_id)) from public.events e where e.id=(item->>'entity_id')::uuid)
 when public.review_case_family(item)='city_identity' then (
  select jsonb_build_object('qid',c.wikidata_qid,'audit',c.field_provenance->'city_place_audit') from public.cities c where c.id=(item->>'entity_id')::uuid)
 else null end context from raw),
 grouped as (select md5('review-case:'||case_key)::uuid id,case_key,family,
  case when max(case min_role when 'admin' then 3 when 'moderator' then 2 else 1 end)=3 then 'admin'
       when max(case min_role when 'admin' then 3 when 'moderator' then 2 else 1 end)=2 then 'moderator' else 'editor' end required_role,
  ((jsonb_agg(item order by (item->>'queue_type'='general-review') desc,item->>'queue_type',item->>'id'))->0)||jsonb_build_object(
    'risk',case when bool_or(item->>'risk'='safety') then 'safety' when bool_or(item->>'risk'='integrity') then 'integrity' else 'routine' end) item,
  jsonb_agg(item order by item->>'queue_type',item->>'id') members,
  md5(jsonb_agg(jsonb_build_object('queue',item->>'queue_type','id',item->>'id','meta',(item->'meta')#-'{details,observed_at}','context',context) order by item->>'queue_type',item->>'id')::text) fingerprint,
  min((item->>'created_at')::timestamptz) created_at,
  max(case when jsonb_typeof(item#>'{meta,details,candidates}')='array' then jsonb_array_length(item#>'{meta,details,candidates}') else 0 end) candidate_count
 from keyed group by case_key,family), saved as (
 insert into public.admin_review_cases(id,case_key,family,stage,required_role,item,members,fingerprint,active,created_at,updated_at)
 select id,case_key,family,case when family in ('city_identity','business_link','venue') then 'research' else 'ready' end,
 required_role,item,members,fingerprint,true,created_at,now() from grouped
 on conflict(id) do update set stage=excluded.stage,required_role=excluded.required_role,item=excluded.item,members=excluded.members,
 fingerprint=excluded.fingerprint,active=true,updated_at=now() returning id)
 insert into review_worklist_refresh_ids select id from saved
 $q$,v_union);
 get diagnostics v_count=row_count;
 update public.admin_review_cases c set active=false,updated_at=now()
 where active and not exists(select 1 from review_worklist_refresh_ids x where x.id=c.id);
 insert into public.admin_review_research_jobs(case_id,fingerprint)
 select id,fingerprint from public.admin_review_cases where active and stage='research'
 on conflict(case_id) do update set fingerprint=excluded.fingerprint,status='queued',attempts=0,
   next_attempt_at=now(),lease_token=null,lease_expires_at=null,outcome='{}',updated_at=now()
 where admin_review_research_jobs.fingerprint<>excluded.fingerprint;
 perform public.process_admin_review_local_research(100);
 update public.admin_automations set last_run_at=v_started,last_run_status='success' where slug='review_worklist_refresh';
 return jsonb_build_object('cases',v_count,'elapsed_ms',extract(epoch from clock_timestamp()-v_started)*1000);
end $$;

create or replace function public.get_admin_review_case_details(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.admin_review_cases; j public.admin_review_research_jobs; v_members jsonb; v_candidates jsonb;
begin
 if not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then raise exception 'Staff access required' using errcode='42501'; end if;
 select * into c from public.admin_review_cases where id=p_case_id and active;
 if not found or not public.review_case_can_read(c.required_role) or not public.review_case_sources_authorized(c.members) then return null; end if;
 select * into j from public.admin_review_research_jobs where case_id=c.id and fingerprint=c.fingerprint;
 select jsonb_agg(m||jsonb_build_object('current_record',case when m->>'entity_table'='events' then
 (select jsonb_build_object('title',e.title,'start_date',e.start_date,'end_date',e.end_date,'venue_name',e.venue_name,
 'website',e.website,'ticket_url',e.ticket_url,'images',e.images,'organizer_name',e.organizer_name,'series_key',e.series_key,'city',e.city,'address',e.address,'updated_at',e.updated_at)
 from public.events e where e.id=(m->>'entity_id')::uuid) else null end)) into v_members from jsonb_array_elements(c.members) m;

 if c.family='venue' then
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into v_candidates from (
   select distinct v.id,v.name,v.address,v.website,v.city_id,v.country_id,
    case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null then
     6371008.8*2*asin(least(1.0,sqrt(power(sin(radians(v.latitude-e.latitude)/2),2)+cos(radians(e.latitude))*cos(radians(v.latitude))*power(sin(radians(v.longitude-e.longitude)/2),2)))) end distance_m
   from public.venues v join public.events e on e.id=(c.item->>'entity_id')::uuid
   where v.city_id=e.city_id and v.country_id=e.country_id and v.closed_at is null and v.duplicate_of_id is null
   and v.id::text in (
    select coalesce(candidate->>'id',candidate->>'venue_id') from jsonb_array_elements(coalesce(nullif(j.outcome->'candidates','null'::jsonb),'[]'::jsonb)) candidate
    union all
    select coalesce(candidate->>'id',candidate->>'venue_id') from jsonb_array_elements(c.members) m
     cross join lateral jsonb_array_elements(coalesce(nullif(m#>'{meta,details,candidates}','null'::jsonb),'[]'::jsonb)) candidate
   ) order by v.name,v.id limit 12
  ) v;
 end if;
 return jsonb_build_object('id',c.id,'family',c.family,'fingerprint',c.fingerprint,'members',v_members,'candidates',v_candidates,'research',to_jsonb(j),
 'attempt_history',(select coalesce(jsonb_agg(x),'[]') from (select status,outcome,recorded_at from public.admin_review_research_attempts where case_id=c.id order by recorded_at desc limit 10) x),
 'research_enabled',(select enabled from public.admin_automations where slug='review_research'),
 'item',c.item||jsonb_build_object('id',c.id,'queue_type','review-case','can_reopen',false,'meta',c.item->'meta'||jsonb_build_object(
 'original_queue_type',c.item->>'queue_type','original_item_id',c.item->>'id','review_case',jsonb_build_object('id',c.id,'family',c.family,
 'fingerprint',c.fingerprint,'member_count',jsonb_array_length(c.members),'stage',case when c.stage='ready' or j.outcome->>'decision_ready'='true' then 'ready' when j.status='blocked' then 'blocked' else 'research' end))));
end $$;
select public.refresh_admin_review_worklist();
