-- Authorize the small source registry once per request, rather than repeating
-- JWT/source lookups for every case in both the summary and paginated query.
create function public.review_case_source_keys(p_members jsonb) returns text[]
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct m->>'queue_type'),'{}'::text[]) from jsonb_array_elements(p_members) m
$$;
revoke all on function public.review_case_source_keys(jsonb) from public,anon,authenticated;
grant execute on function public.review_case_source_keys(jsonb) to service_role;
alter table public.admin_review_cases add column source_keys text[] generated always as(public.review_case_source_keys(members)) stored;

create function public.admin_review_authorized_source_keys() returns text[]
language sql stable set search_path=public,pg_temp as $$
 select coalesce(array_agg(queue_key),'{}'::text[]) from public.admin_review_sources
 where active and public.review_case_can_read(min_role::text)
$$;
revoke all on function public.admin_review_authorized_source_keys() from public,anon,authenticated;
grant execute on function public.admin_review_authorized_source_keys() to service_role;

do $view$
declare v_src text:=pg_get_viewdef('public.admin_review_case_worklist'::regclass,true); v_anchor text:='END AS work_stage';
begin
 if (length(v_src)-length(replace(v_src,v_anchor,'')))/length(v_anchor)<>1 then raise exception 'Review worklist projection anchor changed'; end if;
 execute 'create or replace view public.admin_review_case_worklist as '||replace(v_src,v_anchor,v_anchor||', c.source_keys AS source_keys');
end $view$;
create or replace function public.get_admin_review_work_summary() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_sources text[]:=public.admin_review_authorized_source_keys();
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
 from public.admin_review_case_worklist where source_keys <@ v_sources);
end $$;

create or replace function public.get_admin_review_worklist(p_queue_types text[] default null,p_search text default null,
 p_scope text default 'ready',p_sort text default 'priority',p_page integer default 1,p_per_page integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_summary jsonb:=public.get_admin_review_work_summary(); v_sources text[]:=public.admin_review_authorized_source_keys(); v_items jsonb; v_total bigint;
 v_size integer:=greatest(1,least(100,coalesce(p_per_page,50))); v_page integer:=greatest(1,least(21474836,coalesce(p_page,1)));
begin
 if p_scope not in ('ready','research','blocked') or p_sort not in ('priority','age','confidence') then raise exception 'Invalid case filter'; end if;
 with filtered as materialized (
 select * from public.admin_review_case_worklist c where source_keys <@ v_sources
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
 'research_enabled',(select enabled from public.admin_automations where slug='review_research'),
 'item',c.item||jsonb_build_object('id',c.id,'queue_type','review-case','can_reopen',false,'meta',c.item->'meta'||jsonb_build_object(
 'original_queue_type',c.item->>'queue_type','original_item_id',c.item->>'id','review_case',jsonb_build_object('id',c.id,'family',c.family,
 'fingerprint',c.fingerprint,'member_count',jsonb_array_length(c.members),'stage',case when c.stage='ready' or j.outcome->>'decision_ready'='true' then 'ready' when j.status='blocked' then 'blocked' else 'research' end))));
end $$;
