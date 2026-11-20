-- Same-place city duplicates found by a general sweep: same country, < 10 km,
-- names equal once despaced, one containing the other, or trigram similarity
-- > 0.5. 126 pairs; most are neighbouring towns sharing a name part (Upper /
-- Lower Providence, Arenys de Mar / de Munt) or a district beside its city,
-- and are left. These 18 were read by hand and are one place each:
--   typos (San Pedero de Atacama, Ananideua, Ciuitadella, El Carmen De Vibora,
--   polvorines), a region glued onto the name (Alfenas/MG, Anápolis - GO,
--   Naucalpan de Juarez, CDMX, Florencia Caquetá), postal districts
--   (Esbjerg V, Esbjerg Ø, Odense C, Pelt 3900 + Pelt 3910 -> Pelt), and
--   other forms of one name (Sundsvalls stad, Neunkirchen / Neunkirchen
--   (Saar), Tlalnepantla de Baz, Xàbia / Jávea, Dessau -> Dessau-Roßlau).
-- The survivor takes the QID when it has none, except Dessau: Q487070 is the
-- pre-2007 town, not Dessau-Roßlau. Reversible via unmerge_cities.
--
-- The same sweep surfaced four rows that are not cities: Lake Tahoe (a
-- lake), Leicestershire (a county), South London (an area) and
-- "Harz (LK Goslar)" (a district). Their venues move to the real town
-- (South Lake Tahoe; the Nevada State Legislature to Carson City;
-- Clausthal-Zellerfeld) and the rows are archived (reversible).
do $$
declare r record; v_qid text; v_title text; v_res jsonb;
begin
  perform set_config('app.actor', 'migration:city_spelling_duplicates', true);
  for r in
    select * from (values
      ('533e795f-25d3-4bce-921d-0a6710ea8181'::uuid, '149b807b-b925-4d79-8380-90af3abb69b5'::uuid, true),  -- Alfenas <- Alfenas/MG
      ('c6838772-1ed2-4173-8ce0-7bb6bf9ae8bd'::uuid, '1e2d95d3-5f0e-45b1-bf2f-8bc408d5f7a5'::uuid, true),  -- Ananindeua <- Ananideua
      ('cb9f3dc1-b412-4647-958d-85a3d372cc0b'::uuid, 'deb98282-b840-4716-9692-0111f619995e'::uuid, true),  -- Anápolis <- Anápolis - GO
      ('8f44c62c-9330-4a39-8aa4-709a6bac157f'::uuid, 'c3a02762-f6a5-4e77-b359-493569e19e39'::uuid, true),  -- Ciutadella <- Ciuitadella
      ('8a577742-e32c-4429-8933-0b52d4c88ab2'::uuid, '53bffb91-6769-4bcc-b69b-e5046e039475'::uuid, false), -- Dessau-Roßlau <- Dessau
      ('034d3f65-afd0-4dae-bbfb-c376b3011d19'::uuid, 'f7496ed2-4928-4f2b-9724-da5f64b177f7'::uuid, true),  -- El Carmen de Viboral <- El Carmen De Vibora
      ('54b6db3b-95b0-4bb9-aeed-c18338685600'::uuid, 'aa6b680c-60f8-4836-8425-6190e72849a6'::uuid, true),  -- Esbjerg <- Esbjerg Ø
      ('54b6db3b-95b0-4bb9-aeed-c18338685600'::uuid, '03564baf-42d6-4691-b8f4-f8ad9dd52a0a'::uuid, true),  -- Esbjerg <- Esbjerg V
      ('1a283263-a7ec-4f36-8613-5725ce3599b4'::uuid, 'd8e3b599-ee4b-49f7-b975-dba58186aa15'::uuid, true),  -- Florencia <- Florencia Caquetá
      ('5f18e246-2e1f-4ec7-8068-f90c71f8cd0a'::uuid, 'd2b07bd4-1af2-4032-9037-3c154456cc4b'::uuid, true),  -- Los Polvorines <- polvorines
      ('e419d368-0228-4024-b617-767f022fa150'::uuid, '55a2acd6-620a-4c3e-80ac-6c4cb210ec1f'::uuid, true),  -- Naucalpan de Juárez <- ..., CDMX
      ('4006a387-7664-4f8c-9ca0-a3a93daa74fa'::uuid, '5afe6a09-3df6-40cc-a428-7ceecb79224f'::uuid, true),  -- Neunkirchen (Saar) <- Neunkirchen
      ('dc7b4032-eeff-4cea-b17a-90f216fd0f3d'::uuid, 'bfe88066-2386-4c94-9139-85b329ed73ad'::uuid, true),  -- Odense <- Odense C
      ('a65855a1-dbcf-455a-ac42-d3a2859085d2'::uuid, '96f96e88-6663-4970-acde-48458b05298a'::uuid, true),  -- Pelt 3910 <- Pelt 3900
      ('2d412164-ffd5-4e57-9225-e5eb85660cf2'::uuid, '0afde98b-0b9c-41d3-b813-c25053c244ab'::uuid, true),  -- San Pedro de Atacama <- San Pedero
      ('eea77691-9554-4377-ba1f-138f7bc7058b'::uuid, '513458a5-a7bd-4608-8740-7cad8b2e5a7c'::uuid, true),  -- Sundsvall <- Sundsvalls stad
      ('bac98253-0f8a-4728-b8a0-6268efdfde89'::uuid, '083a0112-3074-4991-b2af-46868fa38ab3'::uuid, true),  -- Tlalnepantla <- Tlalnepantla de Baz
      ('ce53e3b3-0ec9-4d68-96f7-eb160ce0666d'::uuid, '9d1404f4-44a2-4301-997b-1262fddfb9e7'::uuid, true)   -- Xàbia <- Xàbia / Jávea
    ) t(keep_id, drop_id, take_qid)
  loop
    if not exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null)
       or not exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.keep_id)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.drop_id)
       or not exists (select 1 from public.cities c join public.geo_places g on g.id = c.country_id
                       where c.id = r.keep_id) then
      continue;
    end if;
    select wikidata_qid, wikipedia_title into v_qid, v_title from public.cities where id = r.drop_id;
    perform public.merge_cities(r.keep_id, r.drop_id, false);
    if r.take_qid then
      update public.cities
         set wikidata_qid = coalesce(wikidata_qid, v_qid),
             wikipedia_title = coalesce(wikipedia_title, v_title)
       where id = r.keep_id;
    end if;
  end loop;

  update public.cities set name = 'Pelt'
   where id = 'a65855a1-dbcf-455a-ac42-d3a2859085d2' and name = 'Pelt 3910'
     and exists (select 1 from public.geo_places g where g.id = cities.id);

  -- Non-cities: move venues, then archive.
  if exists (select 1 from public.cities where id = 'f6e90725-2d76-47a6-afc3-0b667b5fff93' and duplicate_of_id is null) then
    update public.venues set city_id = case
             when address ilike '%Carson St%' or name = 'Nevada State Legislature'
               then '1ee095cc-4800-41c6-a90f-c79a591d65d6'::uuid       -- Carson City
             else 'f6e90725-2d76-47a6-afc3-0b667b5fff93'::uuid end     -- South Lake Tahoe
     where city_id = 'b4389494-449d-41bd-826c-d99f82dbd9e7'
       and exists (select 1 from public.cities where id = '1ee095cc-4800-41c6-a90f-c79a591d65d6' and duplicate_of_id is null);
  end if;
  update public.venues set city_id = 'a7fbc319-5cc3-4d69-86b5-68cbfa77b7f0'      -- Clausthal-Zellerfeld
   where city_id = '59d5eef3-f1c3-413a-9b94-697a57214a0d'
     and exists (select 1 from public.cities where id = 'a7fbc319-5cc3-4d69-86b5-68cbfa77b7f0' and duplicate_of_id is null);

  for r in
    select c.id from public.cities c
     where c.id in ('b4389494-449d-41bd-826c-d99f82dbd9e7', 'b54dabe0-14fa-4876-837a-f435be16349d',
                    '1d17dcba-6841-4b75-9c6b-f9900eeac8ed', '59d5eef3-f1c3-413a-9b94-697a57214a0d')
       and c.duplicate_of_id is null
       and exists (select 1 from public.geo_places g where g.id = c.id)
       and not exists (select 1 from public.venues v where v.city_id = c.id)
       and not exists (select 1 from public.events e where e.city_id = c.id)
  loop
    v_res := public.archive_city_as_nonplace(r.id, 'region_not_city',
                                             '{"by":"migration:city_spelling_duplicates"}');
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise exception 'non-city archive failed: %', v_res;
    end if;
  end loop;
end $$;
