-- The wrong-country probe over personality-birth-place city shells, worked by hand.
--
-- THE PROBE IS A CANDIDATE GENERATOR, NOT A DEFECT COUNT, AND THAT IS THE MAIN FINDING.
-- It flags a shell whose stored country disagrees with the country of the nearest real city
-- within half a degree. 27 rows matched; reading them one by one, MOST ARE CORRECT:
--
--   * 13 are ordinary BORDER CITIES where the nearest neighbour is simply across a frontier
--     -- Windsor ON (1.8 km from Detroit), Helsingoer DK (6.6 km from Helsingborg SE),
--     Burghausen and Eggenfelden and Immenstadt DE, Boehmisch Leipa and Jablonec CZ,
--     Murska Sobota SI, Bleiburg AT, Brawley US, Trieste and Caprese IT, Essex ON.
--   * 6 more (Utuado, Ponce, Maricao, Manati, Juana Diaz, Mayagueez) are correctly filed PR
--     and were flagged only because their nearest neighbour is ITSELF junk: a row named
--     "Londres" -- London -- minted by event-city-match at Utuado's coordinates and filed
--     under the United States. THE REFERENCE ROW'S DEFECT MASQUERADED AS THE CANDIDATES'.
--     That row is repaired by 99970101100000, which is how this pass found that cohort.
--
-- So 19 of 27 are false positives. Only 8 are real, and they are three different things.
-- Ten more of the 27 (the exonym and duplicate cases) are deliberately deferred below.
--
-- 1. THREE PUERTO RICO SHELLS FILED UNDER THE UNITED STATES. Two independent signals agree:
--    each personality's birth_place text says "Puerto Rico" in as many words, and the corpus
--    convention is unambiguous -- ten sibling shells (Bayamon, Humacao, Juana Diaz, Manati,
--    Maricao, Mayagueez, Ponce, Santurce, Utuado, Yabucoa) and the canonical San Juan
--    (Q41211, 38 venues, 99 events) all sit under PR, and only these three comma-qualified
--    rows sit under US. `countries` models PR as its own ISO-3166-1 row.
--
-- 2. TWO NON-PLACES, both resolved live against Wikidata rather than asserted from the name:
--      Rio Grande Valley -> Q1644904 "region spanning the border south in Texas, United
--        States" -- a REGION, and in Texas, while the row is filed MX. Zero content of any
--        kind, not even a personality.
--      Deutsch-Ostafrika -> Q153963 "German colonial territory (1885-1919)" -- a defunct
--        polity, the same class as the 57 rows deleted by 20261001120000.
--    Both are ARCHIVED, not deleted: archive_city_as_nonplace is the reversible convention
--    and, unlike a DELETE, it leaves the personality FK intact so no birth_place text has to
--    be copied out first.
--
-- 3. ONE WRONG COORDINATE, NOT A WRONG COUNTRY -- and this one inverts the probe's premise.
--    Lippen resolves to Q160661 "human settlement in Germany" (P17=Q183) at 51.3792,14.4639,
--    which AGREES with the row's stored country DE and with its birth_place text "Lippen
--    (DE)". The row's stored coordinates are 48.639,14.229 -- about 305 km south, on the
--    Czech/Austrian border. The probe measures "coordinates disagree with country", and
--    EITHER SIDE CAN BE THE WRONG ONE; here it is the coordinates. Country left untouched.
--
-- DELIBERATELY DEFERRED, because each is a CONVENTION decision rather than a defect, and
-- this corpus has not made that decision consistently:
--   * Hong Kong. The shell is filed CN; canonical "Hong Kong" (23 venues, 20 events) is
--     filed HK -- but Central, Mong Kok and Sheung Wan, all real indexable HK districts
--     carrying venues, are filed CN, and Kowloon City is filed HK. Four rows say CN and two
--     say HK. Resolving that is wider than these 27 rows and touches indexable content.
--   * Saint-Denis, Reunion. The shell is filed FR and holds 6 venues; a ghost "Saint-Denis"
--     under RE holds none, and Le Tampon -- also a Reunion commune -- is filed FR. Two rows
--     say RE and one says FR, and the row with the CONTENT is the one with the disputed
--     country, so the merge direction is not obvious either.
--   * San Juan, Puerto Rico duplicates the canonical San Juan 2.7 km away. It is reparented
--     to PR here and NOT merged, which deliberately hands it to the dedup engine: once both
--     rows are in PR the pair is same-country and under 10 km, so place_pair_corroboration
--     corroborates it on its own arm rather than this file asserting the merge by hand.
--
-- Guards are SOFT on preconditions and HARD on postconditions.

begin;

-- ------------------------------------------------- 1. three Puerto Rico shells: US -> PR
update cities c
   set country_id = (select id from countries where code = 'PR')
 where c.id in ('08d9303b-2a19-4c6f-874e-fab9be86f67b',   -- Carolina, Puerto Rico
                '47dff25b-2fd2-4f76-92f4-06aa6a762a49',   -- Cayey, Puerto Rico
                '47843f6d-4015-475a-b66f-e749f716dbe4')   -- San Juan, Puerto Rico
   and c.country_id = (select id from countries where code = 'US');   -- soft

-- ----------------------------------------------------- 2. two non-places, reversibly archived
do $archive$
declare r record;
begin
  for r in
    select * from (values
      ('0614d22b-bc1f-4a9f-a221-75444ad11a26'::uuid,
       'not_a_city: Q1644904 is a REGION spanning the Texas border, not a settlement; row was also filed MX',
       '{"wikidata":"Q1644904","label":"Rio Grande Valley","class":"region","resolved":"by request"}'::jsonb),
      ('83fa4368-90a7-4fa1-b307-9191988aa270'::uuid,
       'not_a_city: Q153963 is German East Africa, a colonial territory 1885-1919, not a settlement',
       '{"wikidata":"Q153963","label":"German East Africa","class":"historical polity","resolved":"by request"}'::jsonb)
    ) v(id, reason, signals)
  loop
    if exists (select 1 from cities
                where id = r.id
                  and coalesce(shell_status::text,'real') <> 'ghost'
                  and duplicate_of_id is null) then
      perform archive_city_as_nonplace(r.id, r.reason, r.signals);
    end if;
  end loop;
end $archive$;

-- ------------------------------------ 3. Lippen: wrong COORDINATES, country already correct
update cities c
   set latitude  = 51.37920,
       longitude = 14.46390,
       wikidata_qid = coalesce(c.wikidata_qid, 'Q160661'),
       field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
         'latitude', jsonb_build_object(
            'source', 'wikidata:Q160661',
            'by',     'migration:99970101100100',
            'reason', 'coordinates_disagreed_with_country_and_the_coordinates_were_wrong',
            'from',   jsonb_build_object('latitude', c.latitude, 'longitude', c.longitude)))
 where c.id = 'dbb3d43d-5da0-4f43-b5af-c9e0274133c2'
   and haversine_m(c.latitude, c.longitude, 51.37920, 14.46390) > 50000;   -- soft

-- ------------------------------------------------------------------ postconditions: HARD
do $verify$
declare v_bad int; v_total int;
begin
  -- the three Puerto Rico rows are in PR, and nothing else moved with them
  select count(*) into v_bad
  from cities c join countries co on co.id = c.country_id
  where c.id in ('08d9303b-2a19-4c6f-874e-fab9be86f67b','47dff25b-2fd2-4f76-92f4-06aa6a762a49',
                 '47843f6d-4015-475a-b66f-e749f716dbe4')
    and co.code <> 'PR';
  if v_bad <> 0 then raise exception 'P1 % Puerto Rico row(s) not reparented', v_bad; end if;

  -- no comma-qualified ", Puerto Rico" city is filed under the United States any more
  select count(*) into v_bad
  from cities c join countries co on co.id = c.country_id
  where c.duplicate_of_id is null and c.name ilike '%, Puerto Rico' and co.code = 'US';
  if v_bad <> 0 then raise exception 'P2 % ", Puerto Rico" row(s) still filed US', v_bad; end if;

  -- the two non-places are archived (ghost), and archiving is what removes them from search
  select count(*) into v_bad from cities
  where id in ('0614d22b-bc1f-4a9f-a221-75444ad11a26','83fa4368-90a7-4fa1-b307-9191988aa270')
    and coalesce(shell_status::text,'real') <> 'ghost';
  if v_bad <> 0 then raise exception 'P3 % non-place(s) not archived', v_bad; end if;

  -- archiving is REVERSIBLE, so the personality link must survive it
  if not exists (select 1 from personalities
                  where city_id = '83fa4368-90a7-4fa1-b307-9191988aa270') then
    raise exception 'P4 archiving Deutsch-Ostafrika dropped its personality link';
  end if;

  -- Lippen sits at its Wikidata coordinates and KEPT its correct country
  if not exists (select 1 from cities c join countries co on co.id = c.country_id
                  where c.id = 'dbb3d43d-5da0-4f43-b5af-c9e0274133c2'
                    and co.code = 'DE'
                    and haversine_m(c.latitude, c.longitude, 51.37920, 14.46390) < 5000) then
    raise exception 'P5 Lippen coordinates or country wrong';
  end if;

  -- the deferred rows are asserted UNTOUCHED, so a later pass cannot quietly sweep them in
  -- without breaking this file's own check
  if not exists (select 1 from cities c join countries co on co.id = c.country_id
                  where c.id = 'e4aad542-deca-4301-89c6-102d963f6e4c' and co.code = 'CN') then
    raise exception 'P6 the Hong Kong shell was changed; it is deferred as a convention decision';
  end if;
  if not exists (select 1 from cities c join countries co on co.id = c.country_id
                  where c.id = '02cf5fc5-4bcb-432c-94fc-ee7a8d983574' and co.code = 'FR') then
    raise exception 'P7 the Saint-Denis Reunion row was changed; it is deferred';
  end if;

  -- positive control: the zeroes above must not be reachable from an empty probe
  select count(*) into v_total from cities
   where data_source = 'personality-birth-place' and duplicate_of_id is null;
  if v_total < 1000 then
    raise exception 'P8 birth-place shell cohort unexpectedly small (%) - probe may be blind', v_total;
  end if;

  raise notice 'all postconditions passed (birth-place shell cohort = % rows)', v_total;
end $verify$;

commit;
