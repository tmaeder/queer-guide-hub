-- Venue aliases can differ from the catalogue name. Require a second,
-- exact physical binding before the existing linker can accept an alias.
do $patch$
declare
  definition text;
  anchor text;
  replacement text;
  patches text[][] := array[
    array[$a$es.payload#>'{raw,locations}' locations$a$,
      $b$es.payload#>'{raw,locations}' locations, es.payload#>'{raw,businesses}' businesses,
      es.payload#>>'{normalized,start_date}' source_start$b$],
    array[$a$el->>'cc' source_country$a$,
      $b$el->>'cc' source_country, es.source_entity_id, es.payload_hash event_hash, vs.payload_hash venue_hash,
      es.source_start, es.businesses, el event_location, vs.loc venue_location,
      (select count(*) from jsonb_array_elements(
        case when jsonb_typeof(es.locations)='array' then es.locations else '[]'::jsonb end
      ) physical where physical->>'approx' is distinct from 'true'
       and nullif(btrim(physical#>>'{addr,street}'),'') is not null) physical_count$b$],
    array[$a$and lower(btrim(sm.source_venue_name))=lower(btrim(v.name))$a$,
      $b$and (
        lower(btrim(sm.source_venue_name))=lower(btrim(v.name))
        or (
          e.data_source='agendaq' and e.external_id=sm.source_entity_id
          and e.is_public and not e.safety_gated and not v.safety_gated and ci.duplicate_of_id is null
          and sm.event_hash~'^[0-9a-f]{64}$' and sm.venue_hash~'^[0-9a-f]{64}$'
          and sm.physical_count=1
          and case when pg_input_is_valid(sm.source_start,'timestamptz')
            then sm.source_start::timestamptz=e.start_date else false end
          and public.city_canonical_key(sm.event_location#>>'{addr,city}')=public.city_canonical_key(ci.name)
          and nullif(btrim(sm.event_location#>>'{addr,street}'),'') is not null
          and sm.venue_location#>>'{addr,street}'=sm.event_location#>>'{addr,street}'
          and sm.venue_location#>>'{addr,pc}'=sm.event_location#>>'{addr,pc}'
          and sm.venue_location->>'lat'=sm.event_location->>'lat'
          and sm.venue_location->>'lon'=sm.event_location->>'lon'
          and position(public.city_canonical_key(sm.event_location#>>'{addr,street}')
            in public.city_canonical_key(v.address))>0
          and (v.postal_code=sm.event_location#>>'{addr,pc}' or v.address like '%'||(sm.event_location#>>'{addr,pc}')||'%')
          and case when pg_input_is_valid(sm.event_location->>'lat','numeric')
            and pg_input_is_valid(sm.event_location->>'lon','numeric')
            then e.latitude=round((sm.event_location->>'lat')::numeric,8)
              and e.longitude=round((sm.event_location->>'lon')::numeric,8)
            else false end
          and exists(select 1 from jsonb_array_elements(
            case when jsonb_typeof(sm.businesses)='array' then sm.businesses else '[]'::jsonb end
          ) business where business->>'name'=e.venue_name)
          and not exists(select 1 from public.content_revisions h where h.source_table='events'
            and h.source_id=e.id and h.actor_kind='human'
            and h.changed_fields&&array['venue_id','venue_name','city_id','country_id','external_id','data_source'])
          and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
            and i.issue_code='NAMED_VENUE_UNLINKED' and (i.reviewed_by is not null
             or ((i.reviewed_at is not null or i.resolution is not null) and not coalesce(
               i.status='accepted' and i.resolution='Accepted after exact-match review: no single unambiguous live canonical venue exists in the same city; retain the source venue name without guessing a link.',false))
             or lower(i.evidence->>'manual_hold')='true' or lower(i.evidence->>'manual_review_required')='true'))
          and not exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=e.id
            and q.review_type='venue_link_candidate' and (q.resolved_by is not null
             or lower(q.details->>'human_reviewed')='true' or lower(q.details->>'manual_hold')='true'))
        )
      )$b$],
    array[$a$sm.event_source_id,sm.venue_source_id,sm.location_id,sm.event_source_url,sm.venue_source_url,e.updated_at,$a$,
      $b$sm.event_source_id,sm.venue_source_id,sm.location_id,sm.event_source_url,sm.venue_source_url,e.updated_at,
       sm.event_hash expected_event_hash,sm.venue_hash expected_venue_hash,md5(to_jsonb(v)::text) expected_venue_row,$b$],
    array[$a$where e.updated_at=s.updated_at and e.venue_id is null$a$,
      $b$where e.updated_at=s.updated_at and e.venue_id is null
       and es.payload_hash is not distinct from s.expected_event_hash
       and vs.payload_hash is not distinct from s.expected_venue_hash
       and md5(to_jsonb(v)::text)=s.expected_venue_row$b$]
  ];
begin
  definition:=regexp_replace(pg_get_functiondef('public.reconcile_agendaq_event_venues(integer,boolean)'::regprocedure),
    $strip$('(?:[^']|'')*'|"(?:[^"]|"")*")|--[^$strip$||chr(10)||']*',
    $keep$\1$keep$,'g');
  for i in 1..array_length(patches,1) loop
    anchor:=patches[i][1];
    replacement:=patches[i][2];
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
      raise exception 'AgendaQ venue linker contract changed at patch %',i;
    end if;
    definition:=replace(definition,anchor,replacement);
  end loop;
  execute definition;
end $patch$;
