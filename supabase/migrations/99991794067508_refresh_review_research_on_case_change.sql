-- Case creation and fingerprint changes enqueue research in the same
-- transaction. The scheduled worklist refresh still repairs any missing job.
create function api_private.sync_changed_review_research_case()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if not new.active or new.stage <> 'research' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and old.stage = 'research'
     and old.fingerprint = new.fingerprint then
    return new;
  end if;

  insert into public.admin_review_research_jobs as jobs (case_id, fingerprint)
  values (new.id, new.fingerprint)
  on conflict (case_id) do update
    set fingerprint = excluded.fingerprint, status = 'queued', attempts = 0,
        next_attempt_at = now(), lease_token = null, lease_expires_at = null,
        outcome = '{}'::jsonb, updated_at = now()
    where jobs.fingerprint <> excluded.fingerprint;
  return new;
end
$$;
revoke all on function api_private.sync_changed_review_research_case()
  from public, anon, authenticated;

create trigger sync_changed_review_research_case
after insert or update of active, stage, fingerprint on public.admin_review_cases
for each row execute function api_private.sync_changed_review_research_case();

CREATE OR REPLACE FUNCTION public.refresh_admin_review_worklist()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 fingerprint=excluded.fingerprint,active=true,updated_at=now()
 where row(admin_review_cases.stage,admin_review_cases.required_role,admin_review_cases.item,
  admin_review_cases.members,admin_review_cases.fingerprint,admin_review_cases.active)
 is distinct from row(excluded.stage,excluded.required_role,excluded.item,excluded.members,excluded.fingerprint,true)
 returning id)
 insert into review_worklist_refresh_ids select id from grouped
 $q$,v_union);
 get diagnostics v_count=row_count;
 update public.admin_review_cases c set active=false,updated_at=now()
 where active and not exists(select 1 from review_worklist_refresh_ids x where x.id=c.id);
 insert into public.admin_review_research_jobs(case_id,fingerprint)
 select c.id,c.fingerprint from public.admin_review_cases c
 where c.active and c.stage='research' and not exists (
   select 1 from public.admin_review_research_jobs j
   where j.case_id=c.id and j.fingerprint=c.fingerprint
 )
 on conflict(case_id) do update set fingerprint=excluded.fingerprint,status='queued',attempts=0,
   next_attempt_at=now(),lease_token=null,lease_expires_at=null,outcome='{}',updated_at=now()
 where admin_review_research_jobs.fingerprint<>excluded.fingerprint;
 perform public.process_admin_review_local_research(100);
 update public.admin_automations set last_run_at=v_started,last_run_status='success' where slug='review_worklist_refresh';
 return jsonb_build_object('cases',v_count,'elapsed_ms',extract(epoch from clock_timestamp()-v_started)*1000);
end $function$;
