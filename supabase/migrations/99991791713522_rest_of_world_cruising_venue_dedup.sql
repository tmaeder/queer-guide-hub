-- Cruising-venue dedup for the rest of the world (2026-10-11):
-- CA, PL, AU, CZ, BG, SK, NO, TT, GR, SE, RO, DK, CY, NZ, HU, SV and others.
--
-- Final pass after DE (99991791632592), the multi-source countries
-- (99991791634999), BR (99991791636544), ES (99991791636873), Spanish-
-- speaking Latin America (99991791637198) and PT (99991791711597). Mostly
-- gays-cruising repeat submissions plus gayout/spartacus copies of the same
-- park or club ("Stensparken" = "Stensparken (Cruising)", "Lateshift" =
-- "Lateshift Men's Cruise Club").
--
-- Method: every pair of live category='cruising' venues in the same country
-- within 1.5 km whose names agree after a multilingual normalisation
-- (park/parc/plage/beach/toilet/parking/station/forest terms, accents and
-- trailing numbers stripped; non-Latin letters kept): about 110 candidate
-- pairs over ~4,060 venues, all read by hand. About 35 are different places
-- (a park vs the pool next to it, two halves of a river, different malls,
-- different saunas in Asakusa, generic names like "Walking Track" or
-- "Sentier" 1 km apart) and are NOT touched. Numbered and named sub-spots of
-- one place (Limanakia A/B, Parkovisko pod furcou 1/2/3, Falasarna near/far)
-- are merged, per the site owner. Tøyen park and the Tøyenbadet pool next to
-- it are asserted to stay separate (P4).
--
-- 74 drops in 70 clusters. Keeper = multi-source or gayout row, otherwise
-- the place name; four keepers drop their sub-spot suffix.
-- _venue_merge_core copies no fields, so keepers are enriched fill-if-empty
-- first; every merge is schema:1 and reversible with unmerge_venues().
--
-- Soft on preconditions: both sides resolve to their live terminal, so a pair
-- another session already merged (either direction) is a no-op. Hard on
-- postconditions: end state only.



set local statement_timeout = '300s';

create temp table _rw_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _rw_pairs values
  -- AU Sydney | Little Congwong Beach <- Little beach
  ('9193247b-906d-44f4-ba47-c595485427a9', '7032ea85-4912-449b-9feb-28848185c9a3'),
  -- AU Ulverstone | Buttons Beach Road <- Buttons Beach Road-Ulverstone
  ('92d53e94-bdce-4c0f-baed-c284b49f7a82', '16cfe780-6b4f-4fe5-adda-c157677ebcac'),
  -- AU Woodford | Bulls Camp Rest Area <- Bulls Camp Reserve
  ('09fcfffe-6538-4006-9e0e-7e78096ab097', 'e7207dcb-5ff3-49e4-843f-5c5fa4d218dd'),
  -- BG Burgas | Primorsko Nude Beach <- Primorsko
  ('79b190c4-8322-4ad2-a10f-82ba06ea4011', '26efc5f3-e634-4de6-940e-7174f882f6fe'),
  -- BG Sofia | Zapaden West Park <- Zapaden Park
  ('d8e3033b-0504-4e4e-8ff3-5cb59016b232', 'a1d2e61a-0d1c-492b-aa3e-a71e5f3356e3'),
  -- BG Sofia | Zapaden West Park <- Zapaden (West) Park on the train tracks
  ('d8e3033b-0504-4e4e-8ff3-5cb59016b232', '667224ba-5819-464b-962c-7597f297ea39'),
  -- CA Airdrie | East Lake Park <- East Lake Lot
  ('a9486575-20e8-4f1f-92eb-7ebdc7d6e66d', 'f5229b19-bbe8-471b-a68c-ac5b4c1f55d8'),
  -- CA Airdrie | East Lake Park <- East lake Treed Area
  ('a9486575-20e8-4f1f-92eb-7ebdc7d6e66d', '58aae563-0795-487f-aeb0-2eef0f842c71'),
  -- CA Barrys Bay | Madawaska Picnic area <- Madawaska Picnic area
  ('a723de5a-4be3-4d15-ab97-38eef7fc4692', 'd29b4e8e-7731-4750-9c79-6be973a09642'),
  -- CA County of Brant | Lions Park Laurel Street <- Lions park
  ('ed743def-94ba-49fb-af24-476915812d6f', 'b557dd57-a767-4179-bdea-b931f0f0b74c'),
  -- CA Daveluyville | Halte routière de Sainte-Anne-du-Sault <- Halte routière
  ('581be768-4673-4c38-aacb-9f1f77d3b96c', '4bf931ca-355c-4925-a1af-47b141edd4d1'),
  -- CA Deux-Montagnes | Barrage Laval-Deux Montagne <- Barrage
  ('51769c45-d7c9-4688-86e3-55ddc2f48315', '22c55524-8c83-4412-9f76-c9677e15faa9'),
  -- CA Granby | Park Terry Fox <- Boisé en face du parc Terry Fox
  ('68e6ceac-5eb7-4ff2-988d-f6e73c8cfab4', '6a4004c3-6a99-4734-9e35-68ad75986ee1'),
  -- CA Joliette | Galeries Joliette <- Toilettes Galeries Joliette près de la librairie
  ('9e4de504-ca7a-4609-b820-f9c6ece1abe3', 'a1af87bf-d248-4ab2-b13d-b3153318128c'),
  -- CA Laval | Plage des Quatre Vents <- Berge aux Quatre-Vents
  ('4995c0b1-eb1a-4629-a452-5185bce4a659', 'f1b38721-1bb8-42ed-94ba-827d3a1b15ca'),
  -- CA Laval | Lisbonne - Ile Locas <- Lisbonne Blvd
  ('fd10b658-b0d0-447f-95ab-632bc228f912', '7f890405-66f4-4d95-90d2-9adb7591b00a'),
  -- CA Lévis | Vieux Moulin <- Vieux Moulin 2
  ('6141aabf-ae83-49b0-bf61-f7872e7f0536', 'f07b8452-0199-4506-8ea9-1213718c59e2'),
  -- CA Longueuil | Boisé du Tremblay <- Parc a chien Boisé du Tremblay
  ('1b24f853-c98e-4fa6-935d-d25760a0310e', 'ad04f900-1e0f-44d3-aa86-0872b8b08335'),
  -- CA Montreal | Parc Frédéric-Back <- Park Fredrick Back
  ('8eecf33f-4760-42a0-8187-f2e24aff7f9e', '4e020318-fce4-40f5-bc87-35b300e41e6f'),
  -- CA Montreal | Bord de l'Eau <- Sur le bord de l'eau
  ('fa5bf3a7-540f-48ff-b342-05aebc3f6b1f', '08d45aed-0d55-4cb8-88f8-5df619f84acb'),
  -- CA Newmarket | Rogers Reservoir <- Rogers Reservoir Trail Parking Lot
  ('0471ff9e-3475-4725-a3b8-24f2580550fc', '5577d4ef-597e-4716-a8c7-216161981b0d'),
  -- CA Repentigny | Galeries Rive Nord <- Parking des Galeries Rive-Nord
  ('563881a9-d47d-4583-b480-3bd9ca81a074', 'a27c9f44-3835-40f7-9337-dbe9812c2313'),
  -- CA Rimouski | Pointe au Père <- Pointe au Père Rimouski
  ('a75771a6-7f68-4031-b8b8-d865e6f761fd', '9618e8a7-1cbf-4543-9674-ba5fc6093064'),
  -- CA Rimouski | Pointe au Père <- Point au Pere
  ('a75771a6-7f68-4031-b8b8-d865e6f761fd', '12440ed4-cfa5-4a31-bb44-e4da12abe8c0'),
  -- CA Rimouski | Park Beauséjour <- Park Beauséjour-Rimouski-New Brunswick
  ('5a87bf6f-e6ec-4ce0-83c2-23d55c571946', '56e61441-497e-4e18-9d90-f40d73465ff7'),
  -- CA Saguenay | Place des Copin <- Sentier au parc du cartier place des copin
  ('488aab4c-c677-4219-b9bd-87800b477ee5', 'be9539a2-f203-48d7-93d3-04dffecd9462'),
  -- CA Saint-Jérôme | Boisée rivière du nord-Saint-Jérôme <- Bord de la rivière Du nord
  ('8e490f1b-eaa4-4387-bd13-5a02a05b9d60', '4dbd7e20-e078-42c4-9d09-61b414d9c076'),
  -- CA Terrebonne | Cinema Triomphe <- Parking Cinema Triomphe
  ('2913bab9-090f-454e-a211-b0ff5c077a37', '58c00a66-4f21-49bd-a08a-8c803c35ae29'),
  -- CY Geroskipou | Rico's Beach <- Far end of road RICOS beach
  ('1f29d4f4-03a9-4fcf-8974-81674c0a1fd4', '04425906-44fd-4d6b-beeb-c97535e45768'),
  -- CZ Brno | Hlavní Nádraží <- WC dole u Rossmana Hlavní Nádraží
  ('41a94180-4b3c-4288-95d1-0b0c6c4992aa', 'cbe4ffba-fb58-45c2-893d-c48513e1bd87'),
  -- CZ Brno | Park Lužánky <- Lužánky Za Bazénem
  ('e214745a-97f4-4948-965c-617b478b90ce', 'f8aac1dc-e95a-48b4-ba59-9ca18c7a5c1d'),
  -- CZ Dobříň | Pískovna Dobřín <- Dobříň
  ('35a1dab7-66f8-417f-928c-82d25839b62a', '0a734402-6a11-41fb-ab7d-f81204101a0a'),
  -- CZ Prague | Vítkov <- Vitkov Bunkers
  ('ce9e81ee-3875-413c-b7cd-a13d116b75d9', '1555d493-db6f-42f3-8698-c13cdc9d0cc2'),
  -- CZ Praha | Toilets at the nudist beach in Hostivar <- Parking Hostivař
  ('bb8566ee-5e68-40be-a29f-c5a4ff97e36f', 'b7a469ec-2a5d-4f6a-a926-d9b348616827'),
  -- CZ Vojkovice | Vojkovice - Lesík u Elektrárny <- Vojkovice
  ('a1311dca-db24-4675-b675-3021b36171fa', '0ed2398b-9558-423c-976b-b2d6f280de50'),
  -- DK Copenhagen | H.C. Ørsteds Park (Ørstedsparken) <- Ørstedsparken
  ('9b325a1e-49cc-4de7-91ea-c7344f80ab7f', 'c9de6125-dddf-480b-b989-9bb46c73a7d1'),
  -- GR Alexandroúpolis | Kokkina Vrachia <- Kokkina Vrachia (κοκκινα βράχια)
  ('51ec1767-d787-4be9-a5ee-9234f399afb4', '061f0594-84d9-4e62-8da4-5bc7c76bf9a4'),
  -- GR Athens | Limanakia <- Limanakia B
  ('6b927089-f561-4db9-99d8-be756564c2fa', 'f76c1e55-6efb-43b6-9a18-5d9221f041eb'),
  -- GR Corfu | Almyros Beach and Dunes <- Almyros Beach 2
  ('fec6a256-99a7-4eaf-ba6a-cfc85654770a', 'e004c827-1c82-425c-b9e6-2170d6938158'),
  -- GR Kastélli | Falasarna <- Falasarna Far
  ('a7431cf1-adba-450c-8e55-cfa2a55d2fc6', 'e0482bc0-c874-4a00-b56f-1306e639b290'),
  -- GR Mykonos | Paraportiani <- Paraportiani Rocks (Old Harbour Cruising)
  ('c468b90c-17db-4aee-88a4-05dd20b675ad', 'd6a60655-9e51-4b9f-8c01-9447777ac20e'),
  -- HN Tegucigalpa | Aldea Monte Redondo <- La pista, aldea Monte Redondo
  ('76d7560b-b9c2-4122-888e-70e0c2b97332', '33a00b67-408b-47ca-8fc9-d37b901980db'),
  -- HU Budapest | Arena Mall <- Arena Mall Glory Hole
  ('c6beb08f-1fd3-4a1a-8ad4-23ee51b0c6e6', '11d5c4c6-de37-4dd1-8bd7-f3f3d8a05e61'),
  -- HU Budapest | Népliget (People's Park) <- Népliget
  ('4a651d18-451a-477b-b3cb-39b35c8e56d4', '0b4a18ec-f88b-470c-b835-168768cbc550'),
  -- IS Reykjavik | Öskjuhlíð <- Öskjuhlíð II
  ('93da8300-d02f-430c-8957-b71214c7e70b', '885f4e1c-03f7-4b41-be05-2e9646ed043f'),
  -- LV Riga | Arkādijas Park (cruising) <- Riga - Arkadijas parks
  ('251e2658-6603-4897-a6b0-5c6df26803e0', 'ab012ca9-f1d5-49b4-ade1-4a30662d1306'),
  -- MK Skopje | Terminal 2 - Macedonian National Theater <- Terminal 2 - Macedonian opera and ballet
  ('14bfd153-6b34-466e-b0c1-de9e16d3a07e', '39c4328c-4447-4e71-bcb8-a09f9d77d3d3'),
  -- MT Sliema | Pembroke malta-Pembroke <- Pembroke, en las rocas-Malta
  ('37d259f5-0778-46f1-b568-384f73d514e5', 'c9318fb1-90f5-4383-b132-0b8b3e5c7279'),
  -- NO Moss | Storehaug Nord <- Storebaug
  ('12034298-f08f-4ed4-b225-c774c0f80e20', '6bd91e54-239c-4ab2-a139-8a7f317abfec'),
  -- NO Oslo | Svartkulp / Sognsvann (Cruising) <- sognsvann-Oslo
  ('2420b868-67ab-4007-80eb-4486133b9e70', '211b6373-0fb8-4ea3-a4f5-b918039b5726'),
  -- NO Oslo | Tøyen park <- Toyenparken
  ('5699c2ac-0143-439d-997a-d939026fcee8', '0dda0996-4f0a-4c5d-ad6d-35d4ddf09b06'),
  -- NO Oslo | Stensparken (Cruising) <- Stensparken
  ('d1be979a-c372-4e1c-93e1-72a2d7c00df7', '2fbec83c-cfb6-45c6-a820-f2bf15b98bfe'),
  -- NZ Auckland | Lateshift <- Lateshift Men's Cruise Club
  ('6ba93864-e203-48c3-826a-b26e519a62d2', 'f97a56ce-1929-4bd6-a27b-813fe0acf092'),
  -- PL Chorzów | Park Śląski <- Park śląski 2
  ('cc50b919-036b-4616-9fbe-bacdbe9f320a', 'b08d6956-8071-458b-9fc4-51b2bf6aef12'),
  -- PL Katowice | Silesia - toilets +2 <- Near Silesia City Center
  ('27165aa2-9af0-4961-a019-dec49981f4bc', '217b6f8d-156a-495b-8d3d-d6a51af6d486'),
  -- PL Krakow | Ciemnia Cruising Bar <- Ciemnia Club
  ('80b1937b-ce5c-41a2-8b5a-ccf94ab4c99c', 'f7f40f49-fd8d-4fd6-a5c8-aa233d16695e'),
  -- PL Kraków | Bagry Beach <- Bagry Parking
  ('2207116d-a234-43a0-a6c2-0e32353ade3e', '3720f88c-33ef-4022-948d-9df7f20d2a7e'),
  -- PL Łódź | Dark Room Videoland <- Videoland Dark Room
  ('4bb53c0a-07c3-4997-926d-b8fd15c66d18', 'dfc6a605-2c89-4fbb-bf85-80539f4030f5'),
  -- PL Poznan | Park Cytadela (Gay Cruising) <- Park Cytadela
  ('a483d0e9-5629-4c47-a6da-6e6aa5af8bc8', '2ee3216e-2893-43b8-a3bc-78f90ad9757b'),
  -- PL Wrocław | Cactus Club <- Cactus Club
  ('2cfe0578-58b7-47ec-b5dc-78d1fd8e65ea', '9d039669-ee66-4c50-b667-ceeb593c3bdc'),
  -- RO Iași | Parcul Gara Nicolina <- Gara Nicolina
  ('8c042881-6d08-4b18-893b-025f7bdcf935', '3fac243e-4c4a-4754-acf3-6738400fca69'),
  -- SE Laholm | Mellbystrand <- Parking Melbystrand
  ('c1e739eb-0e74-4110-8c85-1da69341fac8', 'dff663f9-f0da-473e-bb52-1e78ebd998e2'),
  -- SE Stockholm | Manhattan <- Manhattan Biograf
  ('f5f70b11-a38e-405d-b6d0-ecebd454aea1', 'fb3d2a78-f2cf-49ca-bd14-c42b276a16d7'),
  -- SE Stockholm | Frescati <- Frescati - Stockholm
  ('ad5a983f-720c-4447-848c-78ddc0c00f89', 'ef9d9071-6a8e-4dbe-beed-62be068473e1'),
  -- SI Ljubljana | Park Tivoli <- Tivoli
  ('b483d249-af67-448a-9f2d-80629ce1c190', 'e5d09ccf-cf96-4a21-ba76-db661ed566cd'),
  -- SK Bratislava | Velky Drazdiak <- Velky Drazdiak Kabinky
  ('b089fb69-2c06-476f-972b-75c19f43e784', '6e96f2e5-e05f-40d6-a945-376f87b20f53'),
  -- SK Kosice | Parkovisko pod furcou <- Parkovisko pod furcou 2
  ('8742e0c1-8e57-4650-b3b8-ea1a78def8c1', '4648f1ee-4be2-4c92-9da7-15897f49dcbf'),
  -- SK Kosice | Parkovisko pod furcou <- Parkovisko pod furcou 3
  ('8742e0c1-8e57-4650-b3b8-ea1a78def8c1', '319b3942-ce35-421d-8344-f3068756a3c5'),
  -- SV San Salvador | Baños Siman Galerías <- Baño segunda planta galerias
  ('47904831-cf4a-44de-90f6-062d42682e7a', 'f7d988e4-bff3-4129-8252-51eee5138751'),
  -- SV San Salvador | Monseñor Romero <- Retorno Monseñor Romero
  ('cc6369b8-14de-40f5-94cc-84553a9777b8', '3b29f325-2912-4a85-90de-d3a8b48a9787'),
  -- TT Chaguanas | Mid Centre Mall <- Mid Centre Mall
  ('2cbcf30f-1c08-462e-a072-fcc63898da4a', '4f9b0330-73cc-47b1-835e-7155506d9397'),
  -- TT Port of Spain | Queen's Park Savannah <- Queen's Park Savannah public washroom
  ('57189fdc-137a-4d67-b716-aae18e7d05fc', 'f329ae76-f4d6-4c58-aa95-5d633ff58a7e'),
  -- TT San Fernando | Gulf City Mall <- Gulf City Mall Washroom 2
  ('abf208a3-1682-463a-b66b-304a0b47157e', 'a0f4ad88-b980-428c-ba5f-0f3b656051b1'),
  -- ZA Cape Town | Stadium on Main Centre <- Stadium on Main Rd Claremont; Shopping Centre
  ('d258c381-8354-4cd7-b3c7-ffecd421e77e', '0765e6b0-5457-423e-b3b6-2a53742d7a0b');

-- 1. Keeper names (guarded on the current name).
update public.venues set name = 'Buttons Beach Road' where id = '92d53e94-bdce-4c0f-baed-c284b49f7a82' and name = 'Buttons beach road';
update public.venues set name = 'Limanakia' where id = '6b927089-f561-4db9-99d8-be756564c2fa' and name = 'Limanakia A';
update public.venues set name = 'Falasarna' where id = 'a7431cf1-adba-450c-8e55-cfa2a55d2fc6' and name = 'Falasarna Nearest';
update public.venues set name = 'Parkovisko pod furcou' where id = '8742e0c1-8e57-4650-b3b8-ea1a78def8c1' and name = 'Parkovisko pod furcou 1';

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _rw_pairs p join public.venues d on d.id = p.drop_id
         where d.duplicate_of_id is null
         order by p.keep_id, (nullif(btrim(d.website), '') is not null) desc) d
 where k.id = d.keep_id
   and ((nullif(btrim(k.website), '') is null and nullif(btrim(d.website), '') is not null
         and d.website not like 'https://translate.google.com/%')
     or (nullif(btrim(k.phone), '') is null and nullif(btrim(d.phone), '') is not null)
     or (nullif(btrim(k.address), '') is null and nullif(btrim(d.address), '') is not null));

-- 3. Merge, resolving both sides to their live terminal first.
create or replace function pg_temp.terminal(p uuid) returns uuid language plpgsql as $t$
declare v uuid := p; n uuid; i int := 0;
begin
  loop
    select duplicate_of_id into n from public.venues where id = v;
    exit when n is null or i > 20;
    v := n; i := i + 1;
  end loop;
  return v;
end
$t$;

do $merge$
declare
  r record;
  k uuid;
  d uuid;
  v_merged int := 0;
  v_skipped int := 0;
begin
  for r in select * from _rw_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'rest-of-world cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual rest-of-world cruising dedup 99991791713522'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _rw_pairs union select keep_id, drop_id from _rw_pairs) a
                 join (select keep_id, keep_id m from _rw_pairs union select keep_id, drop_id from _rw_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _rw_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _rw_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _rw_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: Tøyen park and the Tøyenbadet pool beside it are different venues.
  select count(*) into v_bad from public.venues
   where id in ('5699c2ac-0143-439d-997a-d939026fcee8', 'd346d87d-d02e-46e5-b093-26aaa58da56d')
     and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: Tøyen park / Tøyenbadet must stay separate (% live)', v_bad; end if;
end
$verify$;
