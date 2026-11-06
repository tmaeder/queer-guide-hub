-- Ticketmaster supplies a distinct event ID for each performance and stable
-- attraction and venue IDs for the production. Require the original copy and
-- occurrence details before suppressing a repeated-description finding.
create function api_private.ticketmaster_publisher_copy_identity(p_id uuid)
returns text language sql stable set search_path='' as $fn$
 with matches as (
  select s.payload#>>'{raw,_embedded,venues,0,id}' venue_key,
   array(select a->>'id' from jsonb_array_elements(
    case when jsonb_typeof(s.payload#>'{raw,_embedded,attractions}')='array'
     then s.payload#>'{raw,_embedded,attractions}' else '[]'::jsonb end
   ) a order by a->>'id') attractions
  from public.events e join public.event_sources s on s.event_id=e.id
  join public.countries co on co.id=e.country_id
  join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
  where e.id=p_id and e.duplicate_of_id is null and e.data_source='ticketmaster'
   and s.source_slug=e.data_source and s.source_entity_id=e.external_id
   and s.payload_hash~'^[a-f0-9]{64}$'
   and s.payload#>>'{raw,id}'=s.source_entity_id and s.payload#>>'{raw,name}'=e.title
   and s.payload#>>'{raw,info}'=e.description
   and s.payload#>>'{raw,url}'~'^https://www[.]ticketmaster[.]com/[^/?#]+/event/[0-9A-F]+$'
   and case when pg_input_is_valid(s.payload#>>'{raw,dates,start,dateTime}','timestamptz')
    then (s.payload#>>'{raw,dates,start,dateTime}')::timestamptz=e.start_date else false end
   and jsonb_typeof(s.payload#>'{raw,_embedded,venues}')='array'
   and s.payload#>'{raw,_embedded,venues,1}' is null
   and s.payload#>>'{raw,_embedded,venues,0,name}'=e.venue_name
   and s.payload#>>'{raw,_embedded,venues,0,city,name}'=ci.name
   and s.payload#>>'{raw,_embedded,venues,0,country,countryCode}'=co.code
   and (e.venue_id is null or exists(select 1 from public.venues v where v.id=e.venue_id
    and v.city_id=e.city_id and v.country_id=e.country_id and v.duplicate_of_id is null
    and v.name=e.venue_name))
 )
 -- This production has two attractions on each listing. Require both, plus
 -- the showroom ID. Other productions still use the ordinary review policy.
 select 'ticketmaster:KovZpZAJanIA:K8vZ9178HlV:K8vZ917b-t7' from matches
 having count(*)=1 and bool_and(venue_key='KovZpZAJanIA' and attractions=array['K8vZ9178HlV','K8vZ917b-t7']);
$fn$;
revoke all on function api_private.ticketmaster_publisher_copy_identity(uuid) from public,anon,authenticated;
grant execute on function api_private.ticketmaster_publisher_copy_identity(uuid) to service_role;

do $patch$
declare
 definition text;
 code text;
 identity_anchor text:='select min(s.payload';
 sibling_anchor text:='s.venue_id=e.venue_id';
 sources_anchor text:=$anchor$s.source_slug='siegessaeule' and s.source_entity_id=e.external_id$anchor$;
 url_anchor text:=$anchor$'url',s.source_url$anchor$;
begin
 definition:=pg_get_functiondef('api_private.event_publisher_copy_identity(uuid)'::regprocedure);
 code:=regexp_replace(pg_get_functiondef('api_private.event_publisher_copy_identity(uuid)'::regprocedure),'--[^'||chr(10)||']*','','g');
 if strpos(code,identity_anchor)=0 then raise exception 'Publisher identity contract changed';end if;
 definition:=replace(definition,identity_anchor,
  'select coalesce(api_private.ticketmaster_publisher_copy_identity(p_id),(select min(s.payload');
 definition:=replace(definition,'having count(distinct s.payload#>>''{normalized,metadata,series}'')=1;',
  'having count(distinct s.payload#>>''{normalized,metadata,series}'')=1));');
 execute definition;

 definition:=pg_get_functiondef('api_private.event_description_reuse_expected(uuid)'::regprocedure);
 code:=regexp_replace(pg_get_functiondef('api_private.event_description_reuse_expected(uuid)'::regprocedure),'--[^'||chr(10)||']*','','g');
 if strpos(code,sibling_anchor)=0 then raise exception 'Publisher cluster contract changed';end if;
 execute replace(definition,sibling_anchor,'s.venue_id is not distinct from e.venue_id');

 definition:=pg_get_functiondef('api_private.reconcile_publisher_event_copy(integer,boolean)'::regprocedure);
 code:=regexp_replace(pg_get_functiondef('api_private.reconcile_publisher_event_copy(integer,boolean)'::regprocedure),'--[^'||chr(10)||']*','','g');
 if strpos(code,sources_anchor)=0 or strpos(code,url_anchor)=0 then
  raise exception 'Publisher repair evidence contract changed';
 end if;
 definition:=replace(definition,sources_anchor,
  's.source_slug=e.data_source and s.source_entity_id=e.external_id');
 execute replace(definition,url_anchor,
  $replacement$'url',coalesce(s.source_url,s.payload#>>'{raw,url}')$replacement$);
end $patch$;
