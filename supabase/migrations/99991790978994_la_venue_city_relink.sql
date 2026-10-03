-- LA venue → city relink: independent municipalities filed under Los Angeles.
--
-- WHAT WAS WRONG
-- /venues/yard-house (100 E Palm Ave, Burbank, CA 91502) rendered
-- "City: Los Angeles, United States". Its own `venues.city` text says Burbank;
-- its `city_id` pointed at Los Angeles. 26 of the 276 venues on the LA row carry
-- a city text other than "Los Angeles". Most are real LA neighbourhoods and are
-- linked correctly; fifteen sit in SEPARATE incorporated cities (Burbank,
-- Beverly Hills, Commerce, Culver City, Glendale, Huntington Park, Long Beach,
-- Santa Monica, Sierra Madre, West Hollywood).
--
-- WHY — THE PRODUCER IS AN ALIAS, NOT A FALLBACK
-- A batch on 2026-05-01 07:53 wrote 118 `city_aliases` rows that fold metro-
-- area names into their core city. For Los Angeles that includes ten SEPARATE
-- incorporated cities: Beverly Hills, Burbank, Commerce, Culver City, Glendale,
-- Huntington Park, Long Beach, Santa Monica, Sierra Madre, West Hollywood.
-- city_resolve_or_create matches aliases before it creates, so with no Burbank
-- row "Burbank" resolved to Los Angeles (match_type 'alias', confidence 0.95) —
-- measured by calling the resolver on prod. Four of the ten had no `cities` row
-- at all; for the other six the alias only stayed harmless because the name
-- step runs first. The rest of that batch (Jersey City → New York, Haarlem →
-- Amsterdam, Berkeley → San Francisco, Yokohama → Tokyo …) is the same class
-- and is NOT repaired here — LA first, by agreement.
--
-- WHAT THIS DOES
-- 0. Deletes the ten independent-city aliases from Los Angeles (ids below are
--    the record; a deleted alias is restored by re-inserting the row). The
--    neighbourhood aliases stay: Silver Lake, Venice, Playa Vista, Studio City.
--    Marina del Rey is unincorporated county land, not LA city — left, named.
-- 1. Creates Burbank, Culver City, Huntington Park and Sierra Madre through
--    public.city_resolve_or_create (lock + re-check + splitter), never a bare
--    INSERT. Identifiers and coordinates were resolved LIVE on 2026-10-03
--    (wbgetentities: each label is the city, each description reads "city in
--    Los Angeles County, California, United States"); none was already held
--    by another row, and no live city sits within 3 km of any of them.
-- 2. Fills region_name on the existing Commerce placeholder row (fill-if-empty).
-- 3. Moves fifteen venues, each on TWO signals evaluated here in SQL, not
--    merely asserted in a comment: the venue's own address names the target
--    city, AND either its postal code belongs to that city or its coordinates
--    sit within 10 km of the target centroid. A row failing either is skipped
--    and reported, never moved.
--
-- DELIBERATELY NOT TOUCHED
-- * LA neighbourhoods, linked correctly: Silver Lake, Venice, Studio City,
--   Sherman Oaks, North Hollywood, Northridge, Playa Vista, Wilmington.
-- * Pasta Sisters Culver City (3280 Helms Ave): the address says Culver City
--   but 90034 is a Los Angeles ZIP and the Helms Bakery block straddles the
--   line. Two signals disagree, so it stays where it is.
-- * Postal codes: 115 venues carry postal_code '90013' (a downtown ZIP) and 65
--   of them sit >5 km from downtown — a centroid reverse-geocode default. Its
--   own repair, not this one.
--
-- 1739 Public House carries city text "Athens" while its address reads
-- "…Los Angeles"; the text is corrected so a name-only resolver can never read
-- it as Athens, Georgia. Its city_id (LA) is already right and is not touched.

set local lock_timeout = '5s';
select set_config('app.actor', 'migration:99991790978994_la_venue_city_relink', true);

-- ---------------------------------------------------------------------------
-- 0. Independent-city aliases off Los Angeles. Must run BEFORE step 1, or the
--    resolver matches "Burbank" to Los Angeles by alias instead of creating it.
-- ---------------------------------------------------------------------------
delete from public.city_aliases
 where city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid
   and id in (
     'eda0fc5f-30fa-44fa-9b10-9bade703d17d',  -- Beverly Hills
     'c9c5ef9f-b096-40c5-baed-3ecec86fb9da',  -- Burbank
     '403af846-6575-445a-b6e0-c4e746fe86d5',  -- Commerce
     '2cc1f98f-4ed0-4c60-b3e1-1ae232512186',  -- Culver City
     'c3cb4f3e-1488-4a26-8ccb-9ebdf295f7ac',  -- Glendale
     'f9c06f59-3f81-43fc-a5d2-316102c8e31b',  -- Huntington Park
     'c34ca732-1a74-418e-a89f-77f017c89a94',  -- Long Beach
     'a16e78a9-31d8-4f73-ad06-36ac8c8634fb',  -- Santa Monica
     'f8645c37-0434-4aa4-91ae-d9574e718e4a',  -- Sierra Madre
     '2e0fc101-2e2e-489a-8190-5f07528425bb'   -- West Hollywood
   );

-- ---------------------------------------------------------------------------
-- 1. Missing cities
-- ---------------------------------------------------------------------------
do $create$
declare
  r record;
  v record;
begin
  for r in
    select * from (values
      ('Burbank',         34.180278::numeric, -118.328333::numeric, 'Q39561'),
      ('Culver City',     34.008056::numeric, -118.401389::numeric, 'Q493378'),
      ('Huntington Park', 33.982500::numeric, -118.217500::numeric, 'Q851027'),
      ('Sierra Madre',    34.164722::numeric, -118.050833::numeric, 'Q174026')
    ) t(name, lat, lng, qid)
  loop
    select * into v
    from public.city_resolve_or_create(
      p_name          => r.name,
      p_country_code  => 'US',
      p_region_hint   => 'California',
      p_lat           => r.lat,
      p_lng           => r.lng,
      p_wikidata_qid  => r.qid,
      p_source_slug   => 'migration:99991790978994',
      p_allow_create  => true,
      p_actor         => 'admin'
    );
    if v.city_id is null then
      raise exception 'city_resolve_or_create refused % (action=%, reason=%, candidates=%)',
        r.name, v.action, v.reason, v.candidates;
    end if;
    if v.city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid then
      raise exception '% still resolves to Los Angeles (match_type=%)', r.name, v.match_type;
    end if;
    raise notice '% -> % (%)', r.name, v.city_id, v.action;
  end loop;
end
$create$;

-- ---------------------------------------------------------------------------
-- 2. Commerce placeholder: region only, fill-if-empty
-- ---------------------------------------------------------------------------
update public.cities
   set region_name = 'California'
 where id = 'dfd3883d-11d4-4339-b768-4e86d4cce40f'
   and nullif(btrim(region_name), '') is null;

-- ---------------------------------------------------------------------------
-- 3. Relink
-- ---------------------------------------------------------------------------
create temp table _la_relink on commit drop as
select t.venue_id::uuid, t.target_name, t.target_id::uuid, t.target_qid, t.zips
from (values
  -- venue_id,                                 target city,       existing id,                              qid (new rows), postal codes of that city
  ('38544df6-1a44-4876-8d51-5cd129335c92', 'Burbank',         null,                                   'Q39561',  array['91501','91502','91504','91505','91506']),
  ('bd2244a7-07ff-4cae-9dea-c2c2ecaf2faf', 'Burbank',         null,                                   'Q39561',  array['91501','91502','91504','91505','91506']),
  ('2eb9087c-b578-4e29-b709-f207723022b1', 'Beverly Hills',   'd3def29e-16fd-473c-b072-529d25c1d7a0', null,      array['90210','90211','90212']),
  ('887e576a-e556-473e-ac46-dd65c340a80b', 'Commerce',        'dfd3883d-11d4-4339-b768-4e86d4cce40f', null,      array['90040']),
  ('b433ecee-e472-4720-94bb-411d6deb1895', 'Commerce',        'dfd3883d-11d4-4339-b768-4e86d4cce40f', null,      array['90040']),
  ('226756c8-d04a-4bdc-a20f-1c1040b80727', 'Culver City',     null,                                   'Q493378', array['90230','90232']),
  ('3628fac6-fcc1-4556-abe4-644620591606', 'Glendale',        '3313762d-1817-4442-b476-d2b3dd1d6415', null,      array['91201','91202','91203','91204','91205','91206','91207','91208']),
  ('b656fa2d-2034-4717-812e-1dd80fef31ea', 'Huntington Park', null,                                   'Q851027', array['90255']),
  ('16ce6e75-d10f-4915-b5d6-64cbd8f874e2', 'Long Beach',      'd3b59c48-22a0-4714-8f3b-3d4009d710f4', null,      array['90802','90803','90804','90805','90806','90807','90808','90810','90813','90814','90815']),
  ('ee5e4f03-2468-430c-b43f-bdfd304a96cc', 'Santa Monica',    'c8c65fe5-1e98-46d1-b992-889499b982d4', null,      array['90401','90402','90403','90404','90405']),
  ('4dc3ea71-9cec-4771-af72-f10e88fa50ed', 'Sierra Madre',    null,                                   'Q174026', array['91024']),
  ('5883a031-e340-4d6e-9efa-2baea18b97c7', 'West Hollywood',  'd7388073-c081-4570-8018-edb7b3775013', null,      array['90069','90046','90048']),
  ('73879774-c0a1-4699-9d67-54cb79e95bbf', 'West Hollywood',  'd7388073-c081-4570-8018-edb7b3775013', null,      array['90069','90046','90048']),
  ('b03f80d5-db6f-499b-9757-548bfb26d3ed', 'West Hollywood',  'd7388073-c081-4570-8018-edb7b3775013', null,      array['90069','90046','90048']),
  ('b6dcaba7-93ec-4aa7-b1f4-83d146b6f17e', 'West Hollywood',  'd7388073-c081-4570-8018-edb7b3775013', null,      array['90069','90046','90048'])
) t(venue_id, target_name, target_id, target_qid, zips);

-- Resolve the new cities by identifier, not by name.
update _la_relink r
   set target_id = c.id
  from public.cities c
 where r.target_id is null
   and c.wikidata_qid = r.target_qid
   and c.duplicate_of_id is null;

do $relink$
declare
  r        record;
  v_signal text;
  v_moved  int := 0;
  v_skip   int := 0;
begin
  for r in
    select l.*, v.address, v.postal_code, v.latitude, v.longitude, v.city_id,
           c.latitude as c_lat, c.longitude as c_lng
      from _la_relink l
      join public.venues v on v.id = l.venue_id
      left join public.cities c on c.id = l.target_id
  loop
    if r.target_id is null then
      raise exception 'target city % did not resolve', r.target_name;
    end if;

    -- Soft precondition: someone else already moved it.
    if r.city_id is distinct from '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid then
      raise notice 'skip % — no longer on Los Angeles', r.venue_id;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- Signal 1: the venue's own address names the target city.
    if coalesce(r.address, '') not ilike '%' || r.target_name || '%' then
      raise notice 'skip % — address does not name %', r.venue_id, r.target_name;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- Signal 2: postal code of that city, or coordinates within 10 km.
    v_signal := case
      when r.postal_code = any (r.zips) then 'postal_code:' || r.postal_code
      when r.latitude is not null and r.c_lat is not null
           and public.haversine_m(r.latitude, r.longitude, r.c_lat, r.c_lng) <= 10000
        then 'coords_km:' || round((public.haversine_m(r.latitude, r.longitude, r.c_lat, r.c_lng) / 1000)::numeric, 1)
      else null
    end;
    if v_signal is null then
      raise notice 'skip % — no second signal for %', r.venue_id, r.target_name;
      v_skip := v_skip + 1;
      continue;
    end if;

    update public.venues
       set city_id = r.target_id,
           enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
             || jsonb_build_object('city_relink', jsonb_build_object(
                  'by', 'migration:99991790978994',
                  'at', now(),
                  'from_city_id', '3beb0554-c93b-415a-92cd-4adfa40f5615',
                  'to_city', r.target_name,
                  'evidence', jsonb_build_array('address_names_city', v_signal)))
     where id = r.venue_id
       and city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid;
    v_moved := v_moved + 1;
  end loop;
  raise notice 'relinked %, skipped %', v_moved, v_skip;
end
$relink$;

-- Athens text → Los Angeles (city_id already LA; address reads "…Los Angeles").
update public.venues
   set city = 'Los Angeles'
 where id = '4948c2d8-5c3b-4c96-a2fc-5ca3f58565b1'
   and city = 'Athens'
   and city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid
   and address ilike '%Los Angeles%';

-- ---------------------------------------------------------------------------
-- Postconditions: end state, not write counts.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad int;
begin
  -- P1: four new cities exist, live, in the US, in California, carrying their identifier.
  select 4 - count(*) into v_bad
    from public.cities c
    join public.countries co on co.id = c.country_id
   where c.wikidata_qid in ('Q39561','Q493378','Q851027','Q174026')
     and c.duplicate_of_id is null
     and co.code = 'US'
     and c.region_name = 'California';
  if v_bad <> 0 then
    raise exception 'P1 failed: % of 4 new cities missing or wrong', v_bad;
  end if;

  -- P2: none of the fifteen venues is still on Los Angeles.
  select count(*) into v_bad
    from public.venues v
    join _la_relink l on l.venue_id = v.id
   where v.city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid;
  if v_bad <> 0 then
    raise exception 'P2 failed: % venues still on Los Angeles', v_bad;
  end if;

  -- P3: controls stay on Los Angeles (neighbourhoods + the ambiguous Pasta Sisters).
  select count(*) into v_bad
    from public.venues v
   where v.id in (
           '0f93291a-7237-48b5-ad0a-b794377dfb5a',  -- Pasta Sisters (ambiguous)
           '00e2d52d-b25d-4ed1-81dc-8a4d438ddabf',  -- Akbar, Silver Lake
           '2fb7868f-0840-43ec-9697-59a6d9fa6b59',  -- Belles Beach House, Venice
           'd5ad0ca5-c28b-486a-8707-979f09cf2ca3',  -- Laurel Tavern, Studio City
           '1c0c05ac-eeea-4f71-9e59-cace47d579fc'   -- 1350 Club, Wilmington
         )
     and v.city_id is distinct from '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid;
  if v_bad <> 0 then
    raise exception 'P3 failed: % control venues moved off Los Angeles', v_bad;
  end if;

  -- P4: Los Angeles kept its own venues.
  select count(*) into v_bad
    from public.venues
   where city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid
     and duplicate_of_id is null;
  if v_bad < 250 then
    raise exception 'P4 failed: Los Angeles left with % venues', v_bad;
  end if;

  -- P5: no independent-city alias left on Los Angeles (by KEY, so a re-created
  -- row with a new id is caught too); neighbourhood aliases kept.
  select count(*) into v_bad
    from public.city_aliases
   where city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid
     and alias_key in ('beverly hills','burbank','commerce','culver city','glendale',
                       'huntington park','long beach','santa monica','sierra madre','west hollywood');
  if v_bad <> 0 then
    raise exception 'P5 failed: % independent-city aliases still on Los Angeles', v_bad;
  end if;
  select count(*) into v_bad
    from public.city_aliases
   where city_id = '3beb0554-c93b-415a-92cd-4adfa40f5615'::uuid
     and alias_key in ('silver lake','venice','playa vista','studio city');
  if v_bad <> 4 then
    raise exception 'P5 failed: neighbourhood aliases changed (% of 4 present)', v_bad;
  end if;
end
$verify$;
