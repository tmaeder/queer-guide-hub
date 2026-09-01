-- The 45 Swiss municipalities the health registry names and `cities` did not hold.
--
-- WHY THEY WERE MISSING. Before this migration the table held 104 live Swiss
-- cities in total. The aids.ch registry (#3228) names 58 places; 45 of them had
-- no row, so `commit_health_service_org` blocked -- correctly -- and 94 of the
-- 201 centres stayed invisible to every city-scoped query.
--
-- HOW EACH ROW WAS CHOSEN. The derivation and the reviewed per-row evidence live
-- in `scripts/data-quality/resolve-aids-ch-cities.mjs` and
-- `scripts/data-quality/out/aids-ch-city-resolution.json`. Three independent
-- signals had to agree: the registry string matching a municipality label or
-- alias in any of de/fr/it/rm/en across all 2,168 current Swiss municipalities;
-- the clinic's own coordinates sitting near that municipality's point; and the
-- Swiss postal directory assigning the clinic's postal code to that same
-- municipality. Where they disagreed the postal directory decided, and that row
-- carries a written reason in the artifact.
--
-- THIS DOES NOT GO THROUGH `city_resolve_or_create`, deliberately. That function
-- is the sanctioned door for a CALLER holding one uncertain name, and its
-- geo-proximity arm refuses any create with a live city inside 2 km -- which
-- would reject Carouge, Lancy and Onex for being near Geneva, all three of them
-- real separate municipalities. A frozen, hand-reviewed list is the case that
-- guard is not for. The INSERTs are still guarded on both keys the function
-- probes, so re-running is a no-op and a row someone else adds first wins.
--
-- NAMES. The registry string is the municipality's own name in 41 of 45 cases
-- and is used as-is. Four differ, the municipality's name wins, and the registry
-- string is registered as an alias below: Grand-Lancy -> Lancy, Jona ->
-- Rapperswil-Jona, St-Imier -> Saint-Imier, Yverdon -> Yverdon-les-Bains.
-- `Zell LU` is the one row that does NOT take its bare name: Zell LU and Zell ZH
-- are both current municipalities, `cities` holds at most one row per (name,
-- country) and so cannot represent both, and minting the bare name would
-- guarantee a future wrong link -- the Charleston SC / Charleston IL shape. It
-- takes the canton-qualified form Swiss usage already uses, and the registry's
-- bare "Zell" reaches it by postal code instead.
--
-- POSTAL CODES are the identity claim the new resolver arm keys on, so they are
-- conservative by construction. A Swiss postal code is NOT one-to-one with a
-- municipality: 636 directory rows span several (1211 covers Geneve, Lancy,
-- Meyrin, Le Grand-Saconnex and Pregny-Chambesy; 3960 covers Sierre, Anniviers
-- and Crans-Montana), and 31 are filed under the SORTING CENTRE rather than the
-- addressed town -- 8010/8011/8012 "Zurich" are attributed to Schlieren, whose
-- Mulligen facility handles them. A code is stored only where the directory
-- attributes it to one municipality ALONE and its place name is not addressed to
-- a different one. That is why Onex gets no codes at all (1213 is shared with
-- Lancy) and Yverdon-les-Bains gets 1401 but not 1400 (shared with
-- Cheseaux-Noreaz). Under-claiming costs a blocked row, which is recoverable;
-- over-claiming resolves a clinic into the wrong municipality, which is not.
--
-- POPULATION is the latest P1082 by point-in-time at the highest surviving rank,
-- never `claims.P1082[0]`. Swiss municipalities carry one statement per census
-- year in no meaningful order: the array-position read gave Burgdorf 3,636
-- instead of 17,292 and Yverdon-les-Bains 20,730 instead of 30,292, which is the
-- same rank-blind mistake that published Cape Town at 433,688.

do $$
declare
  v_ch       uuid := (select id from public.countries where code = 'CH');
  v_created  integer := 0;
  v_aliases  integer := 0;
  v_toppedup integer := 0;
  r          record;
begin
  if v_ch is null then
    raise exception 'no country row for CH';
  end if;

  ---------------------------------------------------------------- new cities
  for r in
    select * from (values
      -- The first row carries the casts; a VALUES list takes its column types
      -- from row one and a bare column-alias list cannot restate them.
      ('Aigle'::text, 'Q43195'::text, 'Vaud'::text,
       46.3173::double precision, 6.9646::double precision, 11752::integer, array['1860']::text[]),
      ('Arlesheim', 'Q581647', 'Basel-Landschaft', 47.492222222222, 7.6202777777778, 9314, array['4144']),
      ('Bellinzona', 'Q64044', 'Ticino', 46.195555, 9.023809, 45305, array['6500','6501','6503','6512','6513','6514','6515','6518','6523','6524','6525','6528','6582','6583','6584','6702']),
      ('Binningen', 'Q69621', 'Basel-Landschaft', 47.533333333333, 7.5666666666667, 15675, array['4101','4102']),
      ('Breitenbach', 'Q66672', 'Solothurn', 47.408333333333, 7.5444444444444, 3854, array['4226']),
      ('Burgdorf', 'Q68311', 'Bern', 47.056666666667, 7.6263888888889, 17292, array['3400','3401']),
      ('Carouge', 'Q69364', 'Geneva', 46.18166, 6.14037, 22336, null),
      ('Chêne-Bougeries', 'Q69530', 'Geneva', 46.183333333333, 6.1833333333333, 12215, array['1224','1231']),
      ('Cottens', 'Q67714', 'Fribourg', 46.75, 7.0333333333333, 1509, array['1741']),
      ('Delémont', 'Q63896', 'Jura', 47.365277777778, 7.3472222222222, 12813, array['2800']),
      ('Düdingen', 'Q70108', 'Fribourg', 46.846105555556, 7.1905611111111, 7961, array['3186']),
      ('Gland', 'Q69300', 'Vaud', 46.416666666667, 6.2666666666667, 13106, array['1196']),
      ('Grenchen', 'Q68248', 'Solothurn', 47.193055555556, 7.3958333333333, 17140, array['2540']),
      ('Hindelbank', 'Q67564', 'Bern', 47.044166666667, 7.5402777777778, 2496, array['3324']),
      ('Hochdorf', 'Q7102', 'Lucerne', 47.166388888889, 8.2888888888889, 9844, array['6280','6281','6283']),
      ('Horgen', 'Q68286', 'Zurich', 47.260833333333, 8.5975, 24549, array['8810','8815','8816']),
      ('La Chaux-de-Fonds', 'Q68124', 'Neuchâtel', 47.099627777778, 6.8295583333333, 37600, array['2300','2301','2303','2304','2322']),
      ('Langenthal', 'Q69726', 'Bern', 47.215277777778, 7.7888888888889, 15624, array['4900','4901','4916','4924']),
      ('Le Locle', 'Q64093', 'Neuchâtel', 47.05317, 6.74816, 10433, array['2400','2416']),
      ('Liestal', 'Q68972', 'Basel-Landschaft', 47.483888888889, 7.735, 16034, array['4410']),
      ('Lugano', 'Q7024', 'Ticino', 46.010277777778, 8.9625, 63495, array['6900','6901','6903','6904','6906','6907','6912','6913','6914','6915','6917','6918','6932','6951','6959','6962','6963','6964','6965','6966','6967','6968','6974','6976','6977','6978','6979']),
      ('Männedorf', 'Q64627', 'Zurich', 47.255277777778, 8.6916666666667, 11767, array['8708']),
      ('Mendrisio', 'Q69041', 'Ticino', 45.866666666667, 8.9833333333333, 15085, array['6850','6852','6853','6862','6863','6864','6865','6866','6872']),
      ('Monthey', 'Q64051', 'Valais', 46.25, 6.95, 17777, array['1870','1871']),
      ('Morges', 'Q69401', 'Vaud', 46.509447222222, 6.4986111111111, 15705, array['1110']),
      ('Münsterlingen', 'Q69233', 'Thurgau', 47.6313, 9.2337, 3448, array['8596','8597']),
      ('Muri bei Bern', 'Q69765', 'Bern', 46.931944444444, 7.4872222222222, 13318, array['3073','3074']),
      ('Nyon', 'Q64027', 'Vaud', 46.381961666667, 6.23888, 23351, array['1260']),
      ('Onex', 'Q68240', 'Geneva', 46.183333333333, 6.1, 18915, null),
      ('Payerne', 'Q69525', 'Vaud', 46.816666666667, 6.9333333333333, 9943, array['1530','1551']),
      ('Porrentruy', 'Q68256', 'Jura', 47.416666666667, 7.0833333333333, 6675, array['2900']),
      ('Renens', 'Q69745', 'Vaud', 46.53528, 6.58971, 20927, array['1020']),
      ('Rennaz', 'Q70214', 'Vaud', 46.366666666667, 6.9166666666667, 949, array['1847']),
      ('Riehen', 'Q5262', 'Basel-Stadt', 47.580555555556, 7.6491666666667, 22534, array['4125']),
      ('Sargans', 'Q64571', 'St. Gallen', 47.0481, 9.4398, 6134, array['7320']),
      ('Schlieren', 'Q69148', 'Zurich', 47.398888888889, 8.4497222222222, 18731, array['8952']),
      ('Sierre', 'Q68297', 'Valais', 46.2918, 7.532, 17829, array['3977']),
      ('Tavannes', 'Q67203', 'Bern', 47.220833333333, 7.2013888888889, 3586, array['2710','2720']),
      ('Vevey', 'Q68160', 'Vaud', 46.466666666667, 6.85, 20142, array['1800','1811']),
      ('Wetzikon', 'Q68305', 'Zurich', 47.320833333333, 8.7930555555556, 26917, array['8620','8623']),
      ('Yverdon-les-Bains', 'Q63946', 'Vaud', 46.7785, 6.6408333333333, 30292, array['1401']),
      ('Lancy', 'Q64065', 'Geneva', 46.18969, 6.11578, 37259, array['1212']),
      ('Rapperswil-Jona', 'Q69729', 'St. Gallen', 47.228611111111, 8.8316666666667, 26995, array['8640','8645','8646','8715']),
      ('Saint-Imier', 'Q66390', 'Bern', 47.152777777778, 7, 5131, null),
      ('Zell LU', 'Q14628', 'Lucerne', 47.13573, 7.92628, 2037, array['6144','6152'])
    ) as t(name, qid, canton, lat, lon, population, postal_codes)
  loop
    -- Guarded on BOTH keys `city_resolve_or_create` probes, and against the
    -- TOTAL indexes rather than the partial one: a merged-away row still holds
    -- its name, so filtering `duplicate_of_id is null` here would let the INSERT
    -- hit idx_cities_name_country_unique and abort the whole batch. That is the
    -- poison-row failure 20260811100400 records.
    if exists (select 1 from public.cities c where c.wikidata_qid = r.qid)
       or exists (select 1 from public.cities c
                   where c.country_id = v_ch and lower(c.name) = lower(r.name))
    then
      continue;
    end if;

    insert into public.cities (
      name, country_id, region_name, latitude, longitude, population,
      wikidata_qid, postal_codes, timezone, data_source,
      last_synced_at, last_refreshed_at, field_provenance
    ) values (
      r.name, v_ch, r.canton, r.lat, r.lon, r.population,
      r.qid, r.postal_codes,
      -- Switzerland is a single-timezone country, so this is a fact about the
      -- country and not a guess about the city.
      'Europe/Zurich', 'wikidata',
      now(), now(),
      jsonb_build_object(
        'created', jsonb_build_object(
          'source', 'wikidata', 'by', 'migration:20261102100100',
          'reason', 'named by the aids.ch sexual-health registry; evidence in scripts/data-quality/out/aids-ch-city-resolution.json',
          'at', now()),
        'postal_codes', jsonb_build_object(
          'source', 'geonames-ch-postal-directory',
          'rule', 'only codes the directory attributes to this municipality alone',
          'at', now()))
    );
    v_created := v_created + 1;
  end loop;

  ------------------------------------------------------------------- aliases
  -- `city_aliases` is what the resolver's exonym arm reads, and merge_cities
  -- already mints a row here for every name it drops. These are the registry
  -- strings that name a real place under a form the city row does not carry.
  for r in
    select * from (values
      ('Fribourg - Freiburg'::text, 'Fribourg'::text),
      ('Bulle', 'La Tour-de-Trême'),
      ('Neuchâtel', 'Peseux'),
      ('Zollikon', 'Zollikerberg'),
      ('Lancy', 'Grand-Lancy'),
      ('Rapperswil-Jona', 'Jona'),
      ('Saint-Imier', 'St-Imier'),
      ('Yverdon-les-Bains', 'Yverdon')
    ) as t(city, alias)
  loop
    -- `alias_key` is a GENERATED column; supplying it is an error, and it is
    -- also what makes the ON CONFLICT arbiter below the right one.
    insert into public.city_aliases (city_id, alias, locale)
    select c.id, r.alias, null
      from public.cities c
     where c.country_id = v_ch
       and lower(c.name) = lower(r.city)
       and c.duplicate_of_id is null
    on conflict (city_id, alias_key) do nothing;
    v_aliases := v_aliases + 1;
  end loop;

  -------------------------------------------- postal codes on existing rows
  -- A UNION, not fill-if-empty: Neuchatel already carries 2000 and still needs
  -- 2034 (Peseux) and 2035 (Corcelles), which are the codes that make those two
  -- rows resolvable at all. Every code added here passed the same single-owner
  -- test as the ones above.
  for r in
    select * from (values
      ('Geneva'::text, array['1200','1201','1202','1203','1204','1205','1206','1207','1208','1209','1240']::text[]),
      ('Arth', array['6414','6415']),
      ('St. Gallen', array['9000','9001','9004','9006','9007','9008','9010','9011','9012','9013','9014','9015','9016','9020','9021','9023','9024','9026','9027','9028','9029']),
      ('Brig-Glis', array['3900','3902']),
      ('Zürich', array['8000','8001','8002','8003','8004','8005','8006','8008','8017','8018','8021','8022','8024','8027','8031','8032','8034','8036','8037','8038','8040','8041','8042','8045','8046','8047','8048','8049','8050','8051','8052','8053','8055','8057','8063','8064','8070','8071','8074','8075','8080','8081','8085','8086','8087','8088','8090','8091','8092','8093','8096','8098','8099']),
      ('Fribourg - Freiburg', array['1700','1701','1708','1722']),
      ('Bulle', array['1630','1631','1635']),
      ('Neuchâtel', array['2000','2001','2002','2010','2034','2035','2036','2042','2067']),
      ('Zollikon', array['8125','8702']),
      ('Luzern', array['6000','6002','6003','6004','6006','6007','6014','6015'])
    ) as t(city, codes)
  loop
    update public.cities c
       set postal_codes = (select array_agg(distinct x order by x)
                             from unnest(coalesce(c.postal_codes, '{}') || r.codes) x),
           field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
             'postal_codes', jsonb_build_object(
               'source', 'geonames-ch-postal-directory',
               'rule', 'only codes the directory attributes to this municipality alone',
               'at', now(), 'by', 'migration:20261102100100')),
           updated_at = now()
     where c.country_id = v_ch
       and lower(c.name) = lower(r.city)
       and c.duplicate_of_id is null
       and not (coalesce(c.postal_codes, '{}') @> r.codes);
    v_toppedup := v_toppedup + 1;
  end loop;

  raise notice 'swiss municipalities: % created, % alias rows applied, % postal top-ups',
    v_created, v_aliases, v_toppedup;

  -------------------------------------------------------------------- asserts
  -- The four registry strings that can ONLY be reached by postal code. Each code
  -- must be claimed by exactly one Swiss city: claimed by none and the resolver
  -- blocks, claimed by two and it blocks, claimed by the wrong one and a clinic
  -- lands in another canton.
  for r in
    select * from (values ('6000'::text,'Luzern 16'::text), ('4101','Bruderholz'),
                          ('2035','Corcelles'), ('6144','Zell')
    ) as t(code, registry)
  loop
    if (select count(*) from public.cities c
         where c.country_id = v_ch and c.duplicate_of_id is null
           and c.postal_codes @> array[r.code]) <> 1 then
      raise exception 'postal code % (for registry string %) is claimed by % Swiss cities, expected exactly 1',
        r.code, r.registry,
        (select count(*) from public.cities c where c.country_id = v_ch
          and c.duplicate_of_id is null and c.postal_codes @> array[r.code]);
    end if;
  end loop;

  -- Every alias must resolve, or a registry string silently stays blocked.
  for r in
    select * from (values ('Fribourg'::text), ('La Tour-de-Trême'), ('Peseux'), ('Zollikerberg'),
                          ('Grand-Lancy'), ('Jona'), ('St-Imier'), ('Yverdon')
    ) as t(alias)
  loop
    if not exists (
      select 1 from public.city_aliases a
        join public.cities c on c.id = a.city_id
       where c.country_id = v_ch
         and a.alias_key = public.city_canonical_key(r.alias)
    ) then
      raise exception 'alias % did not land', r.alias;
    end if;
  end loop;
end $$;
