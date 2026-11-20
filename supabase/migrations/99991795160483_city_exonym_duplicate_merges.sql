-- City duplicates where one place exists twice under two spellings: an
-- endonym/exonym pair (Gent/Ghent, Kolmar/Colmar, Καλαμάτα/Kalamata,
-- La Habana/Havana, Menen/Menin) or a long/short official form
-- (Weiden i.d.OPf., Immenstadt i.Allgäu, Bautzen - Budyšin,
-- Caldas Novas - GO, Singen (Hohentwiel)).
--
-- Found by joining live cities on (country, lower(name) = other row's
-- lower(name_local)) and reading every hit. Most hits were NOT duplicates
-- (districts: Davos Platz, Fryštát; municipalities vs towns: Langemark-
-- Poelkapelle, Town of Islip; different places: Neustadt, Florence, Mansfield)
-- and are left alone. Each pair below was checked: same country, same region
-- code where both have one, and same Wikidata entity.
--
-- Ghent is the special case. Its row sat at Brussels coordinates
-- (50.89, 4.38, region BE-BRU) with no QID, which is why name+proximity checks
-- never paired it with Gent (Q1296, 51.05/3.72, BE-VLG) -- 49 km apart. 46 of
-- its 48 venues have Ghent coordinates and 9000 Gent addresses. The one that
-- does not ("Beige", Halle-Vilvoorde, ~11 km north of Brussels) is detached
-- and flagged before the merge rather than moved onto Ghent.
--
-- Survivor = the row with the readable English name; the Wikidata QID moves
-- onto it after the merge (uq_cities_wikidata_qid only covers live rows).
-- Gent's row is kept (correct coords + QID) and renamed to the English
-- "Ghent"; name_local stays "Gent". Slugs are not changed.
--
-- Reversible: merge_cities stamps schema:1 so unmerge_cities replays the
-- reparenting. Pairs whose rows moved are skipped, not aborted.
do $$
declare
  r record;
  v_merged int := 0;
  v_skipped text := '';
  v_skipped_n int := 0;
  v_qid text;
  v_title text;
  v_bad int;
begin
  perform set_config('app.actor', 'migration:city_exonym_duplicate_merges', true);

  -- Beige is not in Ghent; detach it instead of letting the merge move it.
  update public.venues
     set city_id = null,
         needs_attention = true,
         enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
           || jsonb_build_object('city_detached', jsonb_build_object(
                'from_city', 'ghent', 'reason', 'coords_not_in_ghent',
                'by', 'migration:city_exonym_duplicate_merges'))
   where id = 'cffa5b8b-f467-454e-b1c7-efcb6bad005a'
     and city_id = '2a3dfdb2-060f-493a-aac2-86c07922c626';

  for r in
    select * from (values
      ('dcec9685-16f8-469a-b9e0-a01d7fe9b8db'::uuid, '2a3dfdb2-060f-493a-aac2-86c07922c626'::uuid, 'Gent <- Ghent'),
      ('fc237c4a-2874-4760-9403-6bada02bf717'::uuid, '8ee7524b-027c-4ec9-9f2d-84a77a430322'::uuid, 'Menin <- Menen'),
      ('dedacc90-7cfa-4b62-892a-4c075b2b53e6'::uuid, 'ef53a019-c7ea-4ab6-84a8-106532c0d2ab'::uuid, 'Colmar <- Kolmar'),
      ('71c243b0-51f8-4d26-acd1-6eb6332dd42d'::uuid, 'ada02851-3953-4b93-b5bb-9689348ce6c7'::uuid, 'Kalamata <- Καλαμάτα'),
      ('137768cd-bdc4-415f-8f64-b69aab5e0c19'::uuid, 'ec7b9aac-2b9b-433d-be8b-149ec06dac95'::uuid, 'Havana <- La Habana'),
      ('10565bba-f03f-482f-a19a-bfc50c358931'::uuid, '453267d7-4c9a-419b-825e-12780b0565c4'::uuid, 'Weiden in der Oberpfalz <- Weiden i.d.OPf.'),
      ('b42c21f2-d407-43df-8c44-4bee09592a91'::uuid, 'c21ef00d-de72-40a6-b740-888043a02dcb'::uuid, 'Immenstadt im Allgäu <- Immenstadt i.Allgäu'),
      ('ae0f774f-e798-4c3e-9c7d-b814e708ab6c'::uuid, 'bad7a90a-2cbd-4db9-8ad1-059bb39b09b5'::uuid, 'Bautzen <- Bautzen - Budyšin'),
      ('11a8d25f-6b50-41d8-87d1-81eb02d3217c'::uuid, 'ddba83d9-ea7d-4400-ab7d-731a2967ecad'::uuid, 'Caldas Novas <- Caldas Novas - GO'),
      ('4fa95c28-c181-4b5a-bf37-5e134027896d'::uuid, '155d3a70-b899-4a9c-8b0b-09ea7aaa159c'::uuid, 'Singen <- Singen (Hohentwiel)')
    ) as t(keep_id, drop_id, label)
  loop
    if not exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null)
       or not exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null)
       -- merge_cities writes city_aliases, whose FK targets the geo spine;
       -- a partial snapshot (CI) can hold the city without its profile.
       or not exists (select 1 from public.geo_city_profiles where place_id = r.keep_id)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.drop_id) then
      v_skipped := v_skipped || ' ' || r.label;
      v_skipped_n := v_skipped_n + 1;
      continue;
    end if;

    select wikidata_qid, wikipedia_title into v_qid, v_title
      from public.cities where id = r.drop_id;

    perform public.merge_cities(r.keep_id, r.drop_id, false);

    update public.cities
       set wikidata_qid = coalesce(wikidata_qid, v_qid),
           wikipedia_title = coalesce(wikipedia_title, v_title)
     where id = r.keep_id;

    v_merged := v_merged + 1;
  end loop;

  -- English name for Ghent (the BE-BRU merged row keeps its own name; the
  -- unique key includes region_code, so BE-VLG does not collide).
  update public.cities
     set name = 'Ghent', name_local = 'Gent', name_local_lang = 'nl'
   where id = 'dcec9685-16f8-469a-b9e0-a01d7fe9b8db' and name = 'Gent';

  raise notice 'city exonym merges: % merged;%', v_merged,
    coalesce(nullif(v_skipped, ''), ' none skipped');

  -- Postcondition: every pair that was not skipped is merged. Skipped pairs
  -- (rows already moved, or a partial snapshot without spine profiles) may
  -- legitimately remain both live.
  select count(*) into v_bad
    from public.cities a join public.cities b on a.id <> b.id
   where a.duplicate_of_id is null and b.duplicate_of_id is null
     and (a.id, b.id) in (
       ('dcec9685-16f8-469a-b9e0-a01d7fe9b8db'::uuid, '2a3dfdb2-060f-493a-aac2-86c07922c626'::uuid),
       ('fc237c4a-2874-4760-9403-6bada02bf717', '8ee7524b-027c-4ec9-9f2d-84a77a430322'),
       ('dedacc90-7cfa-4b62-892a-4c075b2b53e6', 'ef53a019-c7ea-4ab6-84a8-106532c0d2ab'),
       ('71c243b0-51f8-4d26-acd1-6eb6332dd42d', 'ada02851-3953-4b93-b5bb-9689348ce6c7'),
       ('137768cd-bdc4-415f-8f64-b69aab5e0c19', 'ec7b9aac-2b9b-433d-be8b-149ec06dac95'),
       ('10565bba-f03f-482f-a19a-bfc50c358931', '453267d7-4c9a-419b-825e-12780b0565c4'),
       ('b42c21f2-d407-43df-8c44-4bee09592a91', 'c21ef00d-de72-40a6-b740-888043a02dcb'),
       ('ae0f774f-e798-4c3e-9c7d-b814e708ab6c', 'bad7a90a-2cbd-4db9-8ad1-059bb39b09b5'),
       ('11a8d25f-6b50-41d8-87d1-81eb02d3217c', 'ddba83d9-ea7d-4400-ab7d-731a2967ecad'),
       ('4fa95c28-c181-4b5a-bf37-5e134027896d', '155d3a70-b899-4a9c-8b0b-09ea7aaa159c'));
  if v_bad > v_skipped_n then
    raise exception 'city exonym merges: % pairs still both live, % skipped', v_bad, v_skipped_n;
  end if;

  -- Postcondition: no live venue still points at a merged-away row.
  select count(*) into v_bad
    from public.venues v join public.cities c on c.id = v.city_id
   where c.duplicate_of_id is not null and v.duplicate_of_id is null
     and c.id in ('2a3dfdb2-060f-493a-aac2-86c07922c626','8ee7524b-027c-4ec9-9f2d-84a77a430322',
                  'ef53a019-c7ea-4ab6-84a8-106532c0d2ab','ada02851-3953-4b93-b5bb-9689348ce6c7',
                  'ec7b9aac-2b9b-433d-be8b-149ec06dac95','453267d7-4c9a-419b-825e-12780b0565c4',
                  'c21ef00d-de72-40a6-b740-888043a02dcb','bad7a90a-2cbd-4db9-8ad1-059bb39b09b5',
                  'ddba83d9-ea7d-4400-ab7d-731a2967ecad','155d3a70-b899-4a9c-8b0b-09ea7aaa159c');
  if v_bad <> 0 then
    raise exception 'city exonym merges: % venues left on merged rows', v_bad;
  end if;
end $$;
