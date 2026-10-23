-- 99991792732101_overture_contact_source_inheritance

-- Only registered, complete public Overture captures may participate in the
-- existing primary-venue inheritance. Keep the original ownership/consensus,
-- provenance, audit and finding transitions unchanged.
do $migration$
declare src text;old_sources text;new_sources text;anchor text;guard text;
begin
 src:=pg_get_functiondef('public.reconcile_business_source_websites(integer,boolean)'::regprocedure);
 old_sources:=$old$c.source_slug in('spartacus','foursquare','google','osm','agendaq','gay-ch','milchjugend','planet-randy','patroc')$old$;
 new_sources:=$new$c.source_slug in('spartacus','foursquare','google','osm','agendaq','gay-ch','milchjugend','planet-randy','patroc','overture')$new$;
 anchor:=$anchor$  and c.source_url~'^https?://'$anchor$;
 guard:=$guard$
  and (c.source_slug<>'overture' or exists(
   select 1 from public.venue_sources captured where captured.id=c.source_id
    and captured.payload->>'contract'='overture_contact_capture:v1'
    and captured.source_url='https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json'
    and captured.payload#>>'{capture,source_url}'=captured.source_url
    and captured.payload#>>'{capture,release}'='2026-10-21.0'
    and captured.payload#>>'{capture,window_complete}'='true'
    and captured.payload#>>'{raw,id}'=captured.source_entity_id
    and captured.payload#>>'{raw,operating_status}'='open'
    and captured.payload#>>'{raw,confidence}'~'^(0\.[0-9]+|1(?:\.0+)?)$'
    and (captured.payload#>>'{raw,confidence}')::numeric>=.9
    and captured.payload#>>'{capture,website_probe,usable}'='true'
    and captured.payload#>>'{capture,website_probe,status}'='200'
    and captured.payload#>>'{capture,website_probe,identity,name_match}'='true'
    and captured.payload#>>'{capture,website_probe,identity,street_match}'='true'
    and captured.payload#>>'{capture,website_probe,prefix_sha256}'~'^[a-f0-9]{64}$'
    and captured.payload#>>'{normalized,contacts,website}'=captured.payload#>>'{raw,websites,0}'
    and jsonb_array_length(captured.payload#>'{raw,websites}')=1
    and jsonb_array_length(captured.payload#>'{raw,sources}')>0
    and not exists(select 1 from jsonb_array_elements(captured.payload#>'{raw,sources}') attribution
     where coalesce(attribution->>'license','')not in('CDLA-Permissive-2.0','Apache-2.0','CC0-1.0'))
    and encode(extensions.digest(captured.payload#>>'{capture,payload_text}','sha256'),'hex')=captured.payload#>>'{capture,payload_sha256}'
    and (captured.payload#>>'{capture,payload_text}')::jsonb @> jsonb_build_array(captured.payload->'raw')
  ))$guard$;
 if position(old_sources in src)=0 or position(anchor in src)=0
  or position('overture_contact_capture:v1' in src)>0 then
  raise exception 'Unexpected business source inheritance definition';
 end if;
 src:=replace(src,old_sources,new_sources);
 src:=replace(src,anchor,anchor||guard);
 execute src;
end $migration$;
