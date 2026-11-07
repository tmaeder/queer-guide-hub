-- A publisher's explicit multi-venue label is useful display text, but it
-- does not identify one physical venue for the event to link to.
create function api_private.event_source_lists_multiple_venues(
 p_id uuid, p_source text, p_external_id text, p_venue_name text, p_address text
) returns boolean
language sql stable set search_path='' as $fn$
 select case when p_source='gayout'
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
revoke all on function api_private.event_source_lists_multiple_venues(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function api_private.event_source_lists_multiple_venues(uuid,text,text,text,text) to service_role;

do $patch$
declare
 definition text;
 detector_anchor text := $anchor$from e where nullif(btrim(venue_name),'') is not null and venue_id is null$anchor$;
 queue_anchor text := $anchor$and nullif(btrim(e.venue_name), '') is not null$anchor$;
 predicate text := 'api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
begin
 definition:=pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,detector_anchor,'')))/length(detector_anchor)<>1
 then raise exception 'Event venue detector changed'; end if;
 execute replace(definition,detector_anchor,detector_anchor||' and not '||predicate);

 definition:=pg_get_functiondef('public.reconcile_event_venue_link_reviews()'::regprocedure);
 if (length(definition)-length(replace(definition,queue_anchor,'')))/length(queue_anchor)<>2
 then raise exception 'Venue queue producer changed'; end if;
 execute replace(definition,queue_anchor,queue_anchor||' and not '||predicate);
end $patch$;

-- Reconcile only machine-generated findings with no proposed match or reviewer.
with candidates as materialized (
 select q.id,to_jsonb(q) before_row
 from public.review_queue q join public.events e on e.id=q.entity_id
 where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
  and q.resolved_by is null and q.resolved_at is null
  and q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
   'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',e.venue_name)
  and e.duplicate_of_id is null and e.venue_id is null
  and api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 for update of q
), cleared as (
 update public.review_queue q set status='resolved',resolved_at=now(),
  details=q.details||jsonb_build_object('resolution','publisher_lists_multiple_venues','resolved_automatically',true)
 from candidates c where q.id=c.id
 returning q.id,to_jsonb(q) after_row
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'review_queue',r.id,'publisher_lists_multiple_venues:v1',c.before_row,r.after_row
from cleared r join candidates c using(id);
