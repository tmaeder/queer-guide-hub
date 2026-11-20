-- District / neighbourhood rows filed as cities, outside Venezuela (the
-- parish pass is 99991795168793). Found by the leading-word sweep: Argentine
-- "Distrito ..." (Mendoza districts and an industrial zone), Colombian urban
-- "Comuna N", Mexican "Colonia ..." / "Barrio ...", a Portuguese "Bairro ...",
-- Brazil's "DISTRITO FEDERAL" and a second Santa Cruz de la Sierra row.
-- Official municipality forms (Township of, Town of, Municipio de, gmina,
-- Commune) are real places and are left alone.
--
-- Each row's venues name their real city in the address; the mapping below
-- is per row, read by hand. A target city is created only when no live row
-- of that name exists in the country within 60 km, at the mean of its
-- venues (needs_attention, not indexable until a QID is linked). Venues
-- move, the rows are archived (reversible), and the non-place check learns
-- Barrio / Bairro / "Comuna <number>". Colonia is deliberately NOT added:
-- real towns carry it (Colonia del Sacramento, Colonia Tovar).
do $$
declare
  r record; v_new int := 0; v_moved int; v_detached int; v_arch int := 0; v_res jsonb;
begin
  perform set_config('app.actor', 'migration:city_district_cleanup', true);

  create temp table _map on commit drop as
    select m.row_id, m.target, c.country_id, c.region_name
      from (values
        ('79d43ffc-e3df-4df5-b652-79d8b60e7032'::uuid, 'Godoy Cruz'),
        ('9b085281-c03c-4164-a06f-8877ce5a8a0c'::uuid, 'Godoy Cruz'),
        ('2c0cbae8-53ea-477d-8ed0-41f7e4950fe9'::uuid, 'Godoy Cruz'),
        ('d61722c4-e4fc-4a95-b5e9-7e0759ca36c9'::uuid, 'Luján de Cuyo'),
        ('49218841-d7dc-446e-a03f-a5cb8936b9b5'::uuid, 'Santa Cruz'),
        ('f9451a5a-55fa-4884-ab3c-2dd7225ea65a'::uuid, 'Ceilândia'),
        ('177253cf-ed96-4cbf-8fc5-0a4da4d3b68d'::uuid, 'Medellín'),
        ('d532c403-d601-4612-a775-86a5aad88b0a'::uuid, 'Barrancabermeja'),
        ('61c0b6f8-0b97-4e32-b206-dbc950ce57d5'::uuid, 'Barrancabermeja'),
        ('f32f80c9-21df-4709-96d9-892e342db8ac'::uuid, 'Ixtapan de la Sal'),
        ('a59a279b-f9d9-408b-944b-2b43eca48dbb'::uuid, 'Meoqui'),
        ('4076092a-1f15-4950-b3f9-3cc509c769e1'::uuid, 'Tonalá'),
        ('1162b87a-a2f4-41bf-8555-4471c8ea7661'::uuid, 'Santa Rosalía'),
        ('385461ab-202a-4f25-a01f-57c2ca06df77'::uuid, 'Huehuetoca'),
        ('b3d65da8-d6d9-4412-924e-3dd7484c0563'::uuid, 'Grândola')
      ) m(row_id, target)
      join public.cities c on c.id = m.row_id and c.duplicate_of_id is null
     -- a partial snapshot (CI) can lack the geo spine rows that city inserts
     -- and archives write through; skip such rows instead of failing.
     where exists (select 1 from public.geo_places g where g.id = c.id)
       and exists (select 1 from public.geo_places g where g.id = c.country_id);

  create temp table _dv on commit drop as
    select v.id venue_id, m.row_id, m.target, m.country_id, m.region_name,
           coalesce(v.latitude::numeric, c.latitude) lat, coalesce(v.longitude::numeric, c.longitude) lng
      from public.venues v
      join _map m on m.row_id = v.city_id
      join public.cities c on c.id = m.row_id
     where v.duplicate_of_id is null;

  for r in
    select dv.target, dv.country_id, min(dv.region_name) region_name, avg(dv.lat) lat, avg(dv.lng) lng
      from _dv dv
     where not exists (
       select 1 from public.cities c join public.city_aliases a on a.city_id = c.id
        where c.duplicate_of_id is null and c.country_id = dv.country_id
          and a.alias_key = public.city_canonical_key(dv.target)
          and c.id not in (select row_id from _map)
          and c.latitude is not null
          and public.haversine_m(dv.lat, dv.lng, c.latitude, c.longitude) < 60000)
     group by dv.target, dv.country_id
  loop
    insert into public.cities (name, country_id, region_name, latitude, longitude, data_source,
                               needs_attention, seo_indexable, field_provenance,
                               last_synced_at, created_at, updated_at)
    values (r.target, r.country_id, r.region_name, round(r.lat, 6), round(r.lng, 6),
            'migration:city_district_cleanup', true, false,
            jsonb_build_object('city_resolve', jsonb_build_object(
              'action', 'created', 'source', 'migration:city_district_cleanup',
              'reason', 'replaces a district row; coordinates are the mean of its venues', 'at', now())),
            now(), now(), now());
    v_new := v_new + 1;
  end loop;

  update public.venues v set city_id = t.cid
    from (select dv.venue_id,
                 (select c.id from public.cities c join public.city_aliases a on a.city_id = c.id
                   where c.duplicate_of_id is null and c.country_id = dv.country_id
                     and a.alias_key = public.city_canonical_key(dv.target)
                     and c.id not in (select row_id from _map) and c.latitude is not null
                     and public.haversine_m(dv.lat, dv.lng, c.latitude, c.longitude) < 60000
                   order by public.haversine_m(dv.lat, dv.lng, c.latitude, c.longitude) limit 1) cid
            from _dv dv) t
   where v.id = t.venue_id and t.cid is not null;
  get diagnostics v_moved = row_count;

  update public.venues v
     set city_id = null, needs_attention = true,
         enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object('city_detached',
           jsonb_build_object('reason', 'district_city_row_archived', 'from_city_id', v.city_id,
                              'by', 'migration:city_district_cleanup'))
   where v.id in (select venue_id from _dv) and v.city_id in (select row_id from _map);
  get diagnostics v_detached = row_count;

  for r in select m.row_id from _map m
            where not exists (select 1 from public.events e where e.city_id = m.row_id) loop
    v_res := public.archive_city_as_nonplace(r.row_id, 'admin_subdivision_district',
                                             '{"by":"migration:city_district_cleanup"}');
    if coalesce((v_res->>'ok')::boolean, false) then
      v_arch := v_arch + 1;
    else
      raise exception 'district archive failed: %', v_res;
    end if;
  end loop;

  raise notice 'district cleanup: % cities created, % venues moved, % detached, % rows archived',
    v_new, v_moved, v_detached, v_arch;

  if exists (select 1 from public.venues v join _map m on m.row_id = v.city_id where v.duplicate_of_id is null) then
    raise exception 'venues still on a district row';
  end if;
end $$;

create or replace function public.city_name_nonplace_reason(p_name text)
 returns text
 language sql
 immutable parallel safe
 set search_path to ''
as $function$
  select case
    when p_name is null then null
    when p_name ~ '[#@]' then 'symbol'
    when p_name ~* 'https?:|www\.' then 'url'
    when p_name ~* '^\s*(carrera|cra|calle|cl|avenida|av|avda|rua|travessa|street|st|road|rd|via|viale|strasse|straße|str|ulica|ul|jalan|jl)\.?\s+\d' then 'street_address'
    when p_name ~ '\d+\s*-\s*\d+' then 'house_number_range'
    when p_name ~* '\w (?<!\m(do|da|de|dos|das|del|di|du) )hospital\s*$' then 'building'
    when p_name ~* '(\mtube station|\mrailway station|\mairport)\s*$' then 'building'
    when p_name ~* '\mmedical cent(er|re)\M' then 'building'
    when p_name ~* '^\s*(season|episode|series|part)\s+\d+\s*$' then 'media_label'
    when p_name ~* '^\s*\d+(st|nd|rd|th)\s+place\s*$' then 'media_label'
    when p_name ~* '^\W*(n/?a|null|none|unknown|tbd|tba|test)\W*$' then 'placeholder'
    when p_name ~* '^\s*(rt|rw)\s*\.?\s*\d+' then 'neighbourhood_unit'
    when p_name ~* '^\s*parroquia\s' then 'admin_subdivision'
    when p_name ~* '^\s*(barrio|bairro)\s' then 'neighbourhood_unit'
    when p_name ~* '^\s*comuna\s+\d' then 'admin_subdivision'
  end
$function$;

do $$
begin
  if public.city_name_nonplace_reason('Barrio Santa Ana') is distinct from 'neighbourhood_unit'
     or public.city_name_nonplace_reason('Comuna 5 de Barrancabermeja') is distinct from 'admin_subdivision'
     or public.city_name_nonplace_reason('Colonia del Sacramento') is not null
     or public.city_name_nonplace_reason('Comuna Rural de Dique Florentino Ameghino') is not null
     or public.city_name_nonplace_reason('Parroquia San Blas') is distinct from 'admin_subdivision' then
    raise exception 'city_name_nonplace_reason regression';
  end if;
end $$;
