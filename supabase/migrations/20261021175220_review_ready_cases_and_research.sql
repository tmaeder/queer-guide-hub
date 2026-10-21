-- Keep raw detector rows intact. This is a separate, reconciled human worklist.
create table public.admin_review_cases (
 id uuid primary key, case_key text not null unique, family text not null,
 stage text not null check(stage in ('ready','research')), required_role text not null,
 item jsonb not null, members jsonb not null, fingerprint text not null,
 active boolean not null default true, created_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create table public.admin_review_research_jobs (
 case_id uuid primary key references public.admin_review_cases(id), fingerprint text not null,
 status text not null default 'queued' check(status in ('queued','running','retry','blocked','completed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_expires_at timestamptz, last_attempt_at timestamptz,
 outcome jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
alter table public.admin_review_cases enable row level security;
alter table public.admin_review_research_jobs enable row level security;
revoke all on public.admin_review_cases,public.admin_review_research_jobs from public,anon,authenticated;
grant all on public.admin_review_cases,public.admin_review_research_jobs to service_role;
create index admin_review_cases_active_stage on public.admin_review_cases(stage,created_at) where active;
create index admin_review_research_due on public.admin_review_research_jobs(next_attempt_at) where status in ('queued','retry','running');

create table public.admin_review_repairs (
 id bigint generated always as identity primary key,entity_type text not null,entity_id uuid not null,
 reason text not null,previous_value jsonb,next_value jsonb,created_at timestamptz not null default now()
);
alter table public.admin_review_repairs enable row level security;
revoke all on public.admin_review_repairs from public,anon,authenticated;
grant all on public.admin_review_repairs to service_role;
grant usage,select on sequence public.admin_review_repairs_id_seq to service_role;

create function public.repair_admin_review_mechanical(p_batch integer default 100,p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_counts integer:=0; v_neutral integer:=0; v_evidence jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtext('admin_review_mechanical')) then return jsonb_build_object('skipped','already_running'); end if;
 for r in select b.id,b.product_count,count(l.id)::integer actual from public.marketplace_brands b
 left join public.marketplace_listings l on l.brand_key=b.brand_key and l.status='active' and l.duplicate_of_id is null
 where exists(select 1 from public.entity_quality_findings f where f.entity_type='marketplace_brand' and f.entity_id=b.id
  and f.reason_code='product_count_drift' and f.state='fail' and f.waived_at is null)
 group by b.id having b.product_count<>count(l.id) order by b.id limit greatest(0,least(200,p_batch)) loop
  v_counts:=v_counts+1;
  if not p_dry_run then
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('marketplace_brand',r.id,'recompute_active_canonical_product_count',to_jsonb(r.product_count),to_jsonb(r.actual));
   update public.marketplace_brands set product_count=r.actual,updated_at=now() where id=r.id;
   update public.entity_quality_findings set state='pass',reason_code='product_count_matches',checked_at=now(),
    evidence=jsonb_build_object('stored',r.actual,'actual',r.actual,'repair_source','review_research')
    where entity_type='marketplace_brand' and entity_id=r.id and dimension='product_linkage' and reason_code='product_count_drift';
  end if;
 end loop;
 -- "Other" is a valid neutral category. With no proposed subtype there is no
 -- choice to adjudicate. Keep the detector/evidence hash and explicitly record
 -- a machine disposition; never invent a subtype or attribute human review.
 for r in select i.id,i.event_id from public.event_quality_issues i join public.events e on e.id=i.event_id
 where i.status='open' and i.issue_code='CATEGORY_UNRESOLVED' and i.severity<>'critical' and e.event_type='other'
 and public.infer_event_type(e.title,e.description)->>'event_type'='other'
 and (public.infer_event_type(e.title,e.description)->>'confidence')::numeric=0
 order by i.id limit greatest(0,least(200,p_batch)) for update of i skip locked loop
  v_neutral:=v_neutral+1;
  if not p_dry_run then
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('event',r.event_id,'neutral_category_has_no_supported_subtype',jsonb_build_object('issue_id',r.id,'status','open'),'{"status":"accepted","event_type":"other"}');
   select evidence into v_evidence from public.event_quality_findings(r.event_id) where issue_code='CATEGORY_UNRESOLVED';
   update public.event_quality_issues set status='accepted',reviewed_at=null,reviewed_by=null,
    evidence=coalesce(v_evidence,evidence),evidence_hash=coalesce(md5(v_evidence::text),evidence_hash),
    resolution='auto-policy: neutral category retained; no supported subtype is proposed. No subtype verification is claimed.'
    where id=r.id;
   update public.event_quality_current set open_issue_codes=array_remove(open_issue_codes,'CATEGORY_UNRESOLVED') where event_id=r.event_id;
  end if;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'product_counts',v_counts,'neutral_categories',v_neutral);
end $$;

create function public.review_case_family(p jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case
 when p->>'queue_type'='event-quality' and p#>>'{meta,issue_code}' in ('IMAGE_REUSED','IMAGE_CONTENT_REUSED') then 'artwork'
 when p->>'queue_type'='general-review' and p#>>'{meta,review_type}'='venue_link_candidate'
   or p->>'queue_type'='event-quality' and p#>>'{meta,issue_code}'='NAMED_VENUE_UNLINKED' then 'venue'
 when p->>'queue_type'='general-review' and p#>>'{meta,review_type}'='CITY_LIFECYCLE_UNRESOLVED'
   or p->>'queue_type'='geography' and p->>'content_type'='city' and p#>>'{meta,checks,reason}'='No corroborated settlement classification' then 'city_identity'
 when p->>'queue_type'='business-quality' and p#>>'{meta,reason_code}' in ('linkage_unresolved','organization_link_pending') then 'business_link'
 else 'record' end
$$;
create function public.review_case_key(p jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case public.review_case_family(p)
 when 'artwork' then 'artwork:'||coalesce(nullif(p#>>'{meta,evidence,content_hash}',''),
   md5(coalesce(p#>'{meta,evidence,images}',p#>'{meta,evidence}')::text))
 when 'venue' then 'venue:'||coalesce(p->>'entity_id',p->>'id')
 when 'city_identity' then 'city_identity:'||coalesce(p->>'entity_id',p->>'id')
 when 'business_link' then 'business_link:'||coalesce(p->>'entity_id',p->>'id')
 else p->>'queue_type'||':'||(p->>'id') end
$$;
create function public.review_case_can_read(p_role text) returns boolean
language sql stable set search_path=public,pg_temp as $$
 select public.has_role_jwt('admin'::public.app_role)
 or p_role='moderator' and public.has_role_jwt('moderator'::public.app_role)
 or p_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[])
$$;
create function public.review_case_sources_authorized(p_members jsonb) returns boolean
language sql stable set search_path=public,pg_temp as $$
 select not exists(select 1 from jsonb_array_elements(p_members) m where not exists(
  select 1 from public.admin_review_sources r where r.queue_key=m->>'queue_type' and r.active and public.review_case_can_read(r.min_role::text)))
$$;

create function public.refresh_admin_review_worklist() returns jsonb
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
 select id,case_key,family,case when family in ('city_identity','business_link') or family='venue' and candidate_count=0 then 'research' else 'ready' end,
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
 update public.admin_automations set last_run_at=v_started,last_run_status='success' where slug='review_worklist_refresh';
 return jsonb_build_object('cases',v_count,'elapsed_ms',extract(epoch from clock_timestamp()-v_started)*1000);
end $$;

-- Readiness is a separate state, never an accepted/resolved source finding.
create view public.admin_review_case_worklist with(security_invoker=true) as
 select c.*,j.status research_status,j.attempts,j.last_attempt_at,j.next_attempt_at,j.outcome,
 case when c.stage='ready' or j.fingerprint=c.fingerprint and j.outcome->>'decision_ready'='true' then 'ready'
      when j.fingerprint=c.fingerprint and j.status='blocked' then 'blocked' else 'research' end work_stage
 from public.admin_review_cases c left join public.admin_review_research_jobs j on j.case_id=c.id
 where c.active;
revoke all on public.admin_review_case_worklist from public,anon,authenticated;
grant select on public.admin_review_case_worklist to service_role;

create function public.get_admin_review_work_summary() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
 v_result:=public.get_admin_review_summary(); -- Preserves source-level role checks and raw counts.
 return v_result || (select jsonb_build_object(
  'worklist_available',exists(select 1 from public.admin_review_cases),
  'ready_total',count(*) filter(where work_stage='ready'),
  'research_total',count(*) filter(where work_stage='research'),
  'blocked_total',count(*) filter(where work_stage='blocked'),
  'case_total',count(*),'grouped_rows',coalesce(sum(jsonb_array_length(members)),0),
  'worklist_as_of',max(updated_at),
  'research_enabled',(select enabled from public.admin_automations where slug='review_research'))
 from public.admin_review_case_worklist where public.review_case_can_read(required_role) and public.review_case_sources_authorized(members));
end $$;

create function public.get_admin_review_worklist(p_queue_types text[] default null,p_search text default null,
 p_scope text default 'ready',p_sort text default 'priority',p_page integer default 1,p_per_page integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_summary jsonb:=public.get_admin_review_work_summary(); v_items jsonb; v_total bigint;
 v_size integer:=greatest(1,least(100,coalesce(p_per_page,50))); v_page integer:=greatest(1,least(21474836,coalesce(p_page,1)));
begin
 if p_scope not in ('ready','research','blocked') or p_sort not in ('priority','age','confidence') then raise exception 'Invalid case filter'; end if;
 with filtered as materialized (
 select * from public.admin_review_case_worklist c where public.review_case_can_read(required_role) and public.review_case_sources_authorized(members)
 and work_stage=p_scope and (p_queue_types is null or exists(select 1 from jsonb_array_elements(c.members) m where m->>'queue_type'=any(p_queue_types)))
 and (nullif(btrim(p_search),'') is null or exists(select 1 from jsonb_array_elements(c.members) m where
   strpos(lower(coalesce(m->>'title','')||' '||coalesce(m->>'subtitle','')),lower(btrim(p_search)))>0))),
 paged as (select * from filtered order by
  case when p_sort='priority' and item->>'risk'='safety' then 1 else 0 end desc,
  case when p_sort='confidence' then (item->>'confidence_score')::numeric end asc nulls last,
  created_at,id limit v_size offset (v_page-1)*v_size)
 select (select count(*) from filtered),coalesce((select jsonb_agg(item||jsonb_build_object(
  'id',case when family='record' then item->>'id' else id::text end,
  'queue_type',case when family='record' then item->>'queue_type' else 'review-case' end,
  'can_reopen',family='record' and coalesce((item->>'can_reopen')::boolean,false),'created_at',created_at,
  'overdue',coalesce((item->>'sla_hours')::int is not null and created_at<now()-make_interval(hours=>(item->>'sla_hours')::int),false),
  'title',case when family='artwork' then 'Shared artwork · '||jsonb_array_length(members)||' findings' else item->>'title' end,
  'meta',coalesce(item->'meta','{}'::jsonb)||jsonb_build_object('review_case',jsonb_build_object(
   'id',id,'family',family,'stage',work_stage,'fingerprint',fingerprint,'member_count',jsonb_array_length(members),
   'research_status',research_status,'attempts',attempts,'last_attempt_at',last_attempt_at,'next_attempt_at',next_attempt_at,'outcome',outcome),
   'original_queue_type',item->>'queue_type','original_item_id',item->>'id')) order by
   case when p_sort='priority' and item->>'risk'='safety' then 1 else 0 end desc,
   case when p_sort='confidence' then (item->>'confidence_score')::numeric end asc nulls last,created_at,id) from paged),'[]'::jsonb)
 into v_total,v_items;
 return v_summary||jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'per_page',v_size,'updated_at',now());
end $$;

create function public.get_admin_review_case_details(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.admin_review_cases; j public.admin_review_research_jobs; v_members jsonb;
begin
 if not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then raise exception 'Staff access required' using errcode='42501'; end if;
 select * into c from public.admin_review_cases where id=p_case_id and active;
 if not found or not public.review_case_can_read(c.required_role) or not public.review_case_sources_authorized(c.members) then return null; end if;
 select * into j from public.admin_review_research_jobs where case_id=c.id and fingerprint=c.fingerprint;
 select jsonb_agg(m||jsonb_build_object('current_record',case when m->>'entity_table'='events' then
 (select jsonb_build_object('title',e.title,'start_date',e.start_date,'end_date',e.end_date,'venue_name',e.venue_name,
 'website',e.website,'ticket_url',e.ticket_url,'images',e.images,'organizer_name',e.organizer_name,'series_key',e.series_key,'city',e.city,'address',e.address,'updated_at',e.updated_at)
 from public.events e where e.id=(m->>'entity_id')::uuid) else null end)) into v_members from jsonb_array_elements(c.members) m;
 return jsonb_build_object('id',c.id,'family',c.family,'fingerprint',c.fingerprint,'members',v_members,'research',to_jsonb(j),
 'research_enabled',(select enabled from public.admin_automations where slug='review_research'),
 'item',c.item||jsonb_build_object('id',c.id,'queue_type','review-case','can_reopen',false,'meta',c.item->'meta'||jsonb_build_object(
 'original_queue_type',c.item->>'queue_type','original_item_id',c.item->>'id','review_case',jsonb_build_object('id',c.id,'family',c.family,
 'fingerprint',c.fingerprint,'member_count',jsonb_array_length(c.members),'stage',case when c.stage='ready' or j.outcome->>'decision_ready'='true' then 'ready' when j.status='blocked' then 'blocked' else 'research' end))));
end $$;

create function public.claim_admin_review_research_jobs(p_batch integer default 4) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_jobs jsonb;
begin
 if not exists(select 1 from public.admin_automations where slug='review_research' and enabled) then return '[]'::jsonb; end if;
 -- An expired lease consumes an attempt too; after three failures it escalates visibly.
 update public.admin_review_research_jobs set status='blocked',lease_token=null,lease_expires_at=null,
 outcome=jsonb_build_object('reason','Research worker lease expired after three attempts'),updated_at=now()
 where status='running' and lease_expires_at<now() and attempts>=3;
 with eligible as (select j.case_id,j.attempts,c.created_at,
 row_number() over(partition by c.family order by j.attempts,c.created_at,j.case_id) family_rank
 from public.admin_review_research_jobs j join public.admin_review_cases c on c.id=j.case_id
 where c.active and c.fingerprint=j.fingerprint and c.stage='research' and j.attempts<3
 and (j.status in ('queued','retry') and j.next_attempt_at<=now() or j.status='running' and j.lease_expires_at<now())),
 due as (select j.case_id from eligible x join public.admin_review_research_jobs j using(case_id)
 order by x.attempts,x.family_rank,x.created_at,x.case_id limit greatest(1,least(8,p_batch)) for update of j skip locked),
 claimed as (update public.admin_review_research_jobs j set status='running',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_expires_at=now()+interval '8 minutes',last_attempt_at=now(),updated_at=now()
 from due where due.case_id=j.case_id returning j.*)
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('family',c.family,'item',c.item)),'[]'::jsonb) into v_jobs
 from claimed j join public.admin_review_cases c on c.id=j.case_id;
 return v_jobs;
end $$;

create function public.finish_admin_review_research_job(p_case_id uuid,p_lease_token uuid,p_status text,p_outcome jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('completed','blocked','retry') then raise exception 'Invalid research result'; end if;
 update public.admin_review_research_jobs j set status=case when p_status='retry' and attempts>=3 then 'blocked' else p_status end,
 outcome=coalesce(p_outcome,'{}'),next_attempt_at=now()+make_interval(hours=>case when attempts=1 then 1 else 6 end),
 lease_token=null,lease_expires_at=null,updated_at=now()
 where case_id=p_case_id and status='running' and lease_token=p_lease_token and lease_expires_at>now()
 and exists(select 1 from public.admin_review_cases c where c.id=j.case_id and c.active and c.fingerprint=j.fingerprint);
 return found;
end $$;

-- Exact canonical relationships can be repaired; weaker matches are only candidates.
create function public.research_admin_review_local(p_case_id uuid,p_lease_token uuid) returns jsonb
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
  select jsonb_agg(to_jsonb(v)) into v_candidates from (
   select v.id,v.name,v.address,v.website,v.city_id,v.country_id,
    public.dedup_despace(v.name)=public.dedup_despace(e.venue_name) exact_name,
    case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null then
      6371008.8*2*asin(least(1.0,sqrt(power(sin(radians(v.latitude-e.latitude)/2),2)+cos(radians(e.latitude))*cos(radians(v.latitude))*power(sin(radians(v.longitude-e.longitude)/2),2)))) end distance_m
   from public.venues v where v.city_id=e.city_id and v.country_id=e.country_id and v.duplicate_of_id is null and v.closed_at is null
    and (public.dedup_despace(v.name)=public.dedup_despace(e.venue_name) or similarity(v.name,e.venue_name)>=0.35)
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

create function public.record_admin_review_research_run(p_started timestamptz,p_summary jsonb,p_failed boolean default false,p_run_id bigint default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_run_id is not null then
  update public.admin_automation_runs set finished_at=now(),status=case when p_failed then 'error' else 'success' end,
   items_examined=coalesce((p_summary->>'examined')::integer,0),items_changed=coalesce((p_summary->>'repaired')::integer,0),summary=p_summary
   where id=p_run_id and automation_slug='review_research';
 end if;
 if p_run_id is null or not found then
 insert into public.admin_automation_runs(automation_id,automation_slug,started_at,finished_at,status,items_examined,items_changed,summary)
 select id,slug,p_started,now(),case when p_failed then 'error' else 'success' end,
 coalesce((p_summary->>'examined')::integer,0),coalesce((p_summary->>'repaired')::integer,0),p_summary
 from public.admin_automations where slug='review_research';
 end if;
 update public.admin_automations set last_run_at=p_started,last_run_status=case when p_failed then 'error' else 'success' end where slug='review_research';
end $$;

create function public.decide_admin_review_case(p_case_id uuid,p_fingerprint text,p_action text,p_notes text default null,p_confirm boolean default false,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.admin_review_cases; m jsonb; v_live jsonb; v_ids text[]; v_venue public.venues; e public.events; v_remaining jsonb; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Staff session required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('approve','reject','reopen') then raise exception 'Unsupported case decision'; end if;
 select * into c from public.admin_review_cases where id=p_case_id and (active or p_action='reopen') for update;
 if not found or not public.review_case_can_read(c.required_role) or not public.review_case_sources_authorized(c.members) then raise exception 'Case is unavailable' using errcode='42501'; end if;
 if c.fingerprint is distinct from p_fingerprint then raise exception 'Case evidence changed. Reload before deciding.' using errcode='40001'; end if;
 if p_action='reopen' then
  if c.family<>'record' or not coalesce((c.item->>'can_reopen')::boolean,false) then raise exception 'This case cannot be reopened'; end if;
  v_result:=public.admin_review_action(c.item->>'queue_type',(c.item->>'id')::uuid,'reopen',p_notes,p_confirm,p_payload);
  update public.admin_review_cases set active=true,updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true,'result',v_result);
 end if;
 if c.stage='research' and not exists(select 1 from public.admin_review_research_jobs j where j.case_id=c.id and j.fingerprint=c.fingerprint and j.outcome->>'decision_ready'='true') then
  raise exception 'Research is incomplete. Inspect the missing evidence before making a decision'; end if;
 if c.family in ('city_identity','business_link') then
  for m in select value from jsonb_array_elements(c.members) loop
   if m->>'queue_type'='general-review' and m#>>'{meta,review_type}'='CITY_LIFECYCLE_UNRESOLVED' and
    exists(select 1 from public.city_quality_profile p where p.id=(m->>'entity_id')::uuid and not ('CITY_LIFECYCLE_UNRESOLVED'=any(p.issue_codes))) then
    update public.review_queue set status='resolved',resolved_by=auth.uid(),resolved_at=now(),
     details=coalesce(details,'{}')||jsonb_build_object('resolution','case_recheck_signal_cleared','review_note',p_notes) where id=(m->>'id')::uuid;
   end if;
   if m->>'queue_type'='geography' then
    v_result:=public.geo_cms_verify((m#>>'{meta,place_id}')::uuid);
   end if;
   if public.admin_review_item(m->>'queue_type',(m->>'id')::uuid) is not null then
    raise exception 'Source finding remains open. Correct the record and rerun verification before rechecking.'; end if;
  end loop;
  update public.admin_review_cases set active=false,updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true);
 end if;
 if c.family in ('artwork','venue') then
  if nullif(btrim(p_notes),'') is null then raise exception 'An evidence note is required'; end if;
  if not coalesce(p_confirm,false) then raise exception 'Confirm the affected records before saving'; end if;
  select array_agg(value) into v_ids from jsonb_array_elements_text(p_payload->'member_ids');
  if coalesce(cardinality(v_ids),0)=0 or exists(select 1 from unnest(v_ids) x where not exists(select 1 from jsonb_array_elements(c.members) z where z->>'id'=x)) then
    raise exception 'Choose affected records from the current case'; end if;
  for m in select value from jsonb_array_elements(c.members) where value->>'id'=any(v_ids) loop
   v_live:=public.admin_review_item(m->>'queue_type',(m->>'id')::uuid);
   if v_live is null or (v_live->'meta')#-'{details,observed_at}' is distinct from (m->'meta')#-'{details,observed_at}' then
    raise exception 'A source finding changed. Reload the case.' using errcode='40001'; end if;
   if c.family='artwork' and exists(select 1 from public.events ev where ev.id=(m->>'entity_id')::uuid and (
     v_live#>>'{meta,evidence,url}' is not null and not((v_live#>>'{meta,evidence,url}')=any(coalesce(ev.images,'{}')))
     or exists(select 1 from jsonb_array_elements(coalesce(v_live#>'{meta,evidence,images}','[]')) image where not((image->>'url')=any(coalesce(ev.images,'{}')))))) then
    raise exception 'Flagged artwork is no longer attached to an event. Refresh after automatic reconciliation.' using errcode='40001'; end if;
  end loop;
  if c.family='artwork' then
   if p_action<>'reject' then raise exception 'Repair individual media before rechecking; shared artwork can be accepted with evidence'; end if;
   for m in select value from jsonb_array_elements(c.members) where value->>'id'=any(v_ids) loop
    perform public.admin_review_action(m->>'queue_type',(m->>'id')::uuid,'reject',p_notes,true,'{}');
   end loop;
  else
   if p_action<>'approve' or cardinality(v_ids)<>jsonb_array_length(c.members) then raise exception 'A venue link applies to all findings for this event'; end if;
   select * into e from public.events where id=(c.item->>'entity_id')::uuid for update;
   select * into v_venue from public.venues where id=nullif(p_payload->>'venue_id','')::uuid and duplicate_of_id is null and closed_at is null;
   if not found or e.venue_id is not null or e.city_id is null or v_venue.city_id is distinct from e.city_id or e.country_id is null or v_venue.country_id is distinct from e.country_id then
    raise exception 'Choose a current canonical venue in the same city and country'; end if;
   if e.updated_at is distinct from nullif(p_payload->>'expected_updated_at','')::timestamptz then
    raise exception 'Event changed since comparison. Reload the evidence.' using errcode='40001'; end if;
   if exists(select 1 from public.events other where other.id<>e.id and other.venue_id=v_venue.id
    and lower(btrim(other.title))=lower(btrim(e.title)) and other.start_date=e.start_date and other.status<>'archived') then
    raise exception 'Venue link would collide with another event occurrence. Review duplicates first'; end if;
   update public.events set venue_id=v_venue.id,updated_at=now(),field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object(
    'venue_id',jsonb_build_object('source','review_case_decision','actor_id',auth.uid(),'at',now(),'source_id',v_venue.id,'human_reviewed',true,'note',p_notes)) where id=e.id;
   update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=now(),reviewed_by=auth.uid(),resolution=p_notes
    where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open';
   insert into public.admin_review_decisions(queue_key,item_id,actor_id,decision,notes) values('review-case',c.id,auth.uid(),'approve',p_notes);
  end if;
  select coalesce(jsonb_agg(value),'[]') into v_remaining from jsonb_array_elements(c.members) where not(value->>'id'=any(v_ids));
  update public.admin_review_cases set active=jsonb_array_length(v_remaining)>0,
   members=v_remaining,item=coalesce(v_remaining->0,item),fingerprint=md5(v_remaining::text),updated_at=now() where id=c.id;
 else
  v_result:=public.admin_review_action(c.item->>'queue_type',(c.item->>'id')::uuid,p_action,p_notes,p_confirm,p_payload);
  update public.admin_review_cases set active=false,updated_at=now() where id=c.id;
 end if;
 return jsonb_build_object('ok',true,'result',v_result);
end $$;

create function public.reconcile_admin_review_cases(p_queue_type text,p_item_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.admin_review_cases; v_closed integer:=0;
begin
 if not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then raise exception 'Staff access required' using errcode='42501'; end if;
 if coalesce(cardinality(p_item_ids),0)>100 then raise exception 'At most 100 source items can be reconciled'; end if;
 for c in select * from public.admin_review_cases where active and family='record' and item->>'queue_type'=p_queue_type
 and (item->>'id')::uuid=any(p_item_ids) for update loop
  if public.review_case_can_read(c.required_role) and public.admin_review_item(p_queue_type,(c.item->>'id')::uuid) is null then
   update public.admin_review_cases set active=false,updated_at=now() where id=c.id; v_closed:=v_closed+1;
  end if;
 end loop;
 return v_closed;
end $$;

create function public.retry_admin_review_research(p_case_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_review_cases where id=p_case_id and active and public.review_case_can_read(required_role)) then
  raise exception 'Case is unavailable' using errcode='42501'; end if;
 update public.admin_review_research_jobs set status='queued',attempts=0,next_attempt_at=now(),updated_at=now()
 where case_id=p_case_id and status in ('blocked','retry');
 return found;
end $$;

-- New functions are private by default. Browser access stays behind staff RPCs;
-- claiming, research, result submission and refresh are service-only operations.
do $acl$ declare r record; begin
 for r in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
 'review_case_family','review_case_key','review_case_can_read','review_case_sources_authorized','repair_admin_review_mechanical','refresh_admin_review_worklist','get_admin_review_work_summary',
 'get_admin_review_worklist','get_admin_review_case_details','claim_admin_review_research_jobs','finish_admin_review_research_job',
 'research_admin_review_local','record_admin_review_research_run','reconcile_admin_review_cases','retry_admin_review_research','decide_admin_review_case') loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $acl$;
grant execute on function public.get_admin_review_work_summary(),public.get_admin_review_worklist(text[],text,text,text,integer,integer),
 public.get_admin_review_case_details(uuid),public.decide_admin_review_case(uuid,text,text,text,boolean,jsonb) to authenticated;
grant execute on function public.reconcile_admin_review_cases(text,uuid[]),public.retry_admin_review_research(uuid) to authenticated;

insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,schedule,action,lifecycle_state)
values('review_worklist_refresh','Reconcile review cases','Consolidate source findings without resolving or hiding them. Research remains visible.','system',true,
 '{"type":"schedule"}','4-59/5 * * * *','{"type":"rpc","fn":"refresh_admin_review_worklist"}','active'),
 ('review_research','Research incomplete review cases','Bounded evidence research with leases, three attempts, backoff and visible escalation.','system',true,
 '{"type":"schedule"}','2-59/5 * * * *','{"type":"cron","jobname":"review_research"}','active');
select cron.schedule('review_worklist_refresh','4-59/5 * * * *','set statement_timeout=''90s''; select public.refresh_admin_review_worklist();');
select cron.schedule('review_research','2-59/5 * * * *',$cron$
 do $dispatch$ declare v_run_id bigint; begin
 v_run_id:=public.admin_automation_run_begin('review_research',1);
 perform public.automation_http_post(
  url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/review-research',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'),
    'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret'),'Content-Type','application/json'),
  body:=jsonb_build_object('batch',4,'run_id',v_run_id),timeout_milliseconds:=240000);
 end $dispatch$;
$cron$);
select public.refresh_admin_review_worklist();
