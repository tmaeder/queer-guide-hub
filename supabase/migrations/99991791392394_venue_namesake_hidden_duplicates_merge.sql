-- Merge live venue duplicates that a far same-name city link had hidden.
--
-- 99991791358024 detached 1,343 venues from a namesake city hundreds of km
-- away (Blur, 710 Pacific Street, Houston, had been filed under a different
-- "Houston"). While misfiled, each sat in a different city from its own twin,
-- so neither the dedup sweep (which blocks on city) nor any city audit could
-- pair them — the Heldenbar/Helden shape of 99991791318782, at scale.
--
-- Found by pairing every repaired venue with a live venue within 300 m whose
-- name is the same or similar (trigram > 0.5), then READ BY HAND. 33 drops
-- into 30 keeps survive the read; each pair agrees on street address (or the
-- keep's address is a junk scrape value) and on venue type.
--
-- REFUSED after reading, kept as separate rows:
--   UNI Botanical Center Room 016 / Room 018  — two different restrooms
--   Kanal / Am Kanal (Halle), Exit 5 / Exit 6 Rest Area (Plymouth) — distinct cruising spots
--   B4 Out / Out, Foresters Inn / New Foresters — different addresses
--   Nunca Digono (bar) / Nuncadigono (sauna), Aquarius Guesthouse / Aquarius Sauna — different addresses
--   Dillon's Russian Steam Bath (sauna, public) / Dillon Russian Spa (cruising, gated)
--     — merging would hide a public sauna behind the cruising gate
--   The Dunes Resort (hotel) / Dunes Resort (bar) — type disagrees; a human call
--
-- KEEP is the row already filed under the correct city, except where that row
-- has no city or no usable address, in which case the better-documented row
-- keeps and the missing fields are filled from the drop. The merge core copies
-- no fields, so city_id, address, website, phone and a placeholder category
-- are filled-if-empty on the keep BEFORE the merge.
--
-- Soft on preconditions (a moved or already-merged row is skipped with a
-- NOTICE), hard on the defect. Reversible: each merge writes a schema:1
-- venue_merge_audit row (unmerge_venues).

select set_config('app.actor', 'migration:99991791392394_venue_namesake_hidden_duplicates_merge', true);

create temp table _vnd_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _vnd_pairs (keep_id, drop_id) values
  ('777c9947-c09c-4361-95b4-35425afb2d60', '9656e077-f141-4f64-a8dd-54f55435f068'), -- Blur Bar <- Blur (Houston)
  ('9ff9dc78-2526-4310-b418-192091b658b6', '1db08abe-8ffc-411c-8327-931548cd9591'), -- Crocker Bar <- Crocker (Houston)
  ('559d4333-6eea-477d-a382-8abcee6fed10', 'd69bbde4-6e13-4737-a7ff-fad6a12e5f4a'), -- Tally ho Tavern <- Tally Ho (Lancaster)
  ('457fcbfa-3c16-4bbc-9732-3c3def6d9d23', '14e6ec12-9fc4-407c-bd49-fac02302be18'), -- Le Cox <- Cox (Paris)
  ('457fcbfa-3c16-4bbc-9732-3c3def6d9d23', '4b8323de-0bbf-43d5-b21a-daafd17d5645'), -- Le Cox <- Cox 2 (Paris)
  ('1f871172-304c-4c62-96ca-4a204bbfdf41', 'ab3f0cee-a920-4e7f-b891-1526e7f141e3'), -- The Vaults <- The Queen's Vaults (Exeter)
  ('6031f11e-e10b-4984-8ed8-7b42cccc11e9', 'b3737d62-74e4-4e6b-86d6-001f549355c8'), -- Organic Men's Club <- Organic Madrid Club
  ('a6f2bf4d-fb5b-4d29-a0f8-184acb628799', 'c7ab1e38-2117-4f50-b9e9-c9d3e8c76e35'), -- Tremont Lounge <- Tremont (Columbus)
  ('dbe5c253-3819-4938-a92a-746c3195164b', 'ca97fe01-c560-4e79-92ab-c35da47c0f77'), -- Good Friends Bar <- Good Friends (New Orleans)
  ('7ce3cdba-a962-4859-b240-751b386c15b9', '61c06773-2bce-470a-b3ea-11357ec6bbcd'), -- The Yard <- The Yard Bar (Newcastle)
  ('af11175a-a174-42c0-81ca-0b0db853c24c', '2b58b764-70b5-4f70-aa21-123426b45985'), -- Manifest 4U Inc <- Manifest (Atlanta)
  ('8ebff1d9-5b3c-404b-a726-d75b0c6cb845', '657422d2-f483-4f6a-b5f3-64d2686c5aca'), -- Lucky Dog Tavern <- The Lucky Dog Tavern (Boise)
  ('d7b1a705-5247-4658-a09e-78e4e5fab5f8', 'cd0fc50c-05b0-4923-9349-6a3a4c060ba9'), -- Switch Bar <- Switch (Newcastle)
  ('d7b1a705-5247-4658-a09e-78e4e5fab5f8', '61f7fa24-db70-4fce-b06b-b1c77bc08471'), -- Switch Bar <- Switch Bar (Newcastle)
  ('d278260a-8633-4244-96e8-d2c7596acfdb', '18b5926f-e847-44f1-b984-eda7581b7e20'), -- Le George-Sand <- George Sand club (Poitiers)
  ('5d35c9ce-7c2d-446b-b19c-51ed049233df', 'c3c50a45-8b55-45fd-84e5-7060185c23b8'), -- The Lookout <- Lookout (San Francisco)
  ('98d247fc-2435-49b0-89b6-161ee16cd537', '324e9683-3c89-424a-9573-69e844489fd1'), -- Georgies <- Georgie's (Asbury Park)
  ('9f49fb63-6bd4-4e2a-835e-127e4b048912', '5b93790a-a6ae-484a-be32-a05bf19bb6cd'), -- Town House Cocktail Lounge <- Townhouse (Vallejo)
  ('5a5d2636-9cb5-4f77-89ff-b01ab01a174a', '88a7b091-9404-4984-b55c-edca46d8e21e'), -- Turkey Hill Mini Mart <- Turkey Hill (Allentown)
  ('0bd7ac0e-580e-447d-bf8d-8fb1feead7c0', '5e56115e-9374-46c4-9cca-1b9301ff4431'), -- The Raven <- Raven (Anchorage)
  ('b4fc135e-e24f-4478-bba8-c5110e368100', '818f6bf7-fb51-418a-b6ba-e007fb7d409f'), -- Industry Bar <- Industry (New York)
  ('cd68aa15-2cfa-40b3-b855-37ff14f4799a', '28f4bb6c-8902-4598-a8ec-8fca9ea337bb'), -- The Corner Pocket <- Corner Pocket (New Orleans)
  ('71560e65-aa44-4bb8-9e5a-b1b7ed71b1e2', '26347d26-ae14-47ce-ad35-53f1188dcfc4'), -- Purgatory <- Club Purgatory (Provincetown)
  ('cdb0838e-093d-4703-ab91-966b335396cd', 'a17c972f-3ade-404e-bea2-12a804fb2632'), -- Union Street Bar <- Union Street (Belfast)
  ('27e11cde-a51e-434d-9bfa-66acd829872f', 'ef24d76e-129e-4d7f-96d1-69b037657b2c'), -- Albatross Bar <- Albatross (Astoria)
  ('6521b01e-53ca-4889-9832-371e308c2d41', '7f475737-ab28-4984-8255-63f523722674'), -- Pub Badulake <- Badulake (Bilbao)
  ('b3f20f61-4448-47db-b27f-356fa1b06a0f', '2ff54353-51b7-463b-ae85-8201fbdd3128'), -- Trovador <- El Trovador (Santander)
  ('7bb5753a-934e-47ba-b3b0-1bcb4f8a0fe7', '8a721c35-b44e-4a94-9e2e-e5fea193fc04'), -- Trou Duck <- Le Trou Duck (Bordeaux)
  ('96081ef1-8fc0-4b4e-991c-6bf825f273e0', '177e4d2f-409c-4b8f-b0a1-16b8a84227bd'), -- Esclave bar <- L'Esclave (Avignon)
  ('b3761aac-326a-4e58-a1b6-4d5ae7fd2f57', '8fe3a901-d44b-40f1-805b-6a57e1e89880'), -- The New Foresters LGBT <- New Foresters (Nottingham)
  ('b3761aac-326a-4e58-a1b6-4d5ae7fd2f57', 'ca6527a6-7e31-4654-a47d-d8c541c982d5'), -- The New Foresters LGBT <- New Forresters (Nottingham)
  ('c4d9c7b6-0425-4766-8dca-6cf152b97574', '1769ba44-62c9-48ac-bc56-ed8d64c8a651'), -- Friends on Ponce <- Friends on Ponce (Atlanta)
  ('f4daeb05-8787-4ab6-b613-23df24518364', '82f51446-ac83-4fb4-9faa-f1941bf27ed5'); -- Le Couloir <- Le Couloir (Nice)

do $merge$
declare
  p record;
  k public.venues%rowtype;
  d public.venues%rowtype;
  v_merged int := 0;
  v_skipped int := 0;
begin
  for p in select keep_id, drop_id from _vnd_pairs loop
    select * into k from public.venues where id = p.keep_id;
    select * into d from public.venues where id = p.drop_id;

    if k.id is null or d.id is null then
      raise notice 'skip %<-%: row missing', p.keep_id, p.drop_id;
      v_skipped := v_skipped + 1; continue;
    end if;
    if d.duplicate_of_id is not null then
      raise notice 'skip %<-%: drop already merged into %', k.name, d.name, d.duplicate_of_id;
      v_skipped := v_skipped + 1; continue;
    end if;
    if k.duplicate_of_id is not null or k.closed_at is not null or d.closed_at is not null then
      raise notice 'skip %<-%: keep merged or a side closed', k.name, d.name;
      v_skipped := v_skipped + 1; continue;
    end if;
    -- The pairing was read at <= 300 m; a moved row is no longer the pair that was read.
    if k.latitude is null or d.latitude is null
       or public.haversine_m(k.latitude, k.longitude, d.latitude, d.longitude) > 300 then
      raise notice 'skip %<-%: coordinates moved apart', k.name, d.name;
      v_skipped := v_skipped + 1; continue;
    end if;

    -- Fill-if-empty: the merge core copies no fields.
    update public.venues v
       set city_id  = coalesce(v.city_id, d.city_id),
           address  = case when nullif(btrim(v.address), '') is null or btrim(v.address) = 'Bars'
                           then coalesce(nullif(btrim(d.address), ''), v.address) else v.address end,
           website  = case when nullif(btrim(v.website), '') is null then nullif(btrim(d.website), '') else v.website end,
           phone    = case when nullif(btrim(v.phone), '') is null then nullif(btrim(d.phone), '') else v.phone end,
           category = case when coalesce(v.category, 'other') = 'other' and coalesce(d.category, 'other') <> 'other'
                           then d.category else v.category end,
           updated_at = now()
     where v.id = k.id;

    perform public._venue_merge_core(k.id, d.id, null);
    v_merged := v_merged + 1;
  end loop;

  raise notice 'namesake hidden duplicates: merged %, skipped %', v_merged, v_skipped;
end
$merge$;

do $verify$
declare
  v_bad int;
begin
  -- P1: the defect is gone — no pair is still live side by side.
  select count(*) into v_bad
    from _vnd_pairs p
    join public.venues k on k.id = p.keep_id
    join public.venues d on d.id = p.drop_id
   where k.duplicate_of_id is null and d.duplicate_of_id is null
     and k.closed_at is null and d.closed_at is null
     and public.haversine_m(k.latitude, k.longitude, d.latitude, d.longitude) <= 300;
  if v_bad <> 0 then
    raise exception 'P1 failed: % pair(s) still live side by side', v_bad;
  end if;

  -- P2: every pair merged into its keep has a reversible audit row.
  select count(*) into v_bad
    from _vnd_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id = p.keep_id
     and not exists (
       select 1 from public.venue_merge_audit a
        where a.keep_id = p.keep_id and a.drop_id = p.drop_id
          and a.undone_at is null
          and a.details ->> 'schema' = '1');
  if v_bad <> 0 then
    raise exception 'P2 failed: % merge(s) without a reversible audit row', v_bad;
  end if;

  -- P3: no event still points at a merged drop.
  select count(*) into v_bad
    from _vnd_pairs p
    join public.venues d on d.id = p.drop_id
    join public.events e on e.venue_id = d.id
   where d.duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception 'P3 failed: % event(s) still on a merged drop', v_bad;
  end if;

  -- P4: safety — no keep in a high-risk location is publicly visible.
  select count(*) into v_bad
    from (select distinct keep_id from _vnd_pairs) p
    join public.venues k on k.id = p.keep_id
   where public.location_is_high_risk(k.country_id, k.city_id)
     and not k.safety_gated;
  if v_bad <> 0 then
    raise exception 'P4 failed: % keep(s) in a high-risk location are not safety_gated', v_bad;
  end if;
end
$verify$;
