-- "Parroquia ..." rows are parishes (sub-municipal units), not cities.
-- The geocoder (data_source nominatim-geocode / photon-location) minted 31
-- of them, 30 in Venezuela and 1 in Ecuador, from the parish name an address
-- lookup returned. They held 81 venues whose own address names the real city
-- (", Barquisimeto", ", Valencia"). Several of those cities had no row at
-- all, which is why the parish stood in: Valencia, Venezuela's third-largest
-- city, did not exist here.
--
--   1. Each venue's target city is the last segment of its address, with a
--      few districts mapped to their city (San Félix -> Ciudad Guayana,
--      El Trigal / Carabobo -> Valencia, Quizandal -> Puerto Cabello) and the
--      Lechería bar whose address is multi-line.
--   2. Real towns missing from cities are created from a hand-checked list,
--      at the mean of their venues' coordinates, flagged needs_attention so
--      the Wikidata sweep links a QID, and not indexable until it does
--      (the resolver's rule for a row with no QID).
--   3. Venues move to the matching city (alias key, same country, < 50 km).
--      The rest (an island, a lagoon, one 289 km off) are detached and
--      flagged rather than guessed.
--   4. The parish rows, now content-free, are archived (reversible,
--      archive_city_as_nonplace).
--   5. city_name_nonplace_reason learns 'admin_subdivision' for names that
--      start with "Parroquia", so trg_cities_a0_reject_nonplace_name refuses
--      new ones from any writer.
do $$
declare
  r record; v_new int := 0; v_moved int; v_detached int; v_arch int := 0; v_res jsonb;
begin
  perform set_config('app.actor', 'migration:city_parish_cleanup', true);

  create temp table _par on commit drop as
    select id, country_id, region_name, latitude, longitude from public.cities c
     where duplicate_of_id is null and name ~* '^\s*parroquia\s'
       -- skip rows whose geo spine rows are missing (partial CI snapshot)
       and exists (select 1 from public.geo_places g where g.id = c.id)
       and exists (select 1 from public.geo_places g where g.id = c.country_id);

  create temp table _pv on commit drop as
    select v.id venue_id, p.id parish_id, p.country_id, p.region_name,
           coalesce(v.latitude::numeric, p.latitude) lat, coalesce(v.longitude::numeric, p.longitude) lng,
           case
             when v.address ilike '%Lechería%' then 'Lechería'
             else case btrim(regexp_replace(v.address, '^.*,', ''))
               when 'San Félix' then 'Ciudad Guayana'
               when 'El Trigal' then 'Valencia'
               when 'Carabobo' then 'Valencia'
               when 'Quizandal' then 'Puerto Cabello'
               else btrim(regexp_replace(v.address, '^.*,', '')) end
           end target
      from public.venues v join _par p on p.id = v.city_id
     where v.duplicate_of_id is null;

  for r in
    select pv.target, pv.country_id, min(pv.region_name) region_name, avg(pv.lat) lat, avg(pv.lng) lng
      from _pv pv
     where pv.target in ('Valencia','Barinas','San Diego','Palo Negro','Cabimas','Valera',
                         'Ciudad Ojeda','Chichiriviche','Ureña','El Limón','San Francisco')
       and not exists (select 1 from public.cities c
                        where c.duplicate_of_id is null and c.country_id = pv.country_id
                          and c.canonical_key = public.city_canonical_key(pv.target)
                          and c.name !~* '^\s*parroquia\s')
     group by pv.target, pv.country_id
  loop
    -- region_name, not region_code: trg_cities_ab_region_code derives the
    -- code from the name on INSERT and would overwrite an explicit code.
    insert into public.cities (name, country_id, region_name, latitude, longitude, data_source,
                               needs_attention, seo_indexable, field_provenance,
                               last_synced_at, created_at, updated_at)
    values (r.target, r.country_id, r.region_name, round(r.lat, 6), round(r.lng, 6),
            'migration:city_parish_cleanup', true, false,
            jsonb_build_object('city_resolve', jsonb_build_object(
              'action', 'created', 'source', 'migration:city_parish_cleanup',
              'reason', 'replaces a parish row; coordinates are the mean of its venues', 'at', now())),
            now(), now(), now());
    v_new := v_new + 1;
  end loop;

  update public.venues v set city_id = t.cid
    from (select pv.venue_id,
                 (select c.id from public.cities c join public.city_aliases a on a.city_id = c.id
                   where c.duplicate_of_id is null and c.country_id = pv.country_id
                     and c.name !~* '^\s*parroquia\s'
                     and a.alias_key = public.city_canonical_key(pv.target) and c.latitude is not null
                     and public.haversine_m(pv.lat, pv.lng, c.latitude, c.longitude) < 50000
                   order by public.haversine_m(pv.lat, pv.lng, c.latitude, c.longitude) limit 1) cid
            from _pv pv) t
   where v.id = t.venue_id and t.cid is not null;
  get diagnostics v_moved = row_count;

  update public.venues v
     set city_id = null, needs_attention = true,
         enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object('city_detached',
           jsonb_build_object('reason', 'parish_city_row_archived', 'from_city_id', v.city_id,
                              'by', 'migration:city_parish_cleanup'))
   where v.id in (select venue_id from _pv) and v.city_id in (select id from _par);
  get diagnostics v_detached = row_count;

  for r in select p.id from _par p
            where not exists (select 1 from public.events e where e.city_id = p.id) loop
    v_res := public.archive_city_as_nonplace(r.id, 'admin_subdivision_parish',
                                             '{"by":"migration:city_parish_cleanup"}');
    if coalesce((v_res->>'ok')::boolean, false) then
      v_arch := v_arch + 1;
    else
      raise exception 'parish archive failed: %', v_res;
    end if;
  end loop;

  raise notice 'parish cleanup: % cities created, % venues moved, % detached, % parishes archived',
    v_new, v_moved, v_detached, v_arch;

  if exists (select 1 from public.venues v join public.cities c on c.id = v.city_id
              where v.duplicate_of_id is null and c.id in (select id from _par)) then
    raise exception 'venues still on a parish row';
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
  end
$function$;

do $$
begin
  if public.city_name_nonplace_reason('Parroquia San Blas') is distinct from 'admin_subdivision'
     or public.city_name_nonplace_reason('Valencia') is not null
     or public.city_name_nonplace_reason('Calle 5 Norte') is distinct from 'street_address' then
    raise exception 'city_name_nonplace_reason regression';
  end if;
end $$;
