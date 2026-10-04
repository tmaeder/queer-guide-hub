-- Taoyuan (TW) and Kinshasa (CD): wrong city coordinates, and the venue that
-- carried Taoyuan's error.
--
-- WHY
-- 99991791059373 places a city in its region only when the matched
-- subdivision lies within 100 km. Two real, indexable cities failed that gate,
-- and the coordinates were the defect, not the gate:
--
-- * Taoyuan sat at 22.634439 / 120.301208 — southern Taiwan, ~280 km from
--   Taoyuan. That is EXACTLY the position of the venue "Xin Tao-yuan"
--   (22.6344385 / 120.3012081), and the city's data_source is
--   'nominatim-geocode': one failed geocode of "182 Min-zhu Road, 5th Lane"
--   (a street name that exists in more than one Taiwanese city) placed the
--   venue in the south, and the city row was filled from the same result.
--   The venue IS in Taoyuan: its own spartacus source carries 24.994774 /
--   121.308207 and its phone has Taoyuan's 03 area code. A second copy of the
--   venue, created 2026-08-21 with the correct coordinates, was merged INTO
--   the wrong one — merge_venues copies no fields, so the better values were
--   lost with the loser.
-- * Kinshasa sat at -4.0383 / 21.7587, the centroid of the DR Congo, ~716 km
--   from the capital.
--
-- EVIDENCE (three independent signals per row, all agreeing within 1 km)
--   Taoyuan  Q115256 P625 24.991278 / 121.314328 · TW-TAO 24.99363 / 121.30098
--            · venue "Boss Men's Club" 24.93214 / 121.28654
--   Kinshasa Q3838   P625 -4.321944 / 15.311944  · CD-KN -4.32171 / 15.31225
--            · venue "Hotel Everest RD CONGO" -4.32533 / 15.30695
--   Xin Tao-yuan: its own venue_sources spartacus payload, 24.994774 / 121.308207.
--
-- WHAT THIS DOES
-- Writes the Wikidata P625 coordinates to both cities and the source
-- coordinates to the venue — each guarded on the CURRENT wrong value, so a
-- later human fix is never overwritten — and records the old value in
-- provenance. With the cities placed, region_name is set to the subdivision
-- name; trg_cities_ab_region_code derives TW-TAO / CD-KN from it.
-- Nothing derived from the wrong centroids exists to repair: measured 0
-- venues/events/hotels carry either city's old coordinates.

select set_config('app.actor', 'migration:99991791146347_city_coords_taoyuan_kinshasa', true);

update public.cities c
   set latitude  = v.lat,
       longitude = v.lng,
       field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
         || jsonb_build_object(
              'latitude',  jsonb_build_object('source', 'wikidata:P625', 'qid', v.qid, 'value', v.lat,
                             'corrected', jsonb_build_object('from', c.latitude,
                                'by', 'migration:99991791146347', 'reason', v.reason)),
              'longitude', jsonb_build_object('source', 'wikidata:P625', 'qid', v.qid, 'value', v.lng,
                             'corrected', jsonb_build_object('from', c.longitude,
                                'by', 'migration:99991791146347', 'reason', v.reason)))
  from (values
    ('b29837b0-067d-4c40-a8ef-eea826b9b9f9'::uuid, 'Q115256', 24.991278::numeric, 121.314328::numeric,
       22.634439::numeric, 120.301208::numeric, 'copied from a failed venue geocode in southern Taiwan'),
    ('8fe8c9e4-2e8b-4da4-8228-81ac73410c2c'::uuid, 'Q3838', -4.321944::numeric, 15.311944::numeric,
       -4.0383::numeric, 21.7587::numeric, 'country centroid of the DR Congo, not the city')
  ) as v(id, qid, lat, lng, bad_lat, bad_lng, reason)
 where c.id = v.id
   and c.wikidata_qid = v.qid
   and round(c.latitude::numeric, 4) = round(v.bad_lat, 4)
   and round(c.longitude::numeric, 4) = round(v.bad_lng, 4);

update public.cities c
   set region_name = s.name
  from public.geo_subdivisions s
  join public.countries co on co.code = s.country_code
 where c.id in ('b29837b0-067d-4c40-a8ef-eea826b9b9f9', '8fe8c9e4-2e8b-4da4-8228-81ac73410c2c')
   and co.id = c.country_id
   and s.code = case c.id when 'b29837b0-067d-4c40-a8ef-eea826b9b9f9' then 'TW-TAO' else 'CD-KN' end
   and nullif(btrim(c.region_name), '') is null
   and public.resolve_region_code(co.code, s.name) = s.code
   and public.haversine_m(s.latitude, s.longitude, c.latitude, c.longitude) <= 100000;

update public.venues v
   set latitude  = 24.994774,
       longitude = 121.308207,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('coords_corrected', jsonb_build_object(
              'by', 'migration:99991791146347',
              'from', jsonb_build_object('lat', v.latitude, 'lng', v.longitude),
              'source', 'venue_sources spartacus payload normalized.location',
              'reason', 'failed geocode placed it in southern Taiwan; merged duplicate afe6cf10 carried the source coordinates'))
 where v.id = '394724aa-2469-4c5d-94d6-58c9d70eaa26'
   and round(v.latitude::numeric, 4) = 22.6344
   and round(v.longitude::numeric, 4) = 120.3012
   and exists (
     select 1 from public.venue_sources s
      where s.venue_id = v.id
        and (s.payload->'normalized'->'location'->>'lat')::numeric = 24.994774
        and (s.payload->'normalized'->'location'->>'lng')::numeric = 121.308207);

-- ---------------------------------------------------------------------------
-- Postconditions — END STATE: each row is where three signals put it,
-- whoever wrote it.
-- ---------------------------------------------------------------------------
do $verify$
declare
  r record;
  v_km numeric;
begin
  for r in select * from (values
      ('b29837b0-067d-4c40-a8ef-eea826b9b9f9'::uuid, 'TW-TAO', 24.991278::numeric, 121.314328::numeric),
      ('8fe8c9e4-2e8b-4da4-8228-81ac73410c2c'::uuid, 'CD-KN',  -4.321944::numeric, 15.311944::numeric)
    ) as t(id, code, lat, lng)
  loop
    select public.haversine_m(c.latitude, c.longitude, r.lat, r.lng) / 1000 into v_km
      from public.cities c where c.id = r.id;
    if v_km is null or v_km > 25 then
      raise exception 'P1 failed: city % is % km from its Wikidata position', r.id, round(v_km);
    end if;
    if not exists (select 1 from public.cities c where c.id = r.id and c.region_code = r.code) then
      raise exception 'P2 failed: city % does not carry %', r.id, r.code;
    end if;
  end loop;

  select public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude) / 1000 into v_km
    from public.venues v join public.cities c on c.id = v.city_id
   where v.id = '394724aa-2469-4c5d-94d6-58c9d70eaa26';
  if v_km is not null and v_km > 25 then
    raise exception 'P3 failed: Xin Tao-yuan is % km from Taoyuan', round(v_km);
  end if;
end
$verify$;
