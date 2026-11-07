-- These publisher locations describe areas, routes or multiple physical places.
-- Keep the display label and suppress only the demand for a single catalogue link.
do $patch$
declare
 definition text:=pg_get_functiondef('api_private.event_source_lists_multiple_venues(uuid,text,text,text,text)'::regprocedure);
 anchor text:=$anchor$ ) when p_source='gayout'$anchor$;
 extension text:=$branch$ ) when p_source='gayout'
  and p_external_id like '%/mega-events/%'
  and (nullif(btrim(p_address),'') is null or (
   p_external_id='usa-canada/united-states/chicago/mega-events/northalsted-market-days-31'
   and p_address='Halsted Street from Belmont to Addison'))
  and (
   p_venue_name ~* '(\mcitywide$|^various (bars|clubs|cinemas|theatres|theaters) in \S|\mand various [^,;]+ venues$|\S\s+→\s+\S|^city cent(re|er) \(march from \S)'
   or (p_external_id,p_venue_name) in (
     ('europe/france/paris/mega-events/cheries-cheris','MK2 Beaubourg, MK2 Bibliothèque and MK2 Quai de Seine'),
     ('usa-canada/united-states/charleston/mega-events/park-circle-pride','Park Circle / E Montague Ave & Reynolds Ave'),
     ('usa-canada/united-states/boston/mega-events/wicked-queer-boston-s-lgbtq-film-festival-151','Museum of Fine Arts, Boston; Brattle Theatre; Coolidge Corner Theatre; Somerville Theatre; Institute of Contemporary Art'),
     ('asia-aus/india/delhi/mega-events/delhi-queer-pride','Barakhamba Road to Jantar Mantar'),
     ('usa-canada/united-states/chicago/mega-events/northalsted-market-days-31','North Halsted Street (between Belmont and Addison)'),
     ('europe/germany/hamburg/mega-events/hamburg-pride','CSD-Straßenfest around Jungfernstieg / Hamburg city centre'),
     ('asia-aus/new-zealand/queenstown/mega-events/queenstown-gay-ski-week','Queenstown ski fields & downtown venues'),
     ('usa-canada/canada/vancouver/mega-events/vancouver-gay-pride','Davie Village Pride Festival: Davie Street (Burrard to Jervis) and Nelson Park'),
     ('usa-canada/united-states/las-vegas/mega-events/sin-city-classic-2027-28','Horseshoe Las Vegas & Paris Las Vegas'),
     ('europe/spain/barcelona/mega-events/circuit-festival-barcelona','Sala Input, Razzmatazz, Safari, Luz de Gas, SeaseaClub; Water Park Day at Illa Fantasia'),
     ('usa-canada/united-states/ogunquit/mega-events/ogunquit-pride','Ogunquit Village & Beach'),
     ('usa-canada/united-states/cincinnati/mega-events/cincinnati-pride','Sawyer Point & Yeatman''s Cove'),
     ('usa-canada/united-states/dallas/mega-events/dallas-pride','Downtown Dallas: Main Street Garden Park, Pacific Plaza, Harwood Park and Pegasus Plaza'),
     ('europe/czech-republic/prague/mega-events/prague-pride','Pride Park, Štvanice Island (5 stages); parade from Wenceslas Square'),
     ('europe/romania/bucharest/mega-events/bucharest-pride','Central Bucharest (Calea Victoriei to Izvor Park)'),
     ('europe/spain/sitges/mega-events/international-bears-week-sitges','Bear-Village, Plaça de la Fragata (seafront); bear bars on the Ruta del Oso'),
     ('usa-canada/canada/vancouver/mega-events/vancouver-pride-festival-165','Davie Village & Sunset Beach'),
     ('asia-aus/australia/melbourne/mega-events/melbourne-queer-film-festival','The Capitol, Nova Palace, Kino Cinemas and Melbourne Town Hall'),
     ('south-america/brazil/belo-horizonte/mega-events/belo-horizonte-pride','Avenida Afonso Pena'),
     ('south-america/brazil/fortaleza/mega-events/parada-diversidade-sexual-ceara','Avenida Beira-Mar'),
     ('south-america/brazil/sao-paulo/mega-events/sao-paulo-gay-pride','Avenida Paulista'),
     ('europe/spain/madrid/mega-events/madbear-madrid','Chueca district — YASTA Club, Bears Bar, Octopus Sauna'),
     ('usa-canada/mexico/ensenada/mega-events/marcha-orgullo-ensenada','Downtown Ensenada (Calle Ruiz / Plaza Pueblo Antiguo)'),
     ('usa-canada/united-states/providence/mega-events/rhode-island-pride','Downtown Providence (Kennedy Plaza / Washington St)'),
     ('usa-canada/united-states/raleigh/mega-events/out-raleigh-pride','Fayetteville Street, Downtown Raleigh'),
     ('usa-canada/canada/montreal/mega-events/igla-championships','Montreal aquatics venues'),
     ('asia-aus/australia/darlinghurst/mega-events/darlinghurst-mardi-gras','Oxford Street, Darlinghurst'),
     ('asia-aus/new-zealand/auckland/mega-events/auckland-pride','Ponsonby Road (Pride March)'),
     ('europe/slovenia/ljubljana/mega-events/lgbt-film-festival-253','Slovenian Cinematheque, Klub Tiffany, Kinodvor Cinema, Kino Šiška'),
     ('europe/austria/graz/mega-events/csd-graz','Stadtpark / Volksgarten')
   )
   or (p_external_id,p_venue_name)=('asia-aus/australia/adelaide/mega-events/feast-festival',
    'Multiple venues across Adelaide and regional South Australia')
  )
 then exists(
  select 1
  from public.events e join public.event_sources s
   on s.event_id=e.id and s.source_slug=p_source and s.source_entity_id=p_external_id
  where e.id=p_id and e.data_source=p_source and e.external_id=p_external_id
   and e.is_public and not e.safety_gated and e.duplicate_of_id is null and e.venue_id is null
   and e.status in('active','completed') and e.venue_name=p_venue_name and e.address is not distinct from p_address
   and not (coalesce(e.field_provenance,'{}') ?| array['venue_id','venue_name','address'])
   and s.payload_hash~'^[a-f0-9]{64}$'
   and s.source_url='https://www.gayout.com/'||p_external_id
   and s.payload#>>'{raw,url}'=s.source_url and s.payload#>>'{raw,path}'=p_external_id
   and s.payload#>>'{normalized,sourceId}'=p_external_id
   and s.payload#>>'{raw,venueName}'=s.payload#>>'{normalized,venue_name}'
   and (s.payload#>>'{raw,venueName}'=p_venue_name or (
    p_external_id='asia-aus/australia/adelaide/mega-events/feast-festival'
    and p_venue_name='Multiple venues across Adelaide and regional South Australia'
    and s.payload#>>'{raw,venueName}'='Multiple venues across Adelaide (opening Pride March + Carnival)'))
   and nullif(btrim(s.payload#>>'{normalized,location,address}'),'') is null
   and case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamptz')
    then (s.payload#>>'{raw,start}')::timestamptz=e.start_date else false end
   and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id)
   and not exists(select 1 from public.content_revisions h where h.source_table='events'
    and h.source_id=e.id and h.actor_kind='human'
    and h.changed_fields&&array['venue_id','venue_name','address','start_date','data_source','external_id'])
   and not exists(select 1 from public.review_queue q where q.entity_type='event' and q.entity_id=e.id
    and q.review_type='venue_link_candidate' and (q.resolved_by is not null or q.status='pending' and (
     lower(q.details->>'manual_hold')='true' or lower(q.details->>'requires_confirm')='true'
     or lower(q.details->>'hard_blocker')='true' or lower(q.details->>'force_review')='true'
     or lower(q.details->>'human_reviewed')='true')))
   and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
    and i.issue_code='NAMED_VENUE_UNLINKED' and (i.reviewed_by is not null or
     lower(i.evidence->>'manual_hold')='true' or lower(i.evidence->>'manual_review_required')='true'))
 ) when p_source='gayout'$branch$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'Publisher venue location detector changed';
 end if;
 execute replace(definition,anchor,extension);
end $patch$;

-- Resolve machine findings once. Both queue producers consult the detector for future captures.
with candidates as materialized (
 select q.id,to_jsonb(q) before_row
 from public.review_queue q join public.events e on e.id=q.entity_id
 where q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
  and q.resolved_by is null and q.resolved_at is null and e.data_source='gayout'
  and q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
   'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',e.venue_name)
  and api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 for update of q
), cleared as (
 update public.review_queue q set status='resolved',resolved_at=now(),
  details=q.details||jsonb_build_object('resolution','publisher_location_is_not_a_single_venue','resolved_automatically',true)
 from candidates c where q.id=c.id
 returning q.id,to_jsonb(q) after_row
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'review_queue',r.id,'publisher_route_or_multi_venue:v1',c.before_row,r.after_row
from cleared r join candidates c using(id);

with candidates as materialized (
 select i.id,i.event_id,to_jsonb(i) before_row
 from public.event_quality_issues i join public.events e on e.id=i.event_id
 where i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open' and i.detector='event-quality-scan'
  and i.reviewed_at is null and i.reviewed_by is null and i.resolution is null and i.resolved_at is null
  and e.data_source='gayout'
  and api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 for update of i
), cleared as (
 update public.event_quality_issues i set status='resolved',resolved_at=now(),
  resolution='Automatic: captured publisher location is an area, route or multiple venues.'
 from candidates c where i.id=c.id
 returning i.id,to_jsonb(i) after_row
), updated_current as (
 update public.event_quality_current c
 set issue_codes=array_remove(c.issue_codes,'NAMED_VENUE_UNLINKED'),
  open_issue_codes=array_remove(c.open_issue_codes,'NAMED_VENUE_UNLINKED')
 where c.event_id in(select x.event_id from candidates x join cleared r using(id))
)
insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
select 'event_quality_issue',r.id,'publisher_route_or_multi_venue:v1',c.before_row,r.after_row
from cleared r join candidates c using(id);
