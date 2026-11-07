-- HAZ publishes a timed move from Gleis to Regenbogenhaus within one occurrence.
-- Reuse the existing multi-venue predicate for matching and Review.
create or replace function api_private.event_source_lists_multiple_venues(
 p_id uuid, p_source text, p_external_id text, p_venue_name text, p_address text
) returns boolean
language sql stable set search_path='' as $fn$
 select case when p_source='haz-ch'
  and p_external_id ~ '^bi-gruppe-[0-9]+$'
  and p_venue_name='Gleis'
  and (nullif(btrim(p_address),'') is null or p_address='via Zollstrasse 121')
 then exists(
  select 1 from public.events e
  join public.event_sources s on s.event_id=e.id
   and s.source_slug=p_source and s.source_entity_id=p_external_id
  where e.id=p_id and e.data_source=p_source and e.external_id=p_external_id
   and e.is_public and not e.safety_gated and e.duplicate_of_id is null
   and e.title='Bi-Gruppe'
   and s.payload_hash~'^[a-f0-9]{64}$'
   and s.source_url='https://haz.ch/event/'||p_external_id||'/'
   and s.payload#>>'{raw,url}'=s.source_url
   and s.payload#>>'{raw,slug}'=p_external_id
   and s.payload#>>'{raw,title}'=e.title
   and s.payload#>>'{raw,venue,name}'=p_venue_name
   and s.payload#>>'{raw,venue,city}'='Zürich'
   and s.payload#>>'{raw,venue,country}'='CH'
   and s.payload#>>'{normalized,sourceId}'=p_external_id
   and s.payload#>>'{normalized,venue_name}'=p_venue_name
   and case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamptz')
    then (s.payload#>>'{raw,start}')::timestamptz=e.start_date else false end
   and s.payload#>>'{raw,description}' like '%Kulturbar «Gleis»%Zollhaus, Haus A%www.dasgleis.ch%Bi-Gruppe wechselt zum Regenbogenhaus hinüber%Zollhaus, Haus B%'
   and not exists(select 1 from public.event_sources other
    where other.event_id=e.id and other.source_slug=p_source and other.id<>s.id)
   and not exists(select 1 from public.content_revisions h where h.source_table='events'
    and h.source_id=e.id and h.actor_kind='human'
    and h.changed_fields&&array['venue_id','venue_name','address','description','start_date'])
 ) when p_source='gayout'
  and nullif(btrim(p_address),'') is null
  and p_venue_name ~* '^\s*(multiple|various) (venues|locations)\M'
 then exists(
  select 1 from public.event_sources s
  where s.event_id=p_id and s.source_slug=p_source and s.source_entity_id=p_external_id
   and s.payload_hash~'^[a-f0-9]{64}$'
   and s.source_url='https://www.gayout.com/'||p_external_id
   and s.payload#>>'{raw,url}'=s.source_url
   and s.payload#>>'{raw,path}'=p_external_id
   and s.payload#>>'{raw,venueName}'=p_venue_name
   and s.payload#>>'{normalized,venue_name}'=p_venue_name
   and nullif(btrim(s.payload#>>'{normalized,location,address}'),'') is null
 ) else false end;
$fn$;
-- The candidate linker also creates review items independently of the
-- reconciliation sweep. Exclude the same confirmed itinerary at its input.
do $patch$
declare
 definition text:=pg_get_functiondef('public.find_event_venue_candidates(integer,boolean)'::regprocedure);
 anchor text:=$anchor$and e.city_id is not null and e.duplicate_of_id is null and e.is_public$anchor$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Venue candidate selector changed'; end if;
 execute replace(definition,anchor,anchor||E'\n  and not api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)');
end $patch$;

-- Close the source-generated findings for the confirmed itinerary.
with eligible as materialized (
 select e.id from public.events e
 where e.data_source='haz-ch' and e.venue_id is null
  and api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 for share of e
), pending as materialized (
 select q.id,to_jsonb(q) before_row
 from public.review_queue q join eligible e on q.entity_id=e.id
 where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
  and q.resolved_by is null and q.resolved_at is null
  and (q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
    'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name','Gleis')
   or (q.details-'candidates'=jsonb_build_object('source','link_event_venues','event_venue_name','Gleis')
    and case when jsonb_typeof(q.details->'candidates')='array'
      then jsonb_array_length(q.details->'candidates')=1 else false end
    and q.details#>>'{candidates,0,venue_name}'='Gleis'
    and q.details#>'{candidates,0,name_exact}'='true'::jsonb))
 for update of q
), cleared as (
 update public.review_queue q set status='resolved',resolved_at=now(),
  details=q.details||jsonb_build_object('resolution','publisher_confirms_two_venue_itinerary',
   'resolved_automatically',true,'human_reviewed',false)
 from pending p where q.id=p.id returning q.id,to_jsonb(q) after_row
), open_issues as materialized (
 select i.id,to_jsonb(i) before_row from public.event_quality_issues i join eligible e on e.id=i.event_id
 where i.issue_code='NAMED_VENUE_UNLINKED' and i.detector='event-quality-scan'
  and i.status='open' and i.reviewed_by is null and i.reviewed_at is null
  and i.resolved_at is null and i.resolution is null
  and lower(coalesce(i.evidence->>'manual_hold','false'))<>'true'
  and lower(coalesce(i.evidence->>'manual_review_required','false'))<>'true'
  and not(i.evidence?'governance_resolution')
 for update of i
), resolved as (
 update public.event_quality_issues i set status='resolved',resolved_at=now(),
  resolution='publisher_confirms_two_venue_itinerary'
 from open_issues p where i.id=p.id returning i.id,i.event_id,to_jsonb(i) after_row
), refreshed as (
 update public.event_quality_current c set open_issue_codes=array_remove(c.open_issue_codes,'NAMED_VENUE_UNLINKED'),
  issue_codes=array_remove(c.issue_codes,'NAMED_VENUE_UNLINKED')
 from resolved i where i.event_id=c.event_id
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'review_queue',q.id,'haz_publisher_two_venue_itinerary:v1',p.before_row,q.after_row
from cleared q join pending p using(id)
union all
select 'event_quality_issue',i.id,'haz_publisher_two_venue_itinerary:v1',p.before_row,i.after_row
from resolved i join open_issues p using(id);
