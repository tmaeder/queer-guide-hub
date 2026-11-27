-- Use the established Natural Earth territory comparison without changing
-- assigned countries, geometry, tolerance, authorization or identity gates.
CREATE OR REPLACE FUNCTION api_private.geo_cms_verify(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare g public.geo_places; co public.countries; ci public.cities;
  v_iso text; v_kind text; v_distance numeric; v_status text; v_checks jsonb; v_sources jsonb;
begin
  perform public.assert_admin_or_internal();
  select * into strict g from geo_places where id=p_id and place_type in ('country','city','village') for update;
  select * into co from countries where id=g.country_id;
  select * into ci from cities where id=g.city_id;
  v_sources := jsonb_build_array(jsonb_build_object('title','Natural Earth country boundaries','url','https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
    'version',(select source_version from geo_boundaries where boundary_kind='country' limit 1)));
  if g.latitude is null or g.longitude is null then
    v_status:='missing'; v_checks:=jsonb_build_object('reason','Coordinates are missing');
  else
    select iso_a2,match_kind into v_iso,v_kind from geo_country_at(g.latitude,g.longitude);
    if g.place_type='village' and ci.latitude is not null and ci.longitude is not null then
      v_distance := ST_Distance(ST_SetSRID(ST_MakePoint(g.longitude::float8,g.latitude::float8),4326)::geography,
        ST_SetSRID(ST_MakePoint(ci.longitude::float8,ci.latitude::float8),4326)::geography);
    end if;
    v_checks:=jsonb_build_object('country_code',co.code,'polygon_country',v_iso,'country_match',public.geo_countries_equivalent(v_iso,co.code),'match_kind',v_kind,
      'distance_to_city_m',v_distance,'identity_verified',false,'parent_verified',false,'queer_designation_verified',false,
      'reason',case when v_iso is null then 'No country boundary match; check coastal or disputed areas'
        when not public.geo_countries_equivalent(v_iso,co.code) then 'Coordinates disagree with the assigned country; review border and territory evidence'
        when v_distance>50000 then 'More than 50 km from the linked city centre; review identity and parent'
        else 'Country checked. Place identity and parent still need external evidence' end);
    v_status := case when v_iso is null or not public.geo_countries_equivalent(v_iso,co.code) or v_distance>50000 then 'review' else 'country_checked' end;
    if ci.wikidata_qid is not null then
      v_sources:=v_sources||jsonb_build_array(jsonb_build_object('title','Parent city on Wikidata (reference only)','url','https://www.wikidata.org/wiki/'||ci.wikidata_qid));
    end if;
  end if;
  if public.geo_cms_classification_issue(p_id) is not null then
    v_status:='review';
    v_checks:=v_checks||jsonb_build_object('geographic_reason',v_checks->>'reason',
      'city_classification',public.geo_cms_classification_issue(p_id)->>'status',
      'identity_verified',false,'reason',public.geo_cms_classification_issue(p_id)->>'reason');
    v_sources:=v_sources||coalesce((select jsonb_agg(jsonb_build_object('title','City classification source','url',s))
      from jsonb_array_elements_text(public.geo_cms_classification_issue(p_id)->'sources') s),
      '[{"title":"GeoNames classification audit","url":"https://download.geonames.org/export/dump/"}]'::jsonb);
  end if;
  insert into geo_cms_verifications(place_id,status,fingerprint,checks,sources)
  values(p_id,v_status,public.geo_cms_fingerprint(p_id),v_checks,v_sources)
  on conflict(place_id) do update set status=excluded.status,checked_at=now(),fingerprint=excluded.fingerprint,checks=excluded.checks,sources=excluded.sources;
  return public.geo_cms_record(p_id);
end $function$;

