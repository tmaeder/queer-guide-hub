-- A bounded audit over the existing source-backed country polygons. This never
-- labels a place fully verified, or changes a canonical parent or coordinate.
create or replace function public.geo_cms_country_sweep(p_limit int default 250)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_count int;
begin
  perform public.assert_admin_or_internal();
  with pending as (
    select g.*,co.code,ci.latitude as city_lat,ci.longitude as city_lng,
      public.geo_cms_fingerprint(g.id) as current_fingerprint
    from geo_places g join countries co on co.id=g.country_id left join cities ci on ci.id=g.city_id
    left join geo_cms_verifications v on v.place_id=g.id
    where g.place_type in ('country','city','village') and g.duplicate_of_id is null
      and (v.place_id is null or v.status='stale')
    order by g.id limit least(greatest(p_limit,1),500)
  ), tested as (
    select p.*,hit.iso_a2,hit.match_kind,
      case when p.place_type='village' and p.latitude is not null and p.longitude is not null and p.city_lat is not null and p.city_lng is not null then
        ST_Distance(ST_SetSRID(ST_MakePoint(p.longitude::float8,p.latitude::float8),4326)::geography,
          ST_SetSRID(ST_MakePoint(p.city_lng::float8,p.city_lat::float8),4326)::geography) end as distance
    from pending p left join lateral public.geo_country_at(p.latitude,p.longitude) hit on p.latitude is not null and p.longitude is not null
  )
  insert into geo_cms_verifications(place_id,status,fingerprint,checks,sources)
  select id,case when latitude is null or longitude is null then 'missing'
    when iso_a2 is null or iso_a2 is distinct from code or distance>50000 then 'review' else 'country_checked' end,current_fingerprint,
    jsonb_build_object('country_code',code,'polygon_country',iso_a2,'country_match',iso_a2=code,'match_kind',match_kind,'distance_to_city_m',distance,
      'identity_verified',false,'coordinates_verified',false,'parent_verified',false,'queer_designation_verified',false,
      'reason',case when latitude is null or longitude is null then 'Coordinates are missing'
        when iso_a2 is null then 'No country polygon match; inspect coastal and territory evidence'
        when iso_a2 is distinct from code then 'Assigned country and coordinate polygon disagree; inspect border and identity evidence'
        when distance>50000 then 'More than 50 km from the linked city centre; review identity and parent'
        else 'Country checked against Natural Earth. External place identity and parent evidence remain unverified' end),
    jsonb_build_array(jsonb_build_object('title','Natural Earth country boundaries','url','https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
      'version',(select source_version from geo_boundaries where boundary_kind='country' limit 1)))
  from tested
  on conflict(place_id) do update set status=excluded.status,fingerprint=excluded.fingerprint,checked_at=now(),checks=excluded.checks,sources=excluded.sources;
  get diagnostics v_count=row_count;
  return jsonb_build_object('checked',v_count);
end $$;
revoke all on function public.geo_cms_country_sweep(int) from public,anon,authenticated;
grant execute on function public.geo_cms_country_sweep(int) to service_role;
