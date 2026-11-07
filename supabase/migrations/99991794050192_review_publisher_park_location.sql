-- The calendar gives a public park as the location of this recurring series.
-- Preserve its display location and keep commercial venue matching separate.
create function api_private.event_source_confirms_park_location(
  p_id uuid, p_source text, p_external_id text, p_venue_name text, p_address text
) returns boolean
language sql stable set search_path='' as $fn$
  select case when p_source='siegessaeule'
    and p_external_id ~ '^mix/amazonen-cruising/[0-9]{4}-[0-9]{2}-[0-9]{2}/19:00$'
    and p_venue_name='Tiergarten' and nullif(btrim(p_address),'') is null
  then exists (
    select 1
    from public.events e join public.event_sources s on s.event_id=e.id
      and s.source_slug=p_source and s.source_entity_id=p_external_id
    where e.id=p_id and e.data_source=p_source and e.external_id=p_external_id
      and e.is_public and not e.safety_gated and e.duplicate_of_id is null
      and e.venue_id is null and e.status in ('active','completed')
      and e.title='Amazonen-Cruising'
      and s.payload_hash ~ '^[a-f0-9]{64}$'
      and s.source_url='https://www.siegessaeule.de/termine/'||p_external_id||'/'
      and s.payload#>>'{raw,url}'=s.source_url
      and s.payload#>>'{normalized,sourceId}'=p_external_id
      and s.payload#>>'{normalized,title}'=e.title
      and s.payload#>>'{normalized,venue_name}'=p_venue_name
      and s.payload#>>'{normalized,location,city}'='Berlin'
      and s.payload#>>'{normalized,location,country}'='DE'
      and nullif(btrim(s.payload#>>'{normalized,location,address}'),'') is null
      and s.payload#>>'{normalized,description}' like '%an der Amazone im Tiergarten, Floraplatz.%'
      and case when pg_input_is_valid(s.payload#>>'{normalized,dates,start}','timestamptz')
        then (s.payload#>>'{normalized,dates,start}')::timestamptz=e.start_date else false end
      and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id)
      and not exists(select 1 from public.content_revisions h where h.source_table='events'
        and h.source_id=e.id and h.actor_kind='human'
        and h.changed_fields&&array['venue_id','venue_name','address','description','start_date'])
      and not exists(select 1 from public.review_queue q where q.entity_type='event'
        and q.entity_id=e.id and q.review_type='venue_link_candidate' and q.status='pending'
        and (q.resolved_by is not null or q.resolved_at is not null
          or coalesce(q.details,'{}') ?| array['manual_hold','manual_review_required','requires_confirm','force_review','human_reviewed']
          or q.details->>'hard_blocker'='true'))
      and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
        and i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open'
        and (i.reviewed_by is not null or i.reviewed_at is not null
          or coalesce(i.evidence,'{}') ?| array['manual_hold','manual_review_required','governance_resolution']))
  ) else false end;
$fn$;
revoke all on function api_private.event_source_confirms_park_location(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function api_private.event_source_confirms_park_location(uuid,text,text,text,text) to service_role;

do $patch$
declare
  definition text;
  target record;
  anchor text:='not api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
  addition text:=' and not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
begin
  for target in select * from (values
    ('public.event_quality_findings(uuid)'::regprocedure,1),
    ('public.find_event_venue_candidates(integer,boolean)'::regprocedure,1),
    ('public.reconcile_event_venue_link_reviews()'::regprocedure,2)
  ) targets(fn,expected) loop
    definition:=pg_get_functiondef(target.fn);
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>target.expected then
      raise exception 'Venue exclusion changed in %',target.fn;
    end if;
    execute replace(definition,anchor,anchor||addition);
  end loop;
end $patch$;

with eligible as materialized (
  select e.id
  from public.events e
  where e.data_source='siegessaeule' and e.external_id like 'mix/amazonen-cruising/%'
    and api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
  for share of e
), pending as materialized (
  select q.id,to_jsonb(q) before_row
  from public.review_queue q join eligible e on q.entity_id=e.id
  where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
    and q.resolved_by is null and q.resolved_at is null
    and (q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
      'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name','Tiergarten')
      or (q.details-'candidates'=jsonb_build_object('source','link_event_venues','event_venue_name','Tiergarten')
        and case when jsonb_typeof(q.details->'candidates')='array'
          then jsonb_array_length(q.details->'candidates')=1 else false end
        and q.details#>>'{candidates,0,venue_name}'='Tiergarten'
        and q.details#>>'{candidates,0,venue_id}'='811324dd-7155-4a4a-b7bc-cacf2ccaf705'
        and q.details#>'{candidates,0,name_exact}'='true'::jsonb))
  for update of q
), cleared as (
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=q.details||jsonb_build_object('resolution','publisher_confirms_park_location',
      'resolved_automatically',true,'human_reviewed',false,
      'location_source','https://www.berlin.de/ba-mitte/ueber-den-bezirk/sehenswertes/denkmaeler/denkmaeler-suchen/index.php/detail/619')
  from pending p where q.id=p.id returning q.id,to_jsonb(q) after_row
), open_issues as materialized (
  select i.id,to_jsonb(i) before_row
  from public.event_quality_issues i join eligible e on e.id=i.event_id
  where i.issue_code='NAMED_VENUE_UNLINKED' and i.detector='event-quality-scan'
    and i.status='open' and i.reviewed_by is null and i.reviewed_at is null
    and i.resolved_at is null and i.resolution is null
    and lower(coalesce(i.evidence->>'manual_hold','false'))<>'true'
    and lower(coalesce(i.evidence->>'manual_review_required','false'))<>'true'
    and not coalesce(i.evidence,'{}')?'governance_resolution'
  for update of i
), resolved as (
  update public.event_quality_issues i set status='resolved',resolved_at=now(),
    resolution='publisher_confirms_park_location'
  from open_issues p where i.id=p.id returning i.id,i.event_id,to_jsonb(i) after_row
), refreshed as (
  update public.event_quality_current c set open_issue_codes=array_remove(c.open_issue_codes,'NAMED_VENUE_UNLINKED'),
    issue_codes=array_remove(c.issue_codes,'NAMED_VENUE_UNLINKED')
  from resolved i where i.event_id=c.event_id
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'review_queue',q.id,'siegessaeule_publisher_park_location:v1',p.before_row,q.after_row
from cleared q join pending p using(id)
union all
select 'event_quality_issue',i.id,'siegessaeule_publisher_park_location:v1',p.before_row,i.after_row
from resolved i join open_issues p using(id);
