-- Official-form city names outside the English-speaking countries (follow-up
-- to 99991795170909). Three groups, each read row by row:
--
--   1. Same place stored twice -> merge into the plain town row, which takes
--      the QID when it has none: Grad Hvar / Hvar, Grad Rab / Rab (Croatia),
--      and 7 Swedish "X kommun" rows beside their town (Enköping, Hässleholm,
--      Linköping, Ljungby, Ronneby, Västerås, Växjö).
--      A second "Grad Hvar" filed under France (lng exactly 0) holds 6 venues
--      with no coordinates that are not Hvar venues (Gayschorre, Taspride,
--      Álava, ...): they are detached and flagged, and the row archived.
--   2. Regions filed as cities -> venues move to the town their address
--      names (Tuggeranong -> Canberra, Unorganized Kenora District ->
--      Kenora), missing UK towns are created at the mean of their venues,
--      and the rows are archived (reversible): 5 UK districts, Tuggeranong,
--      Unorganized Kenora District, Parry Sound District, Orange County,
--      Prince George's County.
--   3. A town stored under its official name with no plain twin -> renamed
--      to the plain name; trg_zz_city_alias_sync keeps the old name as an
--      alias, slugs are unchanged. Swedish genitive "s" is dropped
--      (Ystads kommun -> Ystad); Gotlands kommun -> Gotland (the island).
--      Also Estonian "X vald" / "X linn" and Croatian "Općina X".
do $$
declare
  r record; v_qid text; v_title text; v_new int := 0; v_moved int; v_detached int; v_res jsonb;
begin
  perform set_config('app.actor', 'migration:city_official_forms_other_countries', true);

  -- 1. merges ---------------------------------------------------------------
  for r in
    select * from (values
      ('ef2d1562-6334-4177-b597-d0283f4eea52'::uuid, '0529a1fa-65a6-4d24-9703-c161703238ab'::uuid), -- Hvar <- Grad Hvar
      ('a1de8222-96b2-4d19-94c0-625ae1ede62a'::uuid, '1810e709-5d03-419c-bd84-971c5e994668'::uuid), -- Rab <- Grad Rab
      ('cf52340f-3843-4555-8e09-b31925ac1753'::uuid, 'fea84842-4958-4e16-8d36-68c2e06fd541'::uuid), -- Enköping
      ('0708bc3e-70b4-4f78-8656-4e7255f60c50'::uuid, '8652edb5-5b14-4fd1-861a-23ea8cdec11e'::uuid), -- Hässleholm
      ('6e548f3c-0c48-4bd5-a30e-e8abee5f41d9'::uuid, '57a0df86-328c-4adb-bde4-ba3dda1c0b60'::uuid), -- Linköping
      ('ca4c545a-3a90-43dc-b612-31ff1d52d244'::uuid, '511c8aad-031d-4520-9ed9-702edac39aaf'::uuid), -- Ljungby
      ('4e37d2d0-eb27-4b2e-9082-3795b421020f'::uuid, 'cbddafd8-53f3-4f71-993b-80a71aeeb9b5'::uuid), -- Ronneby
      ('f16f4593-a74a-4157-96d4-40b57ad4b559'::uuid, '5b8464f2-aca3-417c-a09b-630af6e470d6'::uuid), -- Västerås
      ('cbe84f26-2fd3-40dc-80fe-8de398b5dcfe'::uuid, '3d735fd1-98f7-4f5e-9991-fbeb64ef2860'::uuid)  -- Växjö
    ) t(keep_id, drop_id)
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
    update public.cities
       set wikidata_qid = coalesce(wikidata_qid, v_qid),
           wikipedia_title = coalesce(wikipedia_title, v_title)
     where id = r.keep_id;
  end loop;

  -- 2. regions filed as cities ------------------------------------------------
  create temp table _reg on commit drop as
    select m.row_id, m.default_target, c.country_id, c.region_name
      from (values
        ('583fc457-b217-4992-9aff-bf8ec5b527f8'::uuid, null::text),  -- Grad Hvar [FR]: detach
        ('90b53526-8a93-4c31-a2b7-bcb270ccafed'::uuid, 'Canberra'),  -- Tuggeranong Administrative District
        ('cb0e5b1d-7e72-4931-bdac-7dd791386747'::uuid, 'Kenora'),    -- Unorganized Kenora District
        ('98eb45c1-cd50-4c04-9d76-fdcd7aae4ecd'::uuid, null),        -- Parry Sound District (0 venues)
        ('a5e1734a-1732-4668-90e7-042052358964'::uuid, null),        -- Breckland District
        ('ffa7d7e9-d0ba-47c4-8c4b-f74d43dc471a'::uuid, null),        -- Causeway Coast and Glens District
        ('fd4ab175-8b0c-4e02-baf9-3a36333bb435'::uuid, null),        -- Cherwell District
        ('f0c6aaf1-7a60-413d-a87c-76238c75bf38'::uuid, null),        -- Fenland District
        ('415b3fe2-1fdc-4e29-88a8-466b9735a59a'::uuid, 'Coleraine'), -- Mid-Ulster District
        ('ddbc6209-70c9-43a1-96d5-a174f7daef90'::uuid, null),        -- Orange County (0 venues)
        ('9e35e643-e6e0-4a47-880f-c3f451296f98'::uuid, null)         -- Prince George's County (0 venues)
      ) m(row_id, default_target)
      join public.cities c on c.id = m.row_id and c.duplicate_of_id is null
     where exists (select 1 from public.geo_places g where g.id = c.id)
       and exists (select 1 from public.geo_places g where g.id = c.country_id);

  create temp table _rv on commit drop as
    select v.id venue_id, g.row_id, g.country_id, g.region_name,
           case when g.row_id = '583fc457-b217-4992-9aff-bf8ec5b527f8' then null
                else coalesce(nullif(btrim(regexp_replace(coalesce(v.address, ''), '^.*,', '')), ''), g.default_target)
           end target,
           v.latitude::numeric lat, v.longitude::numeric lng
      from public.venues v join _reg g on g.row_id = v.city_id
     where v.duplicate_of_id is null;

  for r in
    select rv.target, rv.country_id, min(rv.region_name) region_name, avg(rv.lat) lat, avg(rv.lng) lng
      from _rv rv
     where rv.target in ('Dereham', 'Limavady', 'Bicester', 'Chatteris', 'Wisbech')
       and rv.lat is not null
       and not exists (select 1 from public.cities c
                        where c.duplicate_of_id is null and c.country_id = rv.country_id
                          and c.canonical_key = public.city_canonical_key(rv.target))
     group by rv.target, rv.country_id
  loop
    insert into public.cities (name, country_id, region_name, latitude, longitude, data_source,
                               needs_attention, seo_indexable, field_provenance,
                               last_synced_at, created_at, updated_at)
    values (r.target, r.country_id, r.region_name, round(r.lat, 6), round(r.lng, 6),
            'migration:city_official_forms_other_countries', true, false,
            jsonb_build_object('city_resolve', jsonb_build_object(
              'action', 'created', 'source', 'migration:city_official_forms_other_countries',
              'reason', 'replaces a district row; coordinates are the mean of its venues', 'at', now())),
            now(), now(), now());
    v_new := v_new + 1;
  end loop;

  -- Target by name in the same country; a venue without coordinates takes
  -- the nearest same-named city to its row (one candidate in practice).
  update public.venues v set city_id = t.cid
    from (select rv.venue_id,
                 (select c.id from public.cities c join public.city_aliases a on a.city_id = c.id
                   where c.duplicate_of_id is null and c.country_id = rv.country_id
                     and c.id not in (select row_id from _reg)
                     and a.alias_key = public.city_canonical_key(rv.target)
                     and (rv.lat is null or c.latitude is null
                          or public.haversine_m(rv.lat, rv.lng, c.latitude, c.longitude) < 60000)
                   order by c.wikidata_qid is null, c.created_at limit 1) cid
            from _rv rv where rv.target is not null) t
   where v.id = t.venue_id and t.cid is not null;
  get diagnostics v_moved = row_count;

  update public.venues v
     set city_id = null, needs_attention = true,
         enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object('city_detached',
           jsonb_build_object('reason', 'region_city_row_archived', 'from_city_id', v.city_id,
                              'by', 'migration:city_official_forms_other_countries'))
   where v.id in (select venue_id from _rv) and v.city_id in (select row_id from _reg);
  get diagnostics v_detached = row_count;

  for r in select g.row_id from _reg g
            where not exists (select 1 from public.events e where e.city_id = g.row_id) loop
    v_res := public.archive_city_as_nonplace(r.row_id, 'region_not_city',
                                             '{"by":"migration:city_official_forms_other_countries"}');
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise exception 'region archive failed: %', v_res;
    end if;
  end loop;

  -- 3. renames ----------------------------------------------------------------
  for r in
    select * from (values
      ('f5a219e1-578f-4158-a2a6-896b76e6a8a0'::uuid, 'Tunuyán'),
      ('af33ce76-27ac-45a5-af1b-bdb3b5d67a3b'::uuid, 'L''Île-Perrot'),
      ('4ef517bc-4950-496a-9540-9540e9578bd3'::uuid, 'Tocancipá'),
      ('2129d474-0840-4922-b454-bb2df00fc735'::uuid, 'Hoyerswerda'),
      ('5e5db289-caa2-4277-99d8-0718494ca3f3'::uuid, 'Vordingborg'),
      ('ac46862c-df70-4ad4-817b-13cd89f7e850'::uuid, 'Varaždin'),
      ('950e0f83-a84a-4cd5-aad3-37c6cf7cf294'::uuid, 'Huitzuco'),
      ('0692cb65-37d5-44ab-8fcf-90b7a7084d8b'::uuid, 'Rafael Lara Grajales'),
      ('40ed3f70-bb58-4c00-b990-c1a0aee97887'::uuid, 'Wierzchosławice'),
      ('9b7f4460-773b-48da-9775-67f01fe1a28b'::uuid, 'Paraguarí'),
      ('d6ac8009-da18-425b-9521-5512b5e02a4d'::uuid, 'Åmål'),
      ('318b4822-0aff-4da4-8d1d-f8419b4493af'::uuid, 'Borgholm'),
      ('b0aaf779-8aab-4899-9330-0c360cb28a9d'::uuid, 'Borlänge'),
      ('b5c0811a-dcf3-4aee-8aa9-5e526f2eb3e9'::uuid, 'Gotland'),
      ('1f28c7a8-84fb-4a9c-9e95-a5aa6995c736'::uuid, 'Kävlinge'),
      ('46f7e9c3-ad53-4773-926b-0c9566066b5d'::uuid, 'Kristinehamn'),
      ('d7c2e6f5-8c9a-41d4-874e-43214ef7e2eb'::uuid, 'Nordingrå'),
      ('a09d23ae-b6b2-4e0a-b17c-756e932c0a7a'::uuid, 'Ockelbo'),
      ('7cad38a6-c416-432b-8611-230832f247b3'::uuid, 'Oskarshamn'),
      ('f9d0773c-28d7-40b9-9a9c-a8926d227e3e'::uuid, 'Skara'),
      ('188ff138-589c-47c1-8286-91b6db9bd09e'::uuid, 'Strömstad'),
      ('bdf2ebad-125f-417b-b96e-5bd28e5e14db'::uuid, 'Tanum'),
      ('739e634e-3127-46e9-996c-fbc64d72f9ef'::uuid, 'Timrå'),
      ('a72cf2c6-8cd8-4130-b12e-2578fd0c35bc'::uuid, 'Vaggeryd'),
      ('ad44d3ba-3cd9-4272-9d94-ed8c9bd528a5'::uuid, 'Vallentuna'),
      ('89e76210-0d42-4484-a90b-42dec271ab68'::uuid, 'Ystad'),
      -- Estonian "vald" (rural municipality) / "linn" (town), Croatian "Općina".
      -- Tartu vald is NOT renamed: it is the rural municipality around the
      -- city of Tartu, which has its own row.
      ('4fd0e2bf-dec1-4489-a91c-ab16f77ef93f'::uuid, 'Haapsalu'),
      ('6c38b129-b79d-4908-a19a-d719ca2cb517'::uuid, 'Valga'),
      ('043462de-decb-4fdf-9a6c-27424e84a17d'::uuid, 'Alutaguse'),
      ('b122460d-689e-4503-9e51-fad24f1a736b'::uuid, 'Rae'),
      ('8807bf14-485a-4ab6-950a-7563c6e54677'::uuid, 'Medulin')
    ) t(id, new_name)
  loop
    update public.cities set name = r.new_name
     where id = r.id and duplicate_of_id is null and name <> r.new_name
       -- partial CI snapshot: the rename re-syncs the geo spine row
       and exists (select 1 from public.geo_places g where g.id = cities.id)
       and exists (select 1 from public.geo_places g where g.id = cities.country_id)
       and not exists (select 1 from public.cities b
                        where b.id <> r.id and b.country_id = cities.country_id
                          and lower(b.name) = lower(r.new_name)
                          and coalesce(b.region_code, '') = coalesce(cities.region_code, ''));
  end loop;

  raise notice 'official forms: % towns created, % venues moved, % detached', v_new, v_moved, v_detached;

  if exists (select 1 from public.venues v join _reg g on g.row_id = v.city_id where v.duplicate_of_id is null) then
    raise exception 'venues still on an archived region row';
  end if;
end $$;
