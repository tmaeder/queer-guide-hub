-- AgendaQ's venue field can inherit an associated organization. Recover the
-- physical location from the exact occurrence capture before it reaches staff.
create function api_private.reconcile_agendaq_location_labels(
  p_batch integer default 100,p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record; before_q jsonb; after_q jsonb; before_issue jsonb; after_issue jsonb; event_after jsonb;
  loc_proof jsonb; ids uuid[]:='{}'; cleared uuid[]:='{}'; native_evidence jsonb;
  eligible integer:=0;
  batch_limit integer:=greatest(0,least(coalesce(p_batch,100),200));
begin
  perform public.assert_admin_or_internal();
  if auth.uid() is not null or exists(select 1 from public.admin_automations
    where slug in('review_automatic_resolution','event_venue_link') and not enabled)
  then return jsonb_build_object('skipped','paused'); end if;
  if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then return jsonb_build_object('skipped','already_running'); end if;
  for r in
  with targets as materialized (
    select i.event_id id from public.event_quality_issues i
     where i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open'
    union
    select q.entity_id id from public.review_queue q
     where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
  ), candidates as materialized (
   select e.id,s.id source_id,s.payload_hash source_payload_hash,e.updated_at event_updated_at,
    l,e.venue_name,
    case
      when co.code='FR' and l#>>'{addr,sn}' is null
       and l#>>'{addr,street}'~*'^(place|placette|parvis|voie)[[:space:]]'
       and public.city_canonical_key(replace(l->>'label',',',' '))=public.city_canonical_key(concat_ws(' ',l#>>'{addr,street}',l#>>'{addr,city}',l#>>'{addr,pc}'))
       and e.title~*'(marche|rassemblement|commémoration|journée du souvenir|manifestation|footing|pique-nique|village des fiertés|journée mondiale)'
      then 'public_address'
      when position(public.city_canonical_key(l#>>'{addr,street}') in public.city_canonical_key(l->>'label'))=0
       and l->>'label' !~* '(secret|confidentiel|privé|adresse.*communiqu|lieu.*communiqu|à préciser|en ligne|online|multiple|rendez-vous)'
       and public.city_canonical_key(l->>'label') is distinct from public.city_canonical_key(ci.name)
      then 'publisher_location'
    end mode
   from targets t join public.events e on e.id=t.id
   join public.event_sources s on s.event_id=e.id and s.source_slug='agendaq' and s.source_entity_id=e.external_id
   join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
   join public.countries co on co.id=e.country_id
   cross join lateral jsonb_array_elements(case when jsonb_typeof(s.payload#>'{raw,locations}')='array'
    then s.payload#>'{raw,locations}' else '[]'::jsonb end) l
   where e.data_source='agendaq' and e.venue_id is null and e.duplicate_of_id is null
    and e.is_public and not e.safety_gated and e.status in ('active','completed')
    and e.external_id~'^[a-z0-9-]+$' and s.source_url='https://www.agendaq.fr/fr/agenda/'||e.external_id
    and s.payload#>>'{raw,slug}'=e.external_id and s.payload#>>'{raw,name}'=e.title
    and s.payload_hash~'^[0-9a-f]{64}$'
    and case when pg_input_is_valid(s.payload#>>'{normalized,start_date}','timestamptz')
      then (s.payload#>>'{normalized,start_date}')::timestamptz=e.start_date else false end
    and l->>'approx' is distinct from 'true' and l->>'id'~'^[1-9][0-9]*$'
    and l->>'cc'=co.code and public.city_canonical_key(l#>>'{addr,city}')=public.city_canonical_key(ci.name)
    and nullif(btrim(l#>>'{addr,street}'),'') is not null and nullif(btrim(l#>>'{addr,pc}'),'') is not null
    and l->>'label'=e.address and l->>'label'=s.payload#>>'{normalized,location,address}'
    and char_length(l->>'label') between 3 and 140
    and public.city_canonical_key(l->>'label')<>public.city_canonical_key(e.venue_name)
    and case when pg_input_is_valid(l->>'lat','numeric') and pg_input_is_valid(l->>'lon','numeric')
      then e.latitude=round((l->>'lat')::numeric,8) and e.longitude=round((l->>'lon')::numeric,8)
      else false end
    and (select count(*) from jsonb_array_elements(s.payload#>'{raw,locations}') physical
      where physical->>'approx' is distinct from 'true'
      and nullif(btrim(physical#>>'{addr,street}'),'') is not null)=1
    and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s.payload#>'{raw,businesses}')='array'
      then s.payload#>'{raw,businesses}' else '[]'::jsonb end) b where b->>'name'=e.venue_name)
    and not coalesce(e.field_provenance,'{}') ? 'venue_id'
    and (not coalesce(e.field_provenance,'{}') ? 'venue_name'
      or (e.field_provenance#>>'{venue_name,source}'='agendaq_location_label:v1'
       and e.field_provenance#>>'{venue_name,human_reviewed}'='false'
       and e.field_provenance#>>'{venue_name,previous_value}'=e.venue_name
       and e.field_provenance#>>'{venue_name,source_id}'=s.id::text
       and e.field_provenance#>>'{venue_name,payload_hash}'=s.payload_hash
       and e.field_provenance#>'{venue_name,location}'=l))
    and not exists(select 1 from public.event_sources peer where peer.event_id=e.id and peer.id<>s.id)
    and not exists(select 1 from public.content_revisions h where h.source_table='events' and h.source_id=e.id
      and h.actor_kind='human' and h.changed_fields&&array['venue_name','venue_id','address','city_id','country_id','latitude','longitude','external_id','data_source'])
  )
  select x.*,to_jsonb(e) old_event,s.source_url,s.payload_hash
   from candidates x join public.events e on e.id=x.id join public.event_sources s on s.id=x.source_id
   where x.mode is not null and e.venue_id is null and e.venue_name=x.venue_name
    and e.updated_at is not distinct from x.event_updated_at and s.payload_hash=x.source_payload_hash
   order by (x.mode='public_address') desc,x.id
   limit batch_limit for update of e skip locked for share of s skip locked
  loop
    begin
      perform 1 from public.review_queue q where q.entity_type='event' and q.entity_id=r.id and q.review_type='venue_link_candidate' for update nowait;
      perform 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED' for update nowait;
    exception when lock_not_available then continue; end;
    if exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=r.id and q.review_type='venue_link_candidate'
      and(q.resolved_by is not null or lower(q.details->>'hard_blocker')='true' or lower(q.details->>'requires_confirm')='true'
        or lower(q.details->>'force_review')='true' or lower(q.details->>'human_reviewed')='true' or lower(q.details->>'manual_hold')='true'))
      or exists(select 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED'
      and(i.reviewed_by is not null or lower(i.evidence->>'manual_hold')='true' or lower(i.evidence->>'manual_review_required')='true'))
    then continue; end if;

    eligible:=eligible+1;
    if p_dry_run is distinct from false then continue; end if;
    loc_proof:=jsonb_build_object('source','agendaq_location_label:v1','source_id',r.source_id,'source_url',r.source_url,
      'payload_hash',r.payload_hash,'location_id',r.l->>'id','location',r.l,
      'previous_value',r.venue_name,'mode',r.mode,'at',now(),'human_reviewed',false);
    update public.events e set venue_name=case when r.mode='public_address' then null else r.l->>'label' end,
      field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('venue_name',loc_proof),updated_at=now()
    where e.id=r.id returning to_jsonb(e) into event_after;
    if event_after-array['venue_name','field_provenance','updated_at','geo_linked_at']
       is distinct from r.old_event-array['venue_name','field_provenance','updated_at','geo_linked_at']
      or (event_after->'field_provenance')-array['venue_name','country_id']
       is distinct from (r.old_event->'field_provenance')-array['venue_name','country_id']
    then raise exception 'Protected event fields changed %',r.id; end if;
    insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('event',r.id,'agendaq_location_label_'||r.mode||':v1',r.old_event,event_after);
    ids:=array_append(ids,r.id);

    for before_q in select to_jsonb(q) from public.review_queue q where q.entity_type='event' and q.entity_id=r.id
      and q.review_type='venue_link_candidate' and q.status='pending' loop
      update public.review_queue q set
       status=case when r.mode='public_address' then 'resolved' else q.status end,
       resolved_at=case when r.mode='public_address' then now() else q.resolved_at end,
       details=coalesce(q.details,'{}')||jsonb_build_object('event_venue_name',event_after->'venue_name','candidates','[]'::jsonb,
         'publisher_location',loc_proof,'human_reviewed',false)
      where q.id=(before_q->>'id')::uuid returning to_jsonb(q) into after_q;
      insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
      values('review_queue',(before_q->>'id')::uuid,'agendaq_location_label_'||r.mode||':v1',before_q,after_q);
    end loop;

    if r.mode='public_address' then
      if exists(select 1 from public.event_quality_findings(r.id) where issue_code='NAMED_VENUE_UNLINKED')
      then raise exception 'Native event quality finding remains %',r.id; end if;
      for before_issue in select to_jsonb(i) from public.event_quality_issues i where i.event_id=r.id
        and i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open' and i.detector='event-quality-scan' loop
        update public.event_quality_issues i set status='resolved',resolved_at=now(),
         resolution='Automatic: AgendaQ lists a public street or square as this occurrence location.'
        where i.id=(before_issue->>'id')::uuid returning to_jsonb(i) into after_issue;
        insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
        values('event_quality_issue',(before_issue->>'id')::uuid,'agendaq_location_label_public_address:v1',before_issue,after_issue);
      end loop;
      update public.event_quality_current set issue_codes=array_remove(issue_codes,'NAMED_VENUE_UNLINKED'),
       open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED') where event_id=r.id;
      cleared:=array_append(cleared,r.id);
    else
      select f.evidence into native_evidence from public.event_quality_findings(r.id) f
        where f.issue_code='NAMED_VENUE_UNLINKED';
      if native_evidence is not null then
        for before_issue in select to_jsonb(i) from public.event_quality_issues i where i.event_id=r.id
          and i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open' and i.detector='event-quality-scan' loop
          update public.event_quality_issues i set evidence=native_evidence,evidence_hash=md5(native_evidence::text)
          where i.id=(before_issue->>'id')::uuid returning to_jsonb(i) into after_issue;
          insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
          values('event_quality_issue',(before_issue->>'id')::uuid,'agendaq_location_label_publisher_location:v1',before_issue,after_issue);
        end loop;
      end if;
    end if;
  end loop;
  return jsonb_build_object('dry_run',p_dry_run is distinct from false,'eligible',eligible,
    'corrected',cardinality(ids),'street_cases',cardinality(cleared),'event_ids',ids,'street_ids',cleared);
end $fn$;

revoke all on function api_private.reconcile_agendaq_location_labels(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_agendaq_location_labels(integer,boolean) to service_role;

-- Continue to permit the stronger native linker to match the repaired label.
-- Only the exact machine proof and source revision can relax its provenance guard.
do $linker$
declare
  definition text:=pg_get_functiondef('public.reconcile_agendaq_event_venues(integer,boolean)'::regprocedure);
  anchor text:=$before$and not(coalesce(e.field_provenance,'{}') ? 'venue_id') and not(coalesce(e.field_provenance,'{}') ? 'venue_name')$before$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'AgendaQ venue provenance contract changed';
  end if;
  execute replace(definition,anchor,$after$and not(coalesce(e.field_provenance,'{}') ? 'venue_id')
   and (
     not(coalesce(e.field_provenance,'{}') ? 'venue_name')
     or (e.field_provenance#>>'{venue_name,source}'='agendaq_location_label:v1'
       and e.field_provenance#>>'{venue_name,mode}'='publisher_location'
       and e.field_provenance#>>'{venue_name,human_reviewed}'='false'
       and e.field_provenance#>>'{venue_name,source_id}'=sm.event_source_id::text
       and e.field_provenance#>>'{venue_name,payload_hash}'=sm.event_hash
       and e.field_provenance#>>'{venue_name,location_id}'=sm.location_id
       and e.field_provenance#>'{venue_name,location}'=sm.event_location
       and e.venue_name=sm.event_location->>'label'
       and lower(btrim(sm.source_venue_name))=lower(btrim(v.name))
       and lower(btrim(e.venue_name))=lower(btrim(v.name))
       and not exists(select 1 from public.content_revisions h where h.source_table='events'
         and h.source_id=e.id and h.actor_kind='human' and h.changed_fields&&array['venue_name','venue_id']))
   )$after$);
end $linker$;

-- Use the existing scheduler and keep source-linked matches first.
do $schedule$
declare
  definition text:=pg_get_functiondef('public.run_event_venue_link()'::regprocedure);
  anchor text:=$before$v_result := public.link_event_venues(500, true, false);$before$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Event venue automation contract changed';
  end if;
  execute replace(definition,anchor,$after$v_result := public.link_event_venues(500, true, false);
  v_result := v_result || jsonb_build_object('source_location_labels',
    api_private.reconcile_agendaq_location_labels(100,false));$after$);
end $schedule$;
