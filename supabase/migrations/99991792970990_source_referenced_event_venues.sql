-- 99991792970990_source_referenced_event_venues
--
-- A publisher venue key is an explicit source relationship, not a fuzzy name.
-- Preserve explicit pins; replace only unchanged machine city-centroid estimates.
create function api_private.reconcile_source_referenced_event_venues(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rec record;old_reviews jsonb;old_issues jsonb;after_row jsonb;before_item jsonb;after_item jsonb;
 candidates integer:=0;linked integer:=0;pins integer:=0;review_count integer:=0;issue_count integer:=0;
 selected_ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();
 if coalesce(p_batch,0)<=0 then return jsonb_build_object('dry_run',p_dry_run,'candidates',0,'linked_events',0,'corrected_pins',0,'resolved_review_findings',0,'resolved_quality_findings',0,'event_ids','[]'::jsonb);end if;
 if exists(select 1 from public.admin_automations where slug in('review_automatic_resolution','event_venue_link')and not enabled)
 then return '{"skipped":true,"reason":"paused"}';end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
 then return '{"skipped":true,"reason":"already_running"}';end if;
 for rec in
with targets as materialized(
 select entity_id id from public.review_queue where entity_type='event'and review_type='venue_link_candidate'and status='pending'and resolved_at is null
 union select event_id from public.event_quality_issues where issue_code='NAMED_VENUE_UNLINKED'and status='open'and detector='event-quality-scan'
), refs as materialized(
 select e.id,es.id event_source_id,vs.id venue_source_id,v.id venue_id,es.payload#>'{normalized}'n,vs.payload#>'{normalized}'vn,
 es.payload_hash event_payload_hash,vs.payload_hash venue_payload_hash,md5(to_jsonb(es)::text)event_source_fingerprint,md5(to_jsonb(vs)::text)venue_source_fingerprint
 from targets t join public.events e on e.id=t.id
 join public.event_sources es on es.event_id=e.id and es.source_slug=e.data_source and es.source_entity_id=e.external_id
 join public.venue_sources vs on vs.source_slug=es.source_slug and vs.source_entity_id=es.payload#>>'{normalized,metadata,venue_source_id}'
 join public.venues v on v.id=vs.venue_id and v.duplicate_of_id is null
 where e.data_source in('haz-ch','milchjugend')and e.venue_id is null
),unique_refs as(select id from refs group by id having count(distinct venue_id)=1), candidates as materialized(
 select r.*,e.data_source,e.start_date,e.title,e.latitude,e.longitude,v.latitude venue_latitude,v.longitude venue_longitude,
 e.updated_at,md5(to_jsonb(e)::text)event_fingerprint,md5(to_jsonb(v)::text)venue_fingerprint,
 case when e.field_provenance#>>'{latitude,source}'='derived:city_centroid'
  and e.field_provenance#>>'{longitude,source}'='derived:city_centroid'
  and pg_input_is_valid(e.field_provenance#>>'{latitude,value}','numeric')and pg_input_is_valid(e.field_provenance#>>'{longitude,value}','numeric')
 then e.latitude=(e.field_provenance#>>'{latitude,value}')::numeric and e.longitude=(e.field_provenance#>>'{longitude,value}')::numeric
 else e.latitude is null and e.longitude is null and not(coalesce(e.field_provenance,'{}')?|array['latitude','longitude'])end copy_pin
 from refs r join unique_refs u using(id)join public.events e on e.id=r.id join public.venues v on v.id=r.venue_id
 join public.countries co on co.id=e.country_id join public.cities ci on ci.id=e.city_id
 where e.duplicate_of_id is null and e.venue_id is null and e.is_public=true and e.safety_gated is not true
 and coalesce(e.status,'active')not in('cancelled','archived','rejected')and v.closed_at is null
 and e.city_id=v.city_id and e.country_id=v.country_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
 and e.country=co.code and r.n#>>'{location,country}'=co.code and r.vn#>>'{location,country}'=co.code
 and public.city_canonical_key(r.n#>>'{location,city}')=public.city_canonical_key(ci.name)
 and public.city_canonical_key(r.vn#>>'{location,city}')=public.city_canonical_key(ci.name)
 and r.n->>'sourceId'=e.external_id and r.n->>'sourceName'=e.data_source and r.n#>>'{metadata,source}'=e.data_source
 and r.vn->>'sourceId'=r.n#>>'{metadata,venue_source_id}'and r.vn->>'sourceName'=e.data_source
 and r.vn#>>'{metadata,source}'=e.data_source and r.n->>'entityType'='event'and r.vn->>'entityType'='venue'
 and r.event_payload_hash~'^[a-f0-9]{64}$'and r.venue_payload_hash~'^[a-f0-9]{64}$'
 and case when pg_input_is_valid(coalesce(nullif(r.n->>'start_date',''),r.n#>>'{dates,start}'),'timestamp with time zone')
  then coalesce(nullif(r.n->>'start_date',''),r.n#>>'{dates,start}')::timestamptz=e.start_date else false end
 and coalesce(jsonb_typeof(e.field_provenance),'object')='object'
 and not(coalesce(e.field_provenance,'{}')?|array['venue_id','venue_name'])
 and lower(coalesce(e.field_provenance#>>'{country_id,human_reviewed}','false'))<>'true'
 and lower(coalesce(e.field_provenance#>>'{country_id,source}',''))not in('human','manual','user','admin')
 and length(btrim(r.n#>>'{location,address}'))>=6 and r.n#>>'{location,address}'~'[0-9]'
 and regexp_replace(lower(r.n#>>'{location,address}'),'[^[:alnum:]]+',' ','g')=regexp_replace(lower(r.vn#>>'{location,address}'),'[^[:alnum:]]+',' ','g')
 and position(' '||btrim(regexp_replace(lower(r.n#>>'{location,address}'),'[^[:alnum:]]+',' ','g'))||' 'in
  ' '||btrim(regexp_replace(lower(v.address),'[^[:alnum:]]+',' ','g'))||' ')>0
 and r.n#>>'{location,postal_code}'~'^[0-9]{4,5}$'and r.vn#>>'{location,postal_code}'=r.n#>>'{location,postal_code}'
 and(v.postal_code=r.n#>>'{location,postal_code}'or v.address~('(^|[^0-9])'||(r.n#>>'{location,postal_code}')||'([^0-9]|$)'))
 and not exists(select 1 from public.content_revisions cr where cr.source_table='events'and cr.source_id=e.id and cr.actor_kind='human'
  and cr.changed_fields&&array['venue_id','venue_name','city_id','country_id','external_id','data_source'])
 and not exists(select 1 from public.review_queue q where q.entity_type='event'and q.entity_id=e.id and q.review_type='venue_link_candidate'
  and(q.resolved_by is not null or q.status='pending'and(lower(q.details->>'hard_blocker')='true'or lower(q.details->>'requires_confirm')='true'or lower(q.details->>'force_review')='true'or lower(q.details->>'human_reviewed')='true')))
 and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id and i.issue_code='NAMED_VENUE_UNLINKED'and i.reviewed_by is not null)
),verified_venue_geo as materialized(
 select v.id from(select distinct venue_id from candidates)r join public.venues v on v.id=r.venue_id
 join public.countries co on co.id=v.country_id
 where v.latitude between -90 and 90 and v.longitude between -180 and 180 and(v.latitude<>0 or v.longitude<>0)
 and exists(select 1 from public.geo_country_at(v.latitude,v.longitude)g where g.iso_a2=co.code)
),eligible as(
 select c.*from candidates c join verified_venue_geo vg on vg.id=c.venue_id where
 (copy_pin and(latitude is null or public.haversine_m(latitude::numeric,longitude::numeric,venue_latitude::numeric,venue_longitude::numeric)<=20000)
  and not exists(select 1 from public.content_revisions cr where cr.source_table='events'and cr.source_id=c.id and cr.actor_kind='human'and cr.changed_fields&&array['latitude','longitude']))
 or(not copy_pin and public.haversine_m(latitude::numeric,longitude::numeric,venue_latitude::numeric,venue_longitude::numeric)<=100)
)
select c.*,to_jsonb(e)old_event from eligible c join public.events e on e.id=c.id
 join public.venues v on v.id=c.venue_id join public.event_sources es on es.id=c.event_source_id
 join public.venue_sources vs on vs.id=c.venue_source_id
 where md5(to_jsonb(e)::text)=c.event_fingerprint and md5(to_jsonb(v)::text)=c.venue_fingerprint
 and md5(to_jsonb(es)::text)=c.event_source_fingerprint and md5(to_jsonb(vs)::text)=c.venue_source_fingerprint
 and not exists(select 1 from public.events other where other.id<>c.id and other.duplicate_of_id is null
  and other.venue_id=c.venue_id and other.start_date=c.start_date and lower(btrim(other.title))=lower(btrim(c.title)))
 and not exists(select 1 from eligible peer where peer.id<>c.id and peer.venue_id=c.venue_id
  and peer.start_date=c.start_date and lower(btrim(peer.title))=lower(btrim(c.title)))
 order by e.id limit greatest(0,least(coalesce(p_batch,0),200))for update of e skip locked for share of v,es,vs skip locked
 loop
  -- A human reviewing the source finding wins over a concurrent repairec.
  begin
   perform 1 from public.review_queue q where q.entity_type='event'and q.entity_id=rec.id
    and q.review_type='venue_link_candidate'for update nowait;
   perform 1 from public.event_quality_issues i where i.event_id=rec.id and i.issue_code='NAMED_VENUE_UNLINKED'for update nowait;
  exception when lock_not_available then continue;end;
  if exists(select 1 from public.review_queue q where q.entity_type='event'and q.entity_id=rec.id and q.review_type='venue_link_candidate'
   and(q.resolved_by is not null or q.status='pending'and(lower(q.details->>'hard_blocker')='true'or lower(q.details->>'requires_confirm')='true'or lower(q.details->>'force_review')='true'or lower(q.details->>'human_reviewed')='true')))
   or exists(select 1 from public.event_quality_issues i where i.event_id=rec.id and i.issue_code='NAMED_VENUE_UNLINKED'and i.reviewed_by is not null)
  then continue;end if;
  candidates:=candidates+1;selected_ids:=array_append(selected_ids,rec.id);
  if p_dry_run is distinct from false then continue;end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]')into old_reviews from public.review_queue q
   where q.entity_type='event'and q.entity_id=rec.id and q.review_type='venue_link_candidate'and q.status='pending';
  select coalesce(jsonb_agg(to_jsonb(i)),'[]')into old_issues from public.event_quality_issues i
   where i.event_id=rec.id and i.issue_code='NAMED_VENUE_UNLINKED'and i.status='open'and i.detector='event-quality-scan'
    and i.reviewed_by is null and i.reviewed_at is null;
  perform set_config('app.actor','system:publisher-venue-reference:v1',true);
  update public.events e set venue_id=rec.venue_id,
   latitude=case when rec.copy_pin then rec.venue_latitude else e.latitude end,
   longitude=case when rec.copy_pin then rec.venue_longitude else e.longitude end,
   updated_at=now(),field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('venue_id',
    jsonb_build_object('source','publisher_venue_reference:v1','source_ref',rec.venue_id,'at',now(),'human_reviewed',false,
     'event_source_id',rec.event_source_id,'venue_source_id',rec.venue_source_id,'publisher_venue_key',rec.n#>>'{metadata,venue_source_id}',
     'event_payload_hash',rec.event_payload_hash,'venue_payload_hash',rec.venue_payload_hash,'previous_value',e.venue_id,
     'event_binding',rec.n,'venue_binding',rec.vn))||case when rec.copy_pin then jsonb_build_object(
      'latitude',jsonb_build_object('source','publisher_venue_reference:v1','source_ref',rec.venue_id,'value',rec.venue_latitude,
       'previous_value',e.latitude,'previous_provenance',e.field_provenance->'latitude','at',now(),'human_reviewed',false),
      'longitude',jsonb_build_object('source','publisher_venue_reference:v1','source_ref',rec.venue_id,'value',rec.venue_longitude,
       'previous_value',e.longitude,'previous_provenance',e.field_provenance->'longitude','at',now(),'human_reviewed',false))else '{}'end
   where e.id=rec.id returning to_jsonb(e)into after_row;
  if after_row-array['venue_id','latitude','longitude','updated_at','field_provenance','geo_linked_at','safety_gated']
    is distinct from rec.old_event-array['venue_id','latitude','longitude','updated_at','field_provenance','geo_linked_at','safety_gated']
   or(after_row->'field_provenance')-array['venue_id','latitude','longitude','country_id']
    is distinct from coalesce(nullif(rec.old_event->'field_provenance','null'::jsonb),'{}')-array['venue_id','latitude','longitude','country_id']
   or(not rec.copy_pin and(after_row->'latitude'is distinct from rec.old_event->'latitude'or after_row->'longitude'is distinct from rec.old_event->'longitude'))
   or after_row->>'venue_id'is distinct from rec.venue_id::text
  then raise exception 'Source venue reference changed protected event state %',rec.id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('event',rec.id,'publisher_venue_reference:v1',rec.old_event,after_row);
  -- The native venue-link trigger owns general-review reconciliation.
  for before_item in select value from jsonb_array_elements(old_reviews)loop
   select to_jsonb(q)into after_item from public.review_queue q where q.id=(before_item->>'id')::uuid;
   if after_item->>'status'is distinct from 'resolved'then raise exception 'Native venue review did not reconcile %',rec.id;end if;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('review_queue',(before_item->>'id')::uuid,'publisher_venue_reference_review:v1',before_item,after_item);
   review_count:=review_count+1;
  end loop;
  for before_item in select value from jsonb_array_elements(old_issues)loop
   if not exists(select 1 from public.event_quality_findings(rec.id)f where f.issue_code='NAMED_VENUE_UNLINKED')then
    update public.event_quality_issues i set status='resolved',resolved_at=now(),
     resolution='Automatic repair: publisher venue reference, matching street/postcode and canonical geography; no human review claimed'
     where i.id=(before_item->>'id')::uuid returning to_jsonb(i)into after_item;
    insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
     values('event_quality_issue',(before_item->>'id')::uuid,'publisher_venue_reference_finding:v1',before_item,after_item);
    issue_count:=issue_count+1;
   end if;
  end loop;
  if not exists(select 1 from public.event_quality_findings(rec.id)f where f.issue_code='NAMED_VENUE_UNLINKED')then
   update public.event_quality_current set issue_codes=array_remove(issue_codes,'NAMED_VENUE_UNLINKED'),
    open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED')where event_id=rec.id;
  end if;
  linked:=linked+1;if rec.copy_pin then pins:=pins+1;end if;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'candidates',candidates,'linked_events',linked,'corrected_pins',pins,
  'resolved_review_findings',review_count,'resolved_quality_findings',issue_count,'event_ids',to_jsonb(selected_ids));
end
$fn$;
revoke all on function api_private.reconcile_source_referenced_event_venues(integer,boolean)from public,anon,authenticated;
grant execute on function api_private.reconcile_source_referenced_event_venues(integer,boolean)to service_role;

-- Use the existing linker cadence, pause state and run journal.
do $hook$
declare definition text;
 call_anchor text:='v_source_result := public.reconcile_agendaq_event_venues(100,false);';
 result_anchor text:='v_result := v_result || public.reconcile_event_venue_quality_reviews(500,false);';
begin
 definition:=pg_get_functiondef('public.run_event_venue_link()'::regprocedure);
 if(length(definition)-length(replace(definition,call_anchor,'')))/length(call_anchor)<>1
 or(length(definition)-length(replace(definition,result_anchor,'')))/length(result_anchor)<>1
 or(length(definition)-length(replace(definition,'v_source_result jsonb;','')))/length('v_source_result jsonb;')<>1
 then raise exception 'Event venue source-reference hook changed';end if;
 definition:=replace(definition,'v_source_result jsonb;','v_source_result jsonb; v_reference_result jsonb;');
 definition:=replace(definition,call_anchor,call_anchor||E'\n v_reference_result := api_private.reconcile_source_referenced_event_venues(100,false);');
 definition:=replace(definition,result_anchor,
  'v_result := v_result || jsonb_build_object(''source_venue_references'',v_reference_result,
  ''candidates'',coalesce((v_result->>''candidates'')::int,0)+coalesce((v_reference_result->>''candidates'')::int,0),
  ''linked'',coalesce((v_result->>''linked'')::int,0)+coalesce((v_reference_result->>''linked_events'')::int,0));'||E'\n '||result_anchor);
 execute definition;
end $hook$;
