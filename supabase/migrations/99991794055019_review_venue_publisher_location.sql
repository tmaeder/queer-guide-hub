-- Expose the location from the exact source occurrence alongside the saved event.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.get_event_venue_review_context(uuid,text)'::regprocedure);
  anchor text:=$anchor$  'city',(select name from public.cities where id=e.city_id),$anchor$;
  evidence text:=$evidence$  'publisher_location',(
   select jsonb_build_object(
    'venue_name',nullif(btrim(s.payload#>>'{normalized,venue_name}'),''),
    'address',nullif(btrim(s.payload#>>'{normalized,location,address}'),''),
    'source_url',s.source_url
   )
   from public.event_sources s
   where s.event_id=e.id and s.source_slug=e.data_source and s.source_entity_id=e.external_id
    and s.payload_hash~'^[0-9a-f]{64}$'
    and (nullif(btrim(s.payload#>>'{normalized,venue_name}'),'') is not null
      or nullif(btrim(s.payload#>>'{normalized,location,address}'),'') is not null)
  ),
$evidence$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Venue review context anchor changed';
  end if;
  execute replace(definition,anchor,evidence||anchor);
end $patch$;
