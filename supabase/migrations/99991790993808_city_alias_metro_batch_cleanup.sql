-- City alias metro batch: independent municipalities folded into core cities.
--
-- WHAT WAS WRONG
-- A batch on 2026-05-01 07:53 wrote 118 `city_aliases` rows that fold metro-
-- area names into a core city. Many are fine — spelling variants ("Paris (FR)",
-- "Milano", "Roma"), districts (Soho, Brooklyn, Tokyo's special wards, Sydney
-- suburbs). Others are SEPARATE municipalities, some in a different state,
-- province or prefecture: Jersey City (New Jersey) → New York, Yokohama and
-- Kawasaki (Kanagawa) → Tokyo, Saitama → Tokyo, Ambilly (Haute-Savoie, 500 km
-- away) → Paris, Haarlem → Amsterdam, Berkeley → San Francisco, Badalona →
-- Barcelona, Senna Comasco (province of Como) → Milan.
-- city_resolve_or_create matches aliases before it creates, so every venue
-- whose own city is one of these landed on the core city. The Los Angeles half
-- of this batch was repaired by 99991790978994; this file does the rest.
--
-- WHAT THIS DOES
-- 0. Deletes 31 aliases (ids below are the record; restore by re-inserting).
--    Two of them are ambiguous ward names rather than other cities — 中央区
--    (Chūō-ku) and 北区 (Kita-ku) exist in Osaka, Kobe, Sapporo, Nagoya … so
--    as a Tokyo alias they would pull those cities' venues into Tokyo.
-- 1. Repairs the "Sabadell, Katalonien" placeholder (0 venues, 1 personality)
--    into Sabadell rather than creating a duplicate beside it.
-- 2. Creates nine municipalities through city_resolve_or_create (never a bare
--    INSERT). Identifiers resolved LIVE on 2026-10-03 via wbgetentities; a
--    rolled-back probe confirmed each one creates rather than matching another
--    row. Les Lilas and Levallois-Perret are NOT created: the resolver refuses
--    them as within 2 km of Bagnolet / Neuilly-sur-Seine — its near-miss rule
--    working as designed — so their venues stay on Paris for now.
-- 3. Moves venues on two signals evaluated in SQL: the address names the
--    target city, AND — if the venue carries a postal code — that code belongs
--    to the target; only a venue with NO postal code may fall back to
--    coordinates within 10 km. The postal rule is load-bearing: "Beach Club,
--    33 Avenue de la Porte d'Aubervilliers, 75018" names Aubervilliers and sits
--    1 km from it, and is in Paris 18e.
--
-- DELIBERATELY NOT MOVED (each read by hand)
-- * Two Tokyo venues with city text 相模原市: their addresses read Shinjuku,
--   Tokyo. The link is right, the text is wrong.
-- * Kabukiza (中央区): Ginza, Chūō, Tokyo — correct.
-- * Three Alameda venues whose postal_code is 94103 (a San Francisco ZIP,
--   centroid default) — the signals disagree.
-- * Westbrae Biergarten, 1280 Gilman St, Berkeley 94706 — 94706 is Albany.
-- * Venues in Haarlemmermeer (Badhoevedorp) and Landsmeer (Den Ilp): the
--   address names the village, not the municipality.
-- * Drancy venue: postal_code 97200 (Martinique) — disagrees.
-- * Washington → Washington, D.C. and the NYC borough aliases: kept.

set local lock_timeout = '5s';
select set_config('app.actor', 'migration:99991790993808_city_alias_metro_batch_cleanup', true);

-- ---------------------------------------------------------------------------
-- 0. Aliases
-- ---------------------------------------------------------------------------
delete from public.city_aliases
 where created_at between '2026-05-01 07:53' and '2026-05-01 07:54'
   and id in (
     '4bbad4c5-e0f5-4052-9963-78912da6b894',  -- Badalona → Barcelona
     'a1a40d56-673e-464e-8657-b58baa37b319',  -- Hospitalet de Llobregat → Barcelona
     '02abf61f-fdad-4bba-b8a2-9d0dcf4b153d',  -- Sabadell → Barcelona
     '46c5ae61-418d-431f-b288-a42aaefa1320',  -- Humanes de Madrid → Madrid
     '4138dee4-becc-4b49-b52e-3671505a0228',  -- Ambilly (FR) → Paris
     '360b48d6-f47d-4186-8d22-cb750e456d60',  -- Aubervilliers → Paris
     'a2116c56-b29c-4796-89e7-a55d9305f7cb',  -- Drancy → Paris
     '5b20ce8d-13cf-4dd4-9d72-2ee1d5979f91',  -- Fontenay-aux-Roses → Paris
     '77a19865-76bd-4385-a202-8bb98aae3dcf',  -- Fontenay-sous-Bois → Paris
     '9f4bfcd6-5d37-4097-9226-3f80e96ad3c6',  -- Ivry-sur-Seine → Paris
     'e22dbbaa-e211-4808-935d-0fe8f287ba7c',  -- Les Lilas → Paris
     '4a05bd02-f448-4975-8980-b6ed24cea83e',  -- Levallois-Perret → Paris
     '444494ef-a28d-4cb5-8eb1-c84dbfdcbd88',  -- Amstelveen → Amsterdam
     '2475d77f-c99c-451f-a2db-9078386d94ac',  -- Haarlem → Amsterdam
     '67cccb56-72c7-4e6d-8253-ffb79facf358',  -- Haarlemmermeer → Amsterdam
     '24974dce-da7c-4533-8d85-c86b427491e1',  -- Landsmeer → Amsterdam
     'd04560bc-328e-48d0-80cd-88226816d436',  -- Zaanstad → Amsterdam
     '1a1b2c54-1a08-4384-880b-52a240d34afc',  -- Senna Comasco → Milan
     '8d5ae47d-5916-45a0-addb-472fa8d8ead9',  -- さいたま市 Saitama → Tokyo
     '2ae52767-5cf6-4124-b059-fc204243944b',  -- 川崎市 Kawasaki → Tokyo
     '9693801d-c30f-4a09-a1b8-0efdf3d71feb',  -- 横浜市 Yokohama → Tokyo
     'fb120be5-85bf-4526-9a4a-43fd4b3d48f5',  -- 相模原市 Sagamihara → Tokyo
     '3205467e-097b-49c1-bb12-c63203cabb95',  -- 船橋市 Funabashi → Tokyo
     'a4f1b277-0239-4316-b6be-80297e86f36d',  -- 中央区 (ambiguous ward) → Tokyo
     'f2f9973a-90b1-4f6d-b44e-396039b264e1',  -- 北区 (ambiguous ward) → Tokyo
     'a490ff97-5d02-40cc-95cc-a7d4d5a59f12',  -- Berwyn → Chicago
     '0c46afde-e12a-4c62-845c-eb5a7f9b5d20',  -- Key Biscayne → Miami
     'e4900bdd-4cca-47d3-8e16-342170200f86',  -- Miami Beach → Miami
     '9a2770ad-56f6-47f2-84d1-d4661292f734',  -- Jersey City → New York
     '4242ad6a-1441-44ab-8473-d773820d39a8',  -- Alameda → San Francisco
     '879f82af-1f75-4150-becd-5ab3fcf2874a'   -- Berkeley → San Francisco
   );

-- ---------------------------------------------------------------------------
-- 1. Sabadell placeholder → Sabadell
-- ---------------------------------------------------------------------------
update public.cities
   set name         = 'Sabadell',
       region_name  = coalesce(nullif(btrim(region_name), ''), 'Catalonia'),
       latitude     = coalesce(latitude, 41.5475),
       longitude    = coalesce(longitude, 2.108889),
       wikidata_qid = coalesce(wikidata_qid, 'Q12258')
 where id = '488a977b-b684-4416-bc35-688f88a5406b'
   and name = 'Sabadell, Katalonien'
   and duplicate_of_id is null;

-- The placeholder's tmp- slug is not regenerated by a name change; give it the
-- real one while it is still unclaimed (the row is unindexed with no inbound
-- links, so nothing points at the old slug).
update public.cities
   set slug = 'sabadell'
 where id = '488a977b-b684-4416-bc35-688f88a5406b'
   and slug like 'tmp-%'
   and not exists (select 1 from public.cities where slug = 'sabadell');

-- ---------------------------------------------------------------------------
-- 2. Missing municipalities
-- ---------------------------------------------------------------------------
do $create$
declare
  r record;
  v record;
begin
  for r in
    select * from (values
      ('Badalona',           'ES', 'Catalonia',           41.448889::numeric,   2.246111::numeric, 'Q15468',   'cc0c20ac-fbae-4a85-a234-66ea0363e87a'::uuid),
      ('Humanes de Madrid',  'ES', 'Community of Madrid', 40.253889::numeric,  -3.827778::numeric, 'Q281632',  '772d642b-33be-4e98-b59a-451cf3a73890'::uuid),
      ('Fontenay-aux-Roses', 'FR', 'Île-de-France',       48.789320::numeric,   2.288770::numeric, 'Q269166',  'b46a28a1-5c7a-41ac-a2cc-5b03448f6f69'::uuid),
      ('Fontenay-sous-Bois', 'FR', 'Île-de-France',       48.851700::numeric,   2.477200::numeric, 'Q193899',  'b46a28a1-5c7a-41ac-a2cc-5b03448f6f69'::uuid),
      ('Ivry-sur-Seine',     'FR', 'Île-de-France',       48.807800::numeric,   2.374700::numeric, 'Q193877',  'b46a28a1-5c7a-41ac-a2cc-5b03448f6f69'::uuid),
      ('Amstelveen',         'NL', 'North Holland',       52.300000::numeric,   4.850000::numeric, 'Q9898',    '32c83098-96dd-4448-9fb4-80c243903ccc'::uuid),
      ('Zaanstad',           'NL', 'North Holland',       52.433333::numeric,   4.816667::numeric, 'Q9978',    '32c83098-96dd-4448-9fb4-80c243903ccc'::uuid),
      ('Senna Comasco',      'IT', 'Lombardy',            45.766667::numeric,   9.100000::numeric, 'Q47379',   '347cb4d3-76c1-4258-8ee6-000cccba3e6e'::uuid),
      ('Key Biscayne',       'US', 'Florida',             25.690833::numeric, -80.165556::numeric, 'Q1650594', 'd1a53b3f-9cba-4f12-b60b-fea7349b6cb4'::uuid)
    ) t(name, cc, region, lat, lng, qid, core_id)
  loop
    select * into v
    from public.city_resolve_or_create(
      p_name          => r.name,
      p_country_code  => r.cc,
      p_region_hint   => r.region,
      p_lat           => r.lat,
      p_lng           => r.lng,
      p_wikidata_qid  => r.qid,
      p_source_slug   => 'migration:99991790993808',
      p_allow_create  => true,
      p_actor         => 'admin'
    );
    if v.city_id is null then
      raise exception 'city_resolve_or_create refused % (action=%, reason=%, candidates=%)',
        r.name, v.action, v.reason, v.candidates;
    end if;
    if v.city_id = r.core_id then
      raise exception '% still resolves to its core city (match_type=%)', r.name, v.match_type;
    end if;
    raise notice '% -> % (%)', r.name, v.city_id, v.action;
  end loop;
end
$create$;

-- ---------------------------------------------------------------------------
-- 3. Relink
-- ---------------------------------------------------------------------------
create temp table _metro_relink on commit drop as
select t.venue_id::uuid, t.from_city_id::uuid, t.target_name, t.target_qid,
       null::uuid as target_id, t.zips
from (values
  -- Barcelona → Badalona / L'Hospitalet / Sabadell
  ('40104338-55d9-4d7f-83c7-2f6406aafcf0','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Badalona',          'Q15468',  array['08911','08912','08913','08914','08915','08916','08917','08918']),
  ('05f6464c-b189-4649-b21b-e1ae3ab62862','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Badalona',          'Q15468',  array['08911','08912','08913','08914','08915','08916','08917','08918']),
  ('91b3d171-7d8d-4172-aba5-c031776b778d','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Badalona',          'Q15468',  array['08911','08912','08913','08914','08915','08916','08917','08918']),
  ('70e48db3-7c2f-4d18-b4b8-d19f8763d809','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Hospitalet',        'Q15470',  array['08901','08902','08903','08904','08905','08906','08907','08908']),
  ('e2a23b05-8b72-4b8e-9f34-1db427d44ee2','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Hospitalet',        'Q15470',  array['08901','08902','08903','08904','08905','08906','08907','08908']),
  ('095709d0-179d-4f8d-a208-04916a1be63c','cc0c20ac-fbae-4a85-a234-66ea0363e87a','Sabadell',          'Q12258',  array['08201','08202','08203','08204','08205','08206','08207','08208']),
  -- Madrid → Humanes de Madrid
  ('97639a1c-b565-44e4-ac0f-80e94bef0cd7','772d642b-33be-4e98-b59a-451cf3a73890','Humanes de Madrid', 'Q281632', array['28970']),
  -- Paris → inner suburbs
  ('305c81e0-846f-46ef-9045-53237d4bc449','b46a28a1-5c7a-41ac-a2cc-5b03448f6f69','Fontenay-aux-Roses','Q269166', array['92260']),
  ('5ff0e086-971c-4e4f-8cd2-c880ddfc49e2','b46a28a1-5c7a-41ac-a2cc-5b03448f6f69','Fontenay-sous-Bois','Q193899', array['94120']),
  ('a0297456-7d2d-42db-9415-926c94af4784','b46a28a1-5c7a-41ac-a2cc-5b03448f6f69','Fontenay-sous-Bois','Q193899', array['94120']),
  ('23c68f4e-74d6-4dfc-879d-65140473d8cd','b46a28a1-5c7a-41ac-a2cc-5b03448f6f69','Ivry-sur-Seine',    'Q193877', array['94200']),
  -- Amsterdam → Amstelveen / Haarlem / Zaanstad (Dutch codes: match the 4-digit part)
  ('b0760524-5e4c-41ea-b2f2-acda25fccc29','32c83098-96dd-4448-9fb4-80c243903ccc','Amstelveen',        'Q9898',   array['1181','1182','1183','1184','1185','1186','1187','1188','1189']),
  ('59cb95a1-97f6-4a22-8a81-a51517399397','32c83098-96dd-4448-9fb4-80c243903ccc','Amstelveen',        'Q9898',   array['1181','1182','1183','1184','1185','1186','1187','1188','1189']),
  ('694fa9a8-8645-4709-9966-c53e337f6f06','32c83098-96dd-4448-9fb4-80c243903ccc','Haarlem',           'Q9920',   array['2011','2012','2013','2014','2015','2019','2021','2022','2023','2024','2025','2026','2031','2032','2033','2034','2035','2036','2037']),
  ('ec2d9186-bbaf-4d2d-82fe-c8cc69a9400c','32c83098-96dd-4448-9fb4-80c243903ccc','Zaanstad',          'Q9978',   array['1501','1502','1503','1504','1505','1506','1507','1508','1509']),
  -- Milan → Senna Comasco
  ('f6acd742-f6b9-497a-a993-cc73c9a61564','347cb4d3-76c1-4258-8ee6-000cccba3e6e','Senna Comasco',     'Q47379',  array['22070']),
  -- Chicago → Berwyn
  ('2fab4372-e078-4d15-97a4-623162f7b2b0','5a45656d-9963-420a-b199-9184a222d01a','Berwyn',            'Q578072', array['60402']),
  -- Miami → Key Biscayne / Miami Beach
  ('c8547024-866a-43c8-a653-4f0024f7a663','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Key Biscayne',      'Q1650594',array['33149']),
  ('acfafab0-63c2-4440-bbb1-7d8b5d63cddd','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Key Biscayne',      'Q1650594',array['33149']),
  ('86d4dbed-83ed-4a15-a54d-0e9333c3daaa','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('9bde7a7e-0cfd-44ae-99d3-320c4995a6be','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('e1b93b5e-23d6-4176-a05e-8a2699f88cbc','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('d698cffe-0349-41ba-ac46-31373ccb9a79','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('56424d3e-88a7-4226-bb58-582176b37ef7','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('5c58630a-a4be-4f77-8fe3-b89b704e121d','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('4902ed03-0cdb-4cbe-a2db-c5e605f0da70','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  ('6eeb4d94-4694-4fab-9db2-95e4bbf0596a','d1a53b3f-9cba-4f12-b60b-fea7349b6cb4','Miami Beach',       'Q201516', array['33109','33139','33140','33141','33154']),
  -- New York → Jersey City (New Jersey)
  ('7a7cbf68-6756-41f3-b510-7d22c6691942','2a13fd8c-175c-4a34-bacc-7bb5afaa4506','Jersey City',       'Q26339',  array['07302','07304','07305','07306','07307','07310','07311']),
  ('de30c816-d196-46ad-b3af-1c100d2f419c','2a13fd8c-175c-4a34-bacc-7bb5afaa4506','Jersey City',       'Q26339',  array['07302','07304','07305','07306','07307','07310','07311']),
  ('a70105dd-6d46-44d6-99ba-7edda1ffb39a','2a13fd8c-175c-4a34-bacc-7bb5afaa4506','Jersey City',       'Q26339',  array['07302','07304','07305','07306','07307','07310','07311']),
  ('9214b256-d05c-4a5a-9846-87d90261b360','2a13fd8c-175c-4a34-bacc-7bb5afaa4506','Jersey City',       'Q26339',  array['07302','07304','07305','07306','07307','07310','07311']),
  -- San Francisco → Alameda / Berkeley
  ('9affbc5d-2cd9-4ea0-8bc5-1449b2bb47f1','4b40014b-047f-4b3f-bf47-c081107b1e10','Alameda',           'Q490744', array['94501','94502']),
  ('a4a9efda-f16b-4261-a727-efc1cfaec7a0','4b40014b-047f-4b3f-bf47-c081107b1e10','Berkeley',          'Q484678', array['94702','94703','94704','94705','94707','94708','94709','94710','94720'])
) t(venue_id, from_city_id, target_name, target_qid, zips);

update _metro_relink r
   set target_id = c.id
  from public.cities c
 where c.wikidata_qid = r.target_qid
   and c.duplicate_of_id is null;

do $relink$
declare
  r        record;
  v_pc     text;
  v_signal text;
  v_moved  int := 0;
  v_skip   int := 0;
begin
  for r in
    select l.*, v.address, v.postal_code, v.latitude, v.longitude, v.city_id,
           c.latitude as c_lat, c.longitude as c_lng
      from _metro_relink l
      join public.venues v on v.id = l.venue_id
      left join public.cities c on c.id = l.target_id
  loop
    if r.target_id is null then
      raise exception 'target city % (%) did not resolve', r.target_name, r.target_qid;
    end if;

    -- Soft precondition: still on the core city it was folded into.
    if r.city_id is distinct from r.from_city_id then
      raise notice 'skip % — no longer on its core city', r.venue_id;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- Signal 1: the venue's own address names the target city.
    if coalesce(r.address, '') not ilike '%' || r.target_name || '%' then
      raise notice 'skip % — address does not name %', r.venue_id, r.target_name;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- Signal 2: a present postal code MUST belong to the target (prefix match
    -- on the listed codes, whitespace removed); only a venue with no postal
    -- code may fall back to coordinates within 10 km.
    v_pc := nullif(regexp_replace(coalesce(r.postal_code, ''), '\s', '', 'g'), '');
    v_signal := case
      when v_pc is not null then
        case when exists (select 1 from unnest(r.zips) z where v_pc like z || '%')
             then 'postal_code:' || v_pc end
      when r.latitude is not null and r.c_lat is not null
           and public.haversine_m(r.latitude, r.longitude, r.c_lat, r.c_lng) <= 10000
        then 'coords_km:' || round((public.haversine_m(r.latitude, r.longitude, r.c_lat, r.c_lng) / 1000)::numeric, 1)
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
                  'by', 'migration:99991790993808',
                  'at', now(),
                  'from_city_id', r.from_city_id,
                  'to_city', r.target_name,
                  'evidence', jsonb_build_array('address_names_city', v_signal)))
     where id = r.venue_id
       and city_id = r.from_city_id;
    v_moved := v_moved + 1;
  end loop;
  raise notice 'relinked %, skipped %', v_moved, v_skip;
end
$relink$;

-- ---------------------------------------------------------------------------
-- Postconditions: end state.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad int;
begin
  -- P1: none of the 31 alias keys remains from the 2026-05-01 batch.
  select count(*) into v_bad
    from public.city_aliases
   where created_at between '2026-05-01 07:53' and '2026-05-01 07:54'
     and alias_key in ('badalona','hospitalet de llobregat','sabadell','humanes de madrid','ambilly (fr)',
                       'aubervilliers','drancy','fontenay-aux-roses','fontenay-sous-bois','ivry-sur-seine',
                       'les lilas','levallois-perret','amstelveen','haarlem','haarlemmermeer','landsmeer',
                       'zaanstad','senna comasco','さいたま市','川崎市','横浜市','相模原市','船橋市','中央区','北区',
                       'berwyn','key biscayne','miami beach','jersey city','alameda','berkeley');
  if v_bad <> 0 then
    raise exception 'P1 failed: % batch aliases still present', v_bad;
  end if;

  -- P2: the kept aliases are still there (districts and spelling variants).
  select count(*) into v_bad
    from public.city_aliases
   where created_at between '2026-05-01 07:53' and '2026-05-01 07:54'
     and alias_key in ('brooklyn','soho','milano','roma','paris (fr)','surry hills','新宿区');
  if v_bad <> 7 then
    raise exception 'P2 failed: % of 7 kept aliases present', v_bad;
  end if;

  -- P3: ten target cities exist, live, carrying their identifier.
  select 10 - count(*) into v_bad
    from public.cities
   where wikidata_qid in ('Q12258','Q15468','Q281632','Q269166','Q193899','Q193877','Q9898','Q9978','Q47379','Q1650594')
     and duplicate_of_id is null;
  if v_bad <> 0 then
    raise exception 'P3 failed: % of 10 target cities missing', v_bad;
  end if;

  -- P4: no Sabadell duplicate.
  select count(*) into v_bad
    from public.cities c
    join public.countries co on co.id = c.country_id
   where co.code = 'ES' and lower(c.name) like 'sabadell%' and c.duplicate_of_id is null;
  if v_bad <> 1 then
    raise exception 'P4 failed: % live Sabadell rows', v_bad;
  end if;

  -- P5: none of the listed venues still sits on the core city it was folded into.
  select count(*) into v_bad
    from public.venues v
    join _metro_relink l on l.venue_id = v.id
   where v.city_id = l.from_city_id;
  if v_bad <> 0 then
    raise exception 'P5 failed: % venues still on their core city', v_bad;
  end if;

  -- P6: controls stay put.
  select count(*) into v_bad
    from public.venues v
   where (v.id = '5934480d-4a27-44ba-86d5-121252fc07ed'   -- Beach Club, Paris 18e
          and v.city_id is distinct from 'b46a28a1-5c7a-41ac-a2cc-5b03448f6f69'::uuid)
      or (v.id in ('25350147-9992-46f5-b8dd-6d733e074feb',  -- Shinjuku venues with 相模原市 text
                   '215c4932-7ac3-4a6e-bf22-74872cf1a061',
                   'baee58c6-7ec8-4511-a13c-0d9906b17e53')  -- Kabukiza, Ginza
          and v.city_id is distinct from '8e055c1c-e2a6-4414-afcf-684e37953c3a'::uuid)
      or (v.id = '6e1b3bb9-1ca6-4045-b10a-9896fbadd234'   -- Westbrae, ZIP 94706 = Albany
          and v.city_id is distinct from '4b40014b-047f-4b3f-bf47-c081107b1e10'::uuid);
  if v_bad <> 0 then
    raise exception 'P6 failed: % control venues moved', v_bad;
  end if;
end
$verify$;
