-- The event page can use the original physical location without a venue row.
-- Keep matching and review enabled when there is a plausible directory entry.
create function api_private.event_source_confirms_ticketmaster_location(
  p_id uuid, p_source text, p_external_id text, p_venue_name text, p_address text
) returns boolean
language sql stable set search_path='' as $fn$
  select case when p_source='ticketmaster'
    and p_external_id ~ '^[A-Za-z0-9_-]+$'
    and p_address ~ '^[[:space:]]*[0-9]+[[:alnum:]-]*[[:space:]]+[[:alpha:]]'
    and length(btrim(p_venue_name))>=3
  then exists (
    select 1
    from public.events e
    join public.event_sources s on s.event_id=e.id
      and s.source_slug=p_source and s.source_entity_id=p_external_id
    join public.cities c on c.id=e.city_id and c.country_id=e.country_id
      and c.duplicate_of_id is null and c.shell_status='real'
    join public.countries co on co.id=e.country_id
    cross join lateral (select s.payload#>'{raw,_embedded,venues,0}' venue) publisher
    where e.id=p_id and e.data_source=p_source and e.external_id=p_external_id
      and e.is_public and not e.safety_gated and e.duplicate_of_id is null
      and e.venue_id is null and e.status in ('active','completed')
      and e.venue_name=p_venue_name and e.address=p_address
      and e.country=co.code and co.code='US'
      and not (coalesce(e.field_provenance,'{}') ?| array['venue_id','venue_name','address','latitude','longitude'])
      and s.payload_hash ~ '^[a-f0-9]{64}$'
      and s.payload#>>'{raw,id}'=p_external_id
      and s.payload#>>'{raw,url}' ~ '^https://(www\.)?(ticketmaster\.com|ticketweb\.com)/'
      and (s.source_url is null or s.source_url=s.payload#>>'{raw,url}')
      and s.payload#>>'{normalized,sourceId}'=p_external_id
      and s.payload#>>'{normalized,sourceName}'=p_source
      and s.payload#>>'{normalized,metadata,ticketmaster_id}'=p_external_id
      and s.payload#>>'{raw,name}'=e.title
      and s.payload#>>'{normalized,venue_name}'=p_venue_name
      and s.payload#>>'{normalized,location,address}'=p_address
      and case when pg_input_is_valid(s.payload#>>'{raw,dates,start,dateTime}','timestamptz')
        and pg_input_is_valid(s.payload#>>'{normalized,dates,start}','timestamptz')
        then (s.payload#>>'{raw,dates,start,dateTime}')::timestamptz=e.start_date
          and (s.payload#>>'{normalized,dates,start}')::timestamptz=e.start_date else false end
      and case when jsonb_typeof(s.payload#>'{raw,_embedded,venues}')='array'
        then jsonb_array_length(s.payload#>'{raw,_embedded,venues}')=1 else false end
      and publisher.venue->>'id' ~ '^[A-Za-z0-9_-]+$'
      and publisher.venue->>'name'=p_venue_name
      and publisher.venue#>>'{address,line1}'=p_address
      and nullif(btrim(publisher.venue#>>'{address,line2}'),'') is null
      and publisher.venue#>>'{country,countryCode}'=co.code
      and publisher.venue->>'postalCode' ~ '^[0-9]{5}(-[0-9]{4})?$'
      and public.city_canonical_key(publisher.venue#>>'{city,name}')=public.city_canonical_key(c.name)
      and public.city_canonical_key(p_venue_name)<>public.city_canonical_key(c.name)
      and publisher.venue#>>'{state,stateCode}' ~ '^[A-Z]{2}$'
      and public.city_canonical_key(publisher.venue#>>'{state,name}')=public.city_canonical_key(e.state)
      and e.latitude between -90 and 90 and e.longitude between -180 and 180
      and c.latitude is not null and c.longitude is not null
      and (e.latitude,e.longitude) is distinct from (c.latitude,c.longitude)
      and public.haversine_m(e.latitude,e.longitude,c.latitude,c.longitude) between 20 and 35000
      and case when publisher.venue#>>'{location,latitude}' ~ '^[-+]?[0-9]+(\.[0-9]+)?$'
        and publisher.venue#>>'{location,longitude}' ~ '^[-+]?[0-9]+(\.[0-9]+)?$'
        then abs((publisher.venue#>>'{location,latitude}')::numeric-e.latitude)<0.0000001
          and abs((publisher.venue#>>'{location,longitude}')::numeric-e.longitude)<0.0000001 else false end
      and exists(select 1 from public.geo_country_at(e.latitude,e.longitude) boundary where boundary.iso_a2=co.code)
      and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id)
      and not exists(select 1 from public.venues v where v.city_id=e.city_id and v.duplicate_of_id is null
        and (public.city_canonical_key(v.name)=public.city_canonical_key(p_venue_name)
          or starts_with(
            btrim(regexp_replace(public.city_canonical_key(v.address),'[^[:alnum:]]+',' ','g'))||' ',
            btrim(regexp_replace(public.city_canonical_key(p_address),'[^[:alnum:]]+',' ','g'))||' ')))
      and not exists(select 1 from public.content_revisions h where h.source_table='events'
        and h.source_id=e.id and h.actor_kind='human'
        and h.changed_fields&&array['venue_id','venue_name','address','latitude','longitude','city_id','country_id','start_date'])
      and not exists(select 1 from public.review_queue q where q.entity_type='event'
        and q.entity_id=e.id and q.review_type='venue_link_candidate'
        and (q.resolved_by is not null or q.status='pending' and
          (q.resolved_at is not null or q.details is distinct from jsonb_build_object('source','venue_quality_v2',
           'resolution','no_precision_match','ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',e.venue_name))))
      and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
        and i.issue_code='NAMED_VENUE_UNLINKED' and (i.reviewed_by is not null or i.reviewed_at is not null
          or coalesce(i.evidence,'{}') ?| array['manual_hold','manual_review_required','governance_resolution']))
  ) else false end;
$fn$;
revoke all on function api_private.event_source_confirms_ticketmaster_location(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function api_private.event_source_confirms_ticketmaster_location(uuid,text,text,text,text) to service_role;

-- The ordinary linker still runs and can use a directory entry added later.
do $patch$
declare
  definition text;
  target record;
  anchor text:='not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
  addition text:=' and not api_private.event_source_confirms_ticketmaster_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
begin
  for target in select * from (values
    ('public.event_quality_findings(uuid)'::regprocedure,1),
    ('public.reconcile_event_venue_link_reviews()'::regprocedure,2)
  ) targets(fn,expected) loop
    definition:=pg_get_functiondef(target.fn);
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>target.expected then
      raise exception 'Venue review exclusion changed in %',target.fn;
    end if;
    execute replace(definition,anchor,anchor||addition);
  end loop;
end $patch$;

-- Many Ticketmaster captures have a URL in the raw source only.
do $context$
declare
  definition text:=pg_get_functiondef('api_private.get_event_venue_review_context(uuid,text)'::regprocedure);
  anchor text:=$anchor$'source_url',s.source_url$anchor$;
  replacement text:=$new$'source_url',coalesce(s.source_url,case
    when s.source_slug='ticketmaster' and s.payload#>>'{raw,id}'=s.source_entity_id
      and s.payload#>>'{raw,url}' ~ '^https://(www\.)?(ticketmaster\.com|ticketweb\.com)/'
    then s.payload#>>'{raw,url}' end)$new$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Venue publisher context changed';
  end if;
  execute replace(definition,anchor,replacement);
end $context$;

-- Reuse the new native detector before retiring any existing finding.
with targets as materialized (
  select entity_id id from public.review_queue where entity_type='event'
    and review_type='venue_link_candidate' and status='pending'
  union
  select event_id from public.event_quality_issues where issue_code='NAMED_VENUE_UNLINKED'
    and status='open' and detector='event-quality-scan'
), eligible as materialized (
  select e.id,e.venue_name,s.id source_id,s.payload_hash,
    s.payload#>>'{raw,_embedded,venues,0,id}' publisher_venue_id
  from targets t join public.events e on e.id=t.id
  join public.event_sources s on s.event_id=e.id and s.source_slug=e.data_source
    and s.source_entity_id=e.external_id
  where e.data_source='ticketmaster'
    and api_private.event_source_confirms_ticketmaster_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
    and not exists(select 1 from public.event_quality_findings(e.id) f where f.issue_code='NAMED_VENUE_UNLINKED')
  order by e.id for share of e,s
), pending as materialized (
  select q.id,to_jsonb(q) before_row,e.source_id,e.payload_hash,e.publisher_venue_id
  from public.review_queue q join eligible e on q.entity_id=e.id
  where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
    and q.resolved_by is null and q.resolved_at is null
    and q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
      'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',e.venue_name)
  for update of q
), cleared as (
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=q.details||jsonb_build_object('resolution','ticketmaster_confirms_event_location',
      'resolved_automatically',true,'human_reviewed',false,'event_source_id',p.source_id,
      'payload_hash',p.payload_hash,'publisher_venue_id',p.publisher_venue_id)
  from pending p where q.id=p.id returning q.id,to_jsonb(q) after_row
), open_issues as materialized (
  select i.id,to_jsonb(i) before_row,e.source_id,e.payload_hash,e.publisher_venue_id
  from public.event_quality_issues i join eligible e on e.id=i.event_id
  where i.issue_code='NAMED_VENUE_UNLINKED' and i.detector='event-quality-scan'
    and i.status='open' and i.reviewed_by is null and i.reviewed_at is null
    and i.resolved_at is null and i.resolution is null
    and not coalesce(i.evidence,'{}') ?| array['manual_hold','manual_review_required','governance_resolution']
  for update of i
), resolved as (
  update public.event_quality_issues i set status='resolved',resolved_at=now(),
    resolution='ticketmaster_confirms_event_location '||jsonb_build_object(
      'event_source_id',p.source_id,'payload_hash',p.payload_hash,'publisher_venue_id',p.publisher_venue_id)::text
  from open_issues p where i.id=p.id returning i.id,i.event_id,to_jsonb(i) after_row
), refreshed as (
  update public.event_quality_current c set open_issue_codes=array_remove(c.open_issue_codes,'NAMED_VENUE_UNLINKED'),
    issue_codes=array_remove(c.issue_codes,'NAMED_VENUE_UNLINKED')
  from resolved i where i.event_id=c.event_id
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'review_queue',q.id,'ticketmaster_confirmed_event_location:v1',p.before_row,q.after_row
from cleared q join pending p using(id)
union all
select 'event_quality_issue',i.id,'ticketmaster_confirmed_event_location:v1',p.before_row,i.after_row
from resolved i join open_issues p using(id);
