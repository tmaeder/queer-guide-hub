-- The last 38 Swiss cities with no canton.
--
-- WHY THIS IS A SECOND PASS. `20261116110000` filled `region_name` from the
-- Swiss postal directory and stopped where the postal codes ran out. I then
-- reported the remaining 42 as having "no second signal", which was wrong and is
-- the reason this migration exists: only ONE of the 42 carries postal codes, but
-- FORTY carry coordinates -- the same second signal that carried the 45
-- municipality creates. Measuring the wrong column is not the same as there
-- being nothing to measure.
--
-- TWO AUTHORITIES, AND THEY HAVE TO AGREE.
--   A  Wikidata -- the city's name matches a current Swiss municipality's label
--      or alias in de/fr/it/rm/en, that municipality's point is within 6 km, and
--      its canton comes from a transitive P131 filtered to P31 = Q23058.
--   B  the Swiss postal directory -- a place of that name whose point agrees,
--      naming the municipality and its canton.
-- Where both speak they must return the same canton; a disagreement would be
-- left unresolved rather than arbitrated. Measured: both spoke for 29 of the 38
-- and disagreed on NONE. The other 9 are single-source and were read by hand.
--
-- The single-source rows are where a name alone would have gone wrong, so they
-- are worth naming: Hergiswil resolves to NIDWALDEN because the coordinate
-- separates it from Hergiswil bei Willisau in Lucerne; Kuesnacht to ZURICH, not
-- Kuesnacht am Rigi in Schwyz; Goppenstein is a hamlet and resolves through its
-- municipality Ferden; Anglikon through Wohlen AG; Pfaeffikon SZ through
-- Freienbach; Langnau b. Reiden through Reiden.
--
-- ONE NORMALIZATION NEARLY LOST A ROW. `Langnau b. Reiden` read as absent from
-- the postal directory because the lookup expanded "b." to "bei" before
-- matching -- the directory spells it exactly as our row does, so the tidier
-- form was the only one that could not match. Place names are compared verbatim
-- here for that reason.
--
-- FOUR ROWS ARE DELIBERATELY NOT TOUCHED, because they are not canton problems
-- and a canton invented for any of them would be a worse defect than the null:
--   Weimar        coordinates 50.98/11.33 are Weimar, Thuringia -- a GERMAN city
--                 filed under Switzerland
--   Westschweiz   a region ("Western Switzerland"), not a city; no coordinates
--   Biel          no coordinates; a tmp-slug duplicate of Biel/Bienne
--   Bunt          coordinates identical to Wattwil's to five decimals; a hamlet
-- All four come from the `personality-birth-place` and nominatim cohorts that
-- CLAUDE.md already documents. Dispositioning them is a separate decision with
-- an established reversible path (`archive_city_as_nonplace`), not a side effect
-- of a canton backfill.
--
-- Rows are addressed BY ID and the update is guarded on `region_name IS NULL`,
-- so a canton written by any other path between review and apply wins and this
-- migration declines rather than overwriting it.

do $$
declare
  v_ch uuid := (select id from public.countries where code = 'CH');
  v_n  integer := 0;
  r    record;
begin
  if v_ch is null then
    raise exception 'no country row for CH';
  end if;

  for r in
    select * from (values
      ('2d86bb18-83e7-42ed-bf2e-431d75ddbd95'::uuid, 'Aargau', 'both (wikidata Q14274 + directory Aarau, 809 m)'),
      ('d1a4e9be-1478-49f0-98de-b1fb481cf267'::uuid, 'St. Gallen', 'both (wikidata Q65679 + directory Amden, 3945 m)'),
      ('eff3f1ed-8f55-4eeb-aa95-60672c6a83e1'::uuid, 'Aargau', 'postal directory Wohlen (AG) (268 m)'),
      ('5a961147-6fff-4ec9-8666-03fb336213fa'::uuid, 'Geneva', 'both (wikidata Q69842 + directory Anières, 616 m)'),
      ('aa5dc95e-397b-4702-af24-9f7b65417454'::uuid, 'Schaffhausen', 'both (wikidata Q69123 + directory Beggingen, 843 m)'),
      ('0f9fe48d-c019-4131-894a-be588ea02df5'::uuid, 'Bern', 'both (wikidata Q1034 + directory Biel/Bienne, 399 m)'),
      ('e7e8e1b1-ee97-40ac-b3b2-6e9d9098e48d'::uuid, 'Aargau', 'wikidata Q64099 (125 m)'),
      ('fc457fad-f29e-4e4a-aeca-ec26d3fa1dd8'::uuid, 'Zurich', 'both (wikidata Q9093 + directory Bülach, 1342 m)'),
      ('b217ab44-427f-4d15-8b53-bfab4d48df7f'::uuid, 'Vaud', 'both (wikidata Q57108 + directory Corseaux, 2029 m)'),
      ('2ae9bce4-badb-4afb-a972-f0283dd85a1d'::uuid, 'Valais', 'both (wikidata Q68033 + directory Ferden, 695 m)'),
      ('97d5868e-f788-4d94-aad7-49bef3a9477e'::uuid, 'Nidwalden', 'wikidata Q570969 (2192 m)'),
      ('fbc564e0-88e6-4477-b4a9-47e1fbd1ff43'::uuid, 'Appenzell Ausserrhoden', 'both (wikidata Q63970 + directory Herisau, 992 m)'),
      ('6499e754-b70c-413a-9b46-007ff0d393d6'::uuid, 'Bern', 'both (wikidata Q68103 + directory Interlaken, 877 m)'),
      ('bab3daba-f83c-4f92-8d7b-2641adc1b7b2'::uuid, 'Thurgau', 'both (wikidata Q63905 + directory Kreuzlingen, 1111 m)'),
      ('910a92a5-96ce-4434-a5bd-f315dbebaa7e'::uuid, 'Lucerne', 'wikidata Q14571 (281 m)'),
      ('d6dca8aa-09f8-4e99-bc69-e03cebb6f1e3'::uuid, 'Zurich', 'wikidata Q69216 (166 m)'),
      ('bf8341e3-3bd8-4857-8b4c-fbe8ecc7aa86'::uuid, 'Grisons', 'wikidata Q69606 (31 m)'),
      ('12f8466e-709a-4897-a28e-d4eb97def98b'::uuid, 'Lucerne', 'postal directory Reiden (2345 m)'),
      ('61e49d5a-1b97-4e03-aeb1-52f89a13c838'::uuid, 'Ticino', 'both (wikidata Q11935 + directory Locarno, 472 m)'),
      ('bd5ae0a5-b233-4c2f-af8e-50ee4240224c'::uuid, 'Ticino', 'both (wikidata Q69065 + directory Minusio, 1264 m)'),
      ('4a9346ac-6e51-4a97-abb1-85325de19b37'::uuid, 'Valais', 'both (wikidata Q67040 + directory Naters, 2232 m)'),
      ('0a20be39-0ca2-48fc-904b-6082ffe4624c'::uuid, 'Schaffhausen', 'both (wikidata Q69372 + directory Neuhausen am Rheinfall, 1557 m)'),
      ('f00c0baa-dbb4-4fa4-aaf3-c86c15902739'::uuid, 'Solothurn', 'both (wikidata Q68129 + directory Olten, 402 m)'),
      ('b66f62e9-cf25-4729-b59b-75f24954678c'::uuid, 'Bern', 'both (wikidata Q69682 + directory Ostermundigen, 375 m)'),
      ('3bdaa23e-ab8d-4950-91a8-028c7b4a9680'::uuid, 'Schwyz', 'postal directory Freienbach (1170 m)'),
      ('9601af40-44d3-4666-934c-fb102d57ab1d'::uuid, 'Obwalden', 'postal directory Sachseln (3791 m)'),
      ('4185d699-e95a-4792-8263-18b8d7fbf3dd'::uuid, 'Obwalden', 'both (wikidata Q63964 + directory Sarnen, 827 m)'),
      ('2cbe35a1-e48a-4f0c-9a01-8d1ef29ac3c6'::uuid, 'Schaffhausen', 'both (wikidata Q9009 + directory Schaffhausen, 322 m)'),
      ('39cc31bf-f2aa-41df-bfb1-0853e960aeab'::uuid, 'Schwyz', 'both (wikidata Q68155 + directory Schwyz, 310 m)'),
      ('57ff3de4-4589-4d8d-90cd-177f46a72c85'::uuid, 'Bern', 'both (wikidata Q69484 + directory Spiez, 356 m)'),
      ('e6b13369-41c0-4d5c-96b1-3f885be20be1'::uuid, 'Zurich', 'both (wikidata Q66079 + directory Unterengstringen, 1546 m)'),
      ('3df26d08-7ce7-43a4-99e7-82e8160f5ca3'::uuid, 'Bern', 'both (wikidata Q67097 + directory Unterseen, 1438 m)'),
      ('af6b6cf5-9497-43bc-8cac-906fe9fdab00'::uuid, 'Zurich', 'both (wikidata Q64032 + directory Uster, 191 m)'),
      ('5434088e-c223-45a2-b841-f30cae856b3b'::uuid, 'Geneva', 'both (wikidata Q63979 + directory Versoix, 1584 m)'),
      ('272b1978-c493-4342-8a69-568378858db3'::uuid, 'Valais', 'both (wikidata Q64147 + directory Visp, 1090 m)'),
      ('ed225d9c-0d50-4168-8b31-bc56f3570765'::uuid, 'Zurich', 'both (wikidata Q69374 + directory Wallisellen, 524 m)'),
      ('a5b6b54e-0cf2-43d7-bdf5-cf7bed083e9c'::uuid, 'St. Gallen', 'both (wikidata Q66601 + directory Wattwil, 1301 m)'),
      ('69900e3c-d794-41db-b9a0-5e60e7ff08db'::uuid, 'Bern', 'both (wikidata Q69417 + directory Zweisimmen, 2246 m)')
    ) as t(id, canton, basis)
  loop
    update public.cities c
       set region_name = r.canton,
           field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
             'region_name', jsonb_build_object(
               'value', r.canton, 'basis', r.basis,
               'rule', 'name and coordinate must agree, and where both authorities speak they must return the same canton',
               'at', now(), 'by', 'migration:20261126100000')),
           updated_at = now()
     where c.id = r.id
       and c.country_id = v_ch
       and c.region_name is null;
    v_n := v_n + 1;
  end loop;

  raise notice 'canton pass 2: % rows considered', v_n;

  -- The four named above are the ONLY Swiss cities that may still lack a canton.
  -- Anything else means a row appeared, or one of the 38 silently declined.
  if (select count(*) from public.cities c
       where c.country_id = v_ch and c.duplicate_of_id is null and c.region_name is null) > 4 then
    raise exception 'expected at most 4 canton-less Swiss cities, found %',
      (select count(*) from public.cities c
        where c.country_id = v_ch and c.duplicate_of_id is null and c.region_name is null);
  end if;

  -- And the first pass's finding must survive this one.
  if (select region_name from public.cities where wikidata_qid = 'Q68144') is distinct from 'Zug' then
    raise exception 'Zug canton changed during the second canton pass';
  end if;
end $$;
