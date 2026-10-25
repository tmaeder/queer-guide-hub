-- 99991792951231_event_quality_publisher_occurrence_copy
--
-- TODO: why this migration exists.

-- Repeated copy is expected for independently dated occurrences of a publisher
-- series. Prove that identity from captured source facts, never guessed cadence.
create function api_private.event_publisher_copy_identity(p_id uuid)
returns text language sql stable set search_path='' as $fn$
 select min(s.payload#>>'{normalized,metadata,series}')
 from public.events e join public.event_sources s on s.event_id=e.id
 join public.countries co on co.id=e.country_id and co.code='DE'
 join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
 join public.venues v on v.id=e.venue_id and v.city_id=e.city_id and v.country_id=e.country_id and v.duplicate_of_id is null
 where e.id=p_id and e.duplicate_of_id is null and e.data_source='siegessaeule'
 and s.source_slug='siegessaeule' and s.source_entity_id=e.external_id
 and s.payload_hash~'^[a-f0-9]{64}$'
 and s.payload#>>'{raw,source}'='siegessaeule' and s.payload#>>'{raw,url}'=s.source_url
 and s.payload#>>'{normalized,sourceId}'=s.source_entity_id
 and s.payload#>>'{normalized,metadata,source}'='siegessaeule'
 and s.payload#>>'{normalized,metadata,url}'=s.source_url
 and s.payload#>>'{normalized,title}'=e.title
 and s.payload#>>'{normalized,location,country}'='DE'
 and s.payload#>>'{normalized,location,timezone}'='Europe/Berlin'
 and s.payload#>>'{normalized,description}'=e.description
 and s.payload#>>'{normalized,metadata,series}'~'^[a-z0-9-]+/[a-z0-9-]+$'
 and s.source_url='https://www.siegessaeule.de/termine/'||
  (s.payload#>>'{normalized,metadata,series}')||'/'||to_char(e.start_date at time zone 'Europe/Berlin','YYYY-MM-DD/HH24:MI')||'/'
 and s.source_entity_id=(s.payload#>>'{normalized,metadata,series}')||'/'||to_char(e.start_date at time zone 'Europe/Berlin','YYYY-MM-DD/HH24:MI')
 and case when pg_input_is_valid(s.payload#>>'{normalized,start_date}','timestamp with time zone')
  then (s.payload#>>'{normalized,start_date}')::timestamptz=e.start_date else false end
 having count(distinct s.payload#>>'{normalized,metadata,series}')=1;
$fn$;
revoke all on function api_private.event_publisher_copy_identity(uuid) from public,anon,authenticated;
grant execute on function api_private.event_publisher_copy_identity(uuid) to service_role;

create function api_private.event_description_reuse_expected(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $fn$
 with subject as materialized(
  select e.*,api_private.event_publisher_copy_identity(e.id) publisher_series
  from public.events e where e.id=p_id and e.duplicate_of_id is null
   and length(btrim(coalesce(e.description,'')))>=20
 ), siblings as materialized(
  select other.id,other.title,other.venue_id,other.city_id,other.country_id,other.start_date,
   api_private.event_publisher_copy_identity(other.id) publisher_series
  from subject e join public.events other on other.duplicate_of_id is null
   and length(btrim(coalesce(other.description,'')))>=20
   and public.event_quality_description_fingerprint(other.description)=public.event_quality_description_fingerprint(e.description)
  where e.publisher_series is not null
 )
 select coalesce((select e.publisher_series is not null and count(distinct s.start_date)>=3
   and bool_and(s.title=e.title and s.venue_id=e.venue_id and s.city_id=e.city_id and s.country_id=e.country_id
    and s.publisher_series is not null and s.publisher_series=e.publisher_series)
  from subject e cross join siblings s group by e.publisher_series),false);
$fn$;
revoke all on function api_private.event_description_reuse_expected(uuid) from public,anon,authenticated;
grant execute on function api_private.event_description_reuse_expected(uuid) to service_role;

do $patch$
declare definition text;anchor text:=$anchor$from e where coalesce(description_reuse_count,0)>=10 and coalesce(is_recurring,false)=false and series_key is null$anchor$;
begin
 definition:=pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Description reuse detector changed';end if;
 execute replace(definition,anchor,anchor||' and not api_private.event_description_reuse_expected(e.id)');
end $patch$;

create function api_private.reconcile_publisher_event_copy(p_batch integer default 200,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record;after_row jsonb;n integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
 then return '{"publisher_copy_skipped":"paused"}';end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
 then return '{"publisher_copy_skipped":"already_running"}';end if;
 for r in select i.* from public.event_quality_issues i join public.events e on e.id=i.event_id
  where i.status='open' and i.detector='event-quality-scan' and i.issue_code='DESCRIPTION_REUSED'
   and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null
   and api_private.event_description_reuse_expected(e.id)
  order by i.id limit greatest(0,least(coalesce(p_batch,0),200)) for update of i,e skip locked
 loop
  n:=n+1;
  if p_dry_run is distinct from false then continue;end if;
  update public.event_quality_issues i set status='resolved',resolved_at=now(),
   resolution='auto-publisher-copy:v1 '||jsonb_build_object(
    'reason','Expected shared publisher copy across independently dated occurrences; event content and schedule unchanged',
    'publisher_series',api_private.event_publisher_copy_identity(r.event_id),'human_reviewed',false,
    'sources',(select jsonb_agg(jsonb_build_object('id',s.id,'url',s.source_url,'payload_hash',s.payload_hash))
     from public.event_sources s join public.events e on e.id=s.event_id
     where e.id=r.event_id and s.source_slug='siegessaeule' and s.source_entity_id=e.external_id))::text
   where i.id=r.id and api_private.event_description_reuse_expected(r.event_id)
   and not exists(select 1 from public.event_quality_findings(r.event_id) f where f.issue_code='DESCRIPTION_REUSED')
   returning to_jsonb(i) into after_row;
  if after_row is null then n:=n-1;continue;end if;
  update public.event_quality_current set open_issue_codes=array_remove(open_issue_codes,'DESCRIPTION_REUSED'),
   issue_codes=array_remove(issue_codes,'DESCRIPTION_REUSED') where event_id=r.event_id;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('event_quality_issue',r.id,'publisher_occurrence_description_reuse',to_jsonb(r),after_row);
 end loop;
 return jsonb_build_object('publisher_description_findings',n);
end $fn$;
revoke all on function api_private.reconcile_publisher_event_copy(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_publisher_event_copy(integer,boolean) to service_role;

-- Reuse the existing five-minute cadence, pause state, lease and run journal.
do $hook$
declare definition text;anchor text:=$anchor$return jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
 definition:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Automatic resolution return contract changed';end if;
 execute replace(definition,anchor,'return api_private.reconcile_publisher_event_copy(v_limit,p_dry_run) || jsonb_build_object(''dry_run'',p_dry_run,');
end $hook$;
