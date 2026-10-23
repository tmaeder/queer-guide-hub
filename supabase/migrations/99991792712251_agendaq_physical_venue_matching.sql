-- 99991792712251_agendaq_physical_venue_matching
--

-- Source location IDs distinguish physical destinations from event organizers.
-- Service-only, bounded and idempotent; every event update has native revision
-- history and explicit source provenance. No external requests or AI calls.
create function public.reconcile_agendaq_event_venues(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare result jsonb;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('agendaq_physical_venue_matching')) then
  return jsonb_build_object('skipped',true,'reason','already_running');
 end if;
with parameters as(select p_dry_run dry_run,greatest(0,least(coalesce(p_batch,100),500)) batch_size), targets as materialized(
 select event_id id from public.event_quality_issues where status='open' and issue_code='NAMED_VENUE_UNLINKED'
 union select entity_id from public.review_queue where entity_type='event' and review_type='venue_link_candidate' and status in('pending','open','pending_review','review')
), event_evidence as materialized(
 select es.id source_id,es.event_id,es.source_entity_id,es.source_url,es.payload_hash,
 es.payload#>>'{raw,slug}' slug,es.payload#>>'{raw,name}' title,
 es.payload#>'{raw,locations}' locations
 from public.event_sources es join targets t on t.id=es.event_id where es.source_slug='agendaq'
), venue_evidence as materialized(
 select vs.id source_id,vs.venue_id,vs.source_entity_id,vs.source_url,vs.payload_hash,
 vs.payload#>>'{raw,slug}' slug,vs.payload#>>'{raw,name}' name,
 vs.payload#>'{raw,locations}' locations from public.venue_sources vs where vs.source_slug='agendaq'
), venue_locations as materialized(
 select vs.*,vl loc from venue_evidence vs
 cross join lateral jsonb_array_elements(case when jsonb_typeof(vs.locations)='array' then vs.locations else '[]' end) vl
 where vl->>'id'~'^[1-9][0-9]*$' and vl->>'approx' is distinct from 'true'
), source_matches as materialized(
 select es.event_id,es.source_id event_source_id,vs.venue_id,vs.source_id venue_source_id,
 es.source_url event_source_url,vs.source_url venue_source_url,el->>'id' location_id,
 es.title source_event_title,vs.name source_venue_name,el->>'cc' source_country
 from event_evidence es
 cross join lateral jsonb_array_elements(case when jsonb_typeof(es.locations)='array' then es.locations else '[]' end) el
 join venue_locations vs on vs.loc->>'id'=el->>'id' and vs.loc->>'cc'=el->>'cc'
 where es.source_entity_id=es.slug and vs.source_entity_id=vs.slug
 and es.source_url='https://www.agendaq.fr/fr/agenda/'||es.source_entity_id
 and vs.source_url='https://www.agendaq.fr/fr/guide/'||vs.source_entity_id
 and el->>'approx' is distinct from 'true'
), claims as materialized(
 select e.id,e.title,e.venue_name,e.start_date,v.id venue_id,v.name matched_name,
 sm.event_source_id,sm.venue_source_id,sm.location_id,sm.event_source_url,sm.venue_source_url,e.updated_at,
 public.haversine_m(e.latitude::numeric,e.longitude::numeric,v.latitude::numeric,v.longitude::numeric) distance_m
 from source_matches sm join public.events e on e.id=sm.event_id join public.venues v on v.id=sm.venue_id
 join public.countries co on co.id=e.country_id and upper(co.code)=upper(sm.source_country)
 join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id
 where e.venue_id is null and e.duplicate_of_id is null and coalesce(e.status,'active') not in('cancelled','archived','rejected')
 and v.duplicate_of_id is null and v.closed_at is null and e.city_id=v.city_id and e.country_id=v.country_id
 and not(coalesce(e.field_provenance,'{}') ? 'venue_id') and not(coalesce(e.field_provenance,'{}') ? 'venue_name')
 and v.category not in('organization','other','cruising','outdoor','toilet')
 and lower(btrim(sm.source_event_title))=lower(btrim(e.title))
 and lower(btrim(sm.source_venue_name))=lower(btrim(v.name))
 and public.haversine_m(e.latitude::numeric,e.longitude::numeric,v.latitude::numeric,v.longitude::numeric)<=100
 and not exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=e.id and q.review_type='venue_link_candidate'
 and q.status in('pending','open','pending_review','review') and (q.resolved_by is not null or lower(q.details->>'hard_blocker')='true' or lower(q.details->>'requires_confirm')='true' or lower(q.details->>'force_review')='true'))
), unique_events as(select id from claims group by id having count(distinct venue_id)=1), selected as materialized(
 select distinct on(c.id) c.* from claims c join unique_events u using(id)
 where not exists(select 1 from public.events other where other.id<>c.id and other.venue_id=c.venue_id
  and lower(btrim(other.title))=lower(btrim(c.title)) and other.start_date=c.start_date and other.status is distinct from 'archived')
 and not exists(select 1 from claims peer where peer.id<>c.id and peer.venue_id=c.venue_id
  and lower(btrim(peer.title))=lower(btrim(c.title)) and peer.start_date=c.start_date)
 order by c.id,c.location_id limit(select batch_size from parameters)
), locked as materialized(
 select s.*,es.payload_hash event_payload_hash,vs.payload_hash venue_payload_hash
 from selected s join public.events e on e.id=s.id
 join public.venues v on v.id=s.venue_id
 join public.event_sources es on es.id=s.event_source_id
 join public.venue_sources vs on vs.id=s.venue_source_id
 where e.updated_at=s.updated_at and e.venue_id is null
 for update of e skip locked for share of v,es,vs skip locked
), changed as(
 update public.events e set venue_id=s.venue_id,venue_name=s.matched_name,updated_at=now(),
 field_provenance=coalesce(e.field_provenance,'{}'::jsonb)||jsonb_build_object(
 'venue_id',jsonb_build_object('source','agendaq_physical_location_match','source_location_id',s.location_id,
 'event_source_id',s.event_source_id,'venue_source_id',s.venue_source_id,
 'event_source_url',s.event_source_url,'venue_source_url',s.venue_source_url,
 'event_payload_hash',s.event_payload_hash,'venue_payload_hash',s.venue_payload_hash,
 'previous_venue_id',e.venue_id,'previous_venue_name',e.venue_name,'distance_m',s.distance_m,'inherited_at',now(),'human_reviewed',false),
 'venue_name',jsonb_build_object('source','agendaq_physical_location_match','source_id',s.venue_source_id,
 'previous_value',e.venue_name,'inherited_at',now(),'human_reviewed',false))
 from locked s where e.id=s.id and not(select dry_run from parameters) returning e.id,e.venue_id
), findings as(
 update public.event_quality_issues i set status='resolved',resolved_at=now(),reviewed_at=now(),reviewed_by=null,
 resolution='Automatic repair: exact AgendaQ physical location ID, unique canonical venue, same city/country and within 100 metres; event/venue source evidence retained in field provenance.'
 from changed c where i.event_id=c.id and i.status='open' and i.issue_code='NAMED_VENUE_UNLINKED' returning i.id
), summaries as(
 update public.event_quality_current c set open_issue_codes=array_remove(c.open_issue_codes,'NAMED_VENUE_UNLINKED')
 from changed e where c.event_id=e.id returning c.event_id
)
select jsonb_build_object('dry_run',(select dry_run from parameters),'candidates',(select count(*) from locked),
 'linked_events',(select count(*) from changed),'resolved_findings',(select count(*) from findings),
 'evidence',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from locked s)) into result;
 return result;
end $fn$;
revoke all on function public.reconcile_agendaq_event_venues(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_agendaq_event_venues(integer,boolean) to service_role;

-- Reuse the enabled/paused state, schedule and run log of the existing linker.
-- Keep the original name-based linker and its guards, and report both results.
do $patch$
declare src text; decl_anchor text:='v_result        jsonb;';
 call_anchor text:='v_result := public.link_event_venues(500, true, false);';
begin
 select pg_get_functiondef('public.run_event_venue_link()'::regprocedure) into src;
 if (length(src)-length(replace(src,decl_anchor,'')))/length(decl_anchor)<>1
  or (length(src)-length(replace(src,call_anchor,'')))/length(call_anchor)<>1 then
  raise exception 'Event venue automation hook changed';
 end if;
 src:=replace(src,decl_anchor,decl_anchor||' v_source_result jsonb;');
 src:=replace(src,call_anchor,'v_source_result := public.reconcile_agendaq_event_venues(100,false);
  '||call_anchor||'
  v_result := v_result || jsonb_build_object(
   ''source_location_matches'',v_source_result,
   ''candidates'',coalesce((v_result->>''candidates'')::int,0)+coalesce((v_source_result->>''candidates'')::int,0),
   ''linked'',coalesce((v_result->>''linked'')::int,0)+coalesce((v_source_result->>''linked_events'')::int,0));');
 execute src;
end $patch$;
