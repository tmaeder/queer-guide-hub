-- A completed event with a corroborated street location can remain useful
-- with its source venue label. Keep it eligible for background venue matching.
create or replace function api_private.event_has_corroborated_historical_agendaq_location(p_event_id uuid)
returns boolean
language sql stable set search_path='' as $fn$
  select exists (
    select 1
    from public.events e
    join public.countries country on country.id=e.country_id
    join public.event_sources s on s.event_id=e.id and s.is_primary
      and s.source_slug=e.data_source and s.source_entity_id=e.external_id
    where e.id=p_event_id and e.data_source='agendaq' and e.status='completed'
      and e.is_public and not e.safety_gated and e.duplicate_of_id is null
      and e.venue_id is null and e.city_id is not null
      and nullif(btrim(e.venue_name),'') is not null
      and e.start_date is not null and (e.end_date is null or e.end_date>=e.start_date)
      and coalesce(e.end_date,e.start_date)<now()-interval '7 days'
      and e.external_id ~ '^[a-z0-9-]+$'
      and s.source_url='https://www.agendaq.fr/fr/agenda/'||e.external_id
      and s.payload#>>'{raw,slug}'=e.external_id and s.payload_hash ~ '^[a-f0-9]{64}$'
      and s.payload#>>'{raw,name}'=e.title and s.payload#>>'{normalized,venue_name}'=e.venue_name
      and case when jsonb_typeof(s.payload#>'{raw,locations}')='array'
        then jsonb_array_length(s.payload#>'{raw,locations}')=1 else false end
      and s.payload#>'{normalized,location,approximate}'='false'::jsonb
      and coalesce(s.payload#>'{raw,locations,0,approx}','false'::jsonb)='false'::jsonb
      and btrim(e.address) ~ '^[0-9]+[[:alpha:]]?[[:space:],]+[^[:space:],]'
      and btrim(e.address)=btrim(s.payload#>>'{raw,locations,0,label}')
      and btrim(e.address)=btrim(s.payload#>>'{normalized,location,address}')
      and nullif(btrim(s.payload#>>'{raw,locations,0,addr,street}'),'') is not null
      and nullif(btrim(e.city),'') is not null
      and lower(btrim(e.city))=lower(btrim(s.payload#>>'{raw,locations,0,addr,city}'))
      and s.payload#>>'{raw,locations,0,cc}'=country.code
      and case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamptz')
        then e.start_date=(s.payload#>>'{raw,start}')::timestamptz else false end
      and case when e.end_date is null then s.payload#>>'{raw,end}' is null
        when pg_input_is_valid(s.payload#>>'{raw,end}','timestamptz')
        then e.end_date=(s.payload#>>'{raw,end}')::timestamptz else false end
      and e.latitude between -90 and 90 and e.longitude between -180 and 180
      and (e.latitude<>0 or e.longitude<>0)
      and case when jsonb_typeof(s.payload#>'{raw,locations,0,lat}')='number'
        and jsonb_typeof(s.payload#>'{raw,locations,0,lon}')='number'
        then (s.payload#>>'{raw,locations,0,lat}')::numeric between -90 and 90
          and (s.payload#>>'{raw,locations,0,lon}')::numeric between -180 and 180
          and public.haversine_m(e.latitude,e.longitude,
            (s.payload#>>'{raw,locations,0,lat}')::numeric,(s.payload#>>'{raw,locations,0,lon}')::numeric)<50
        else false end
      and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id)
      and not exists(select 1 from public.content_revisions h
        where h.source_table='events' and h.source_id=e.id and h.actor_kind='human'
        and h.changed_fields&&array['venue_id','address','city','city_id',
          'latitude','longitude','start_date','end_date'])
      and not exists(select 1 from public.review_queue q where q.entity_type='event'
        and q.entity_id=e.id and q.review_type='venue_link_candidate'
        and (q.resolved_by is not null or q.status='pending'
          and (q.resolved_at is not null or q.details ?| array['manual_hold','manual_review_required',
            'requires_confirm','force_review','human_reviewed'] or q.details->>'hard_blocker'='true')))
      and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
        and i.issue_code='NAMED_VENUE_UNLINKED'
        and (i.reviewed_by is not null or i.status='open' and
          (i.reviewed_at is not null or i.resolved_at is not null or i.resolution is not null
            or i.evidence ?| array['manual_hold','manual_review_required','governance_resolution']
            or i.evidence->>'hard_blocker'='true')))
  );
$fn$;
revoke all on function api_private.event_has_corroborated_historical_agendaq_location(uuid) from public,anon,authenticated;
grant execute on function api_private.event_has_corroborated_historical_agendaq_location(uuid) to service_role;

do $patch$
declare
  definition text:=pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure);
  code_definition text:=regexp_replace(pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  anchor text:='and (start_date is null or start_date >= now() - interval ''1 year'')';
  exclusion text:='and not case when e.data_source=''agendaq'' and coalesce(e.end_date,e.start_date)<now()-interval ''7 days''
          then api_private.event_has_corroborated_historical_agendaq_location(e.id) else false end';
begin
  if position(exclusion in code_definition)>0 then return; end if;
  if (length(code_definition)-length(replace(code_definition,anchor,'')))/length(anchor)<>1
     or (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Named venue finding scope changed';
  end if;
  execute replace(definition,anchor,anchor||E'\n        '||exclusion);
end $patch$;
