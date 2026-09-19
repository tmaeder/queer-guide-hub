-- cities.wikidata_qid: 29 live rows point at something that is not a place,
-- and 143 more publish facts belonging to a DIFFERENT city of the same name.
--
-- Swept all 2,318 live city QIDs on 2026-09-18 (duplicate_of_id is null, shell_status not in
-- ghost/merged) and classified by P31 CLASS, not by description prose. Classifying on prose
-- flags Philadelphia ("largest city in the U.S. STATE OF Pennsylvania") and Antwerp, both
-- correct — the words appear in a perfectly good sentence. Class labels do not have that
-- problem. Whitelist polarity, evaluated PER LABEL, mirroring _shared/city-class-guard.ts:
-- a label carrying both a settlement word and a disqualifier ('district capital',
-- 'prefecture-level city') is merely not EVIDENCE and must not veto a clean sibling label.
--
-- ============================ PART 1 — not a place at all ============================
-- 29 rows. What they actually resolve to:
--   Oklahoma City  -> Q180950     the Oklahoma City Thunder BASKETBALL TEAM   (35 venues)
--   Dresden        -> Q119713449  a PAINTING, 'Dresden, Germany, 1945'        (32 venues)
--   Salt Lake City -> Q9668       the 2002 WINTER OLYMPICS                    (30 venues)
--   Cedar Creek    -> Q56507457   a natural WATERCOURSE in South Carolina     (21 venues)
--   Morelia        -> Q119265958  a PAINTING by Cedric Lockwood Morris        (11 venues)
--   Half Moon Bay  -> Q3782546    a BAY                                       (10 venues)
--   Damascus       -> Q119724085  a PAINTING by Amelia Heelas                  (9 venues)
--   Colegiales     -> Q5773072    Club Atletico Colegiales, a FOOTBALL CLUB    (9 venues)
--   City of Albany -> Q105437072  a WIKIMEDIA LIST ARTICLE
--   Mt Shasta      -> Q748355     a STRATOVOLCANO
--   Lake Elmo      -> Q20707495   a LAKE
--   Gays Mills     -> Q49687455   Gays Mills RIDGE, a mountain ridge
-- plus a systematic cluster of ~12 Australian suburbs (Redfern, Coffs Harbour, Ryde, Gosford,
-- Lismore, Pittwater, Point Cook, Blue Mountains, Reservoir, Port Macquarie) resolved to the
-- ELECTORAL DISTRICT of the same name, and the Irish equivalents (Kilmainham, Hacketstown)
-- resolved to electoral divisions. One producer error each, not twelve coincidences.
--
-- TWO ROWS THE DETECTOR FLAGGED ARE NOT DEFECTS and are excluded by QID, with reasons, so a
-- later re-run does not re-propose them:
--   Q14767: Central, Hong Kong — Q14767 IS that place; 'central business district' merely contains the word 'business'
--   Q765811: Sant Jordi de ses Salines — 'single entity of population' (entidad singular de poblacion) is a legitimate Spanish settlement class
--
-- ======================= PART 2 — facts from the wrong same-name city =======================
-- Separately from the class problem, 146 US city rows carry a `wikipedia_title` naming a city
-- in a DIFFERENT US STATE, and 143 of them have already PUBLISHED facts taken from it. Both
-- sides of that comparison are drawn from the same closed vocabulary of state names, so there
-- is no FIPS/sub-national ambiguity of the kind that makes the general title test noisy.
-- Measured: 139 postal_codes, 114 area_codes, 48 named mayors, 22 sister_cities, 23 universities.
--
--   Washington, D.C. -> title 'Washington, North Carolina', mayor 'Donald Sadler', 27889 / 252
--   Columbus, Ohio   -> title 'Columbus, Georgia', mayor 'B. H. "Skip" Henderson III',
--                       6 postal codes, 2 universities and 4 sister cities, all Georgia's
--   Saint Paul, MN   -> title 'Saint-Paul, Reunion', mayor 'Joseph Sinimale', Reunion postcodes
--   Atlanta, GA      -> title 'Atlanta, Texas', 75551 / 903
--   Nashville, TN    -> title 'Nashville, North Carolina', 27856 / 252
--
-- Publishing a NAMED REAL PERSON as the mayor of a city they have no connection to is the
-- sharpest of these, which is why the mayor column is retracted even where the rest is kept.
--
-- WHY RETRACT THE FACTS AND NULL THE IDENTIFIER, RATHER THAN REPOINT
-- Prefer null to a guess (20261008100000). `city_factual_sparql` and `city-corroboration`
-- rebuild facts FROM the identifier on a schedule, so a plausible-but-wrong QID regenerates
-- wrong data forever while a null one regenerates nothing. Re-resolving 175 cities correctly is
-- an editorial pass with its own verification, not a side effect of this file.
--
-- WHAT IS DELIBERATELY NOT TOUCHED
-- * `description`, `population`, coordinates, `timezone` — these come from other sources
--   (the dr5hn gazetteer, city centroids) and are mostly CORRECT even on these rows. Dresden's
--   population is right; a painting has no population, so it cannot have supplied it. Blanket
--   retraction would destroy good data to fix a different field's problem.
-- * The 125 'wrong level' rows (county/district/Ortsteil) and the 46 'name disagrees' rows.
--   Roughly a third of each is CORRECT as it stands — the first contains legitimate foreign
--   settlement classes our English whitelist does not know (kelurahan, kecamatan, tambon,
--   concejo), the second is mostly exonyms (Luzern->Lucerne, Hannover->Hanover, Gent->Ghent,
--   Ciudad de Mexico->Mexico City). A blanket pass there would condemn correct data, which is
--   the reason 20261008100000 refused to auto-clear the concept class. They need a human.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS.
-- REVERSE: prior values are preserved under field_provenance.<field>.retracted and
-- enrichment_status.wikidata_repair.

do $$
declare
  v_expected int := 29;
  v_cleared int; v_skipped int; v_facts int; v_leak int;
begin
  perform set_config('app.actor', 'migration:city_wikidata_not_a_place', true);

  ---------------------------------------------------------------------------
  -- PART 1
  ---------------------------------------------------------------------------
  create temporary table _bad_city (id uuid, qid text, nm text, what text) on commit drop;
  insert into _bad_city (id, qid, nm, what) values
    ('89018aff-db7c-423b-a136-9112424bdb25'::uuid, 'Q48851509', 'Gran Canaria', 'Gran Canaria [electoral unit]'),
    ('c5b96ee5-8802-49e2-b13c-535bf54dd8b9'::uuid, 'Q180950', 'Oklahoma City', 'Oklahoma City Thunder [basketball team]'),
    ('fd373c03-e44f-4d09-8462-0b0f4ae2467f'::uuid, 'Q119713449', 'Dresden', 'Dresden, Germany, 1945 [painting]'),
    ('cc981583-5655-478d-8c1e-66b1495a42b0'::uuid, 'Q9668', 'Salt Lake City', '2002 Winter Olympics [Winter Olympic Games edition,internati]'),
    ('aa69b0e2-1468-44be-84e7-625380606992'::uuid, 'Q56507457', 'Cedar Creek', 'Cedar Creek [natural watercourse]'),
    ('8ca98445-ce63-4a19-980f-785ed9d90bdb'::uuid, 'Q59721192', 'Kilmainham', 'Kilmainham [electoral division]'),
    ('acd6c6f3-d0f9-4f52-b057-d63eda73ef2b'::uuid, 'Q119265958', 'Morelia', 'Morelia, Mexico [painting]'),
    ('bf46f7c0-ba03-4a38-8809-a1c1f941727a'::uuid, 'Q3782546', 'Half Moon Bay', 'Half Moon Bay [bay]'),
    ('843d2ca1-3e11-4efd-a259-e56dfc4130f4'::uuid, 'Q5773072', 'Colegiales', 'Club Atlético Colegiales (Concordia) [association football club]'),
    ('bc3262b9-9db1-4296-92c7-7d36a12bd14e'::uuid, 'Q119724085', 'Damascus', 'Damascus, Syria [painting]'),
    ('36cf97a7-b659-4dd6-8307-b9e8e8b2b50e'::uuid, 'Q1008318', 'Koblenz', 'Koblenz [federal electoral district of Germany]'),
    ('ba0712ea-73aa-4a9f-b202-2cc5d1272b4a'::uuid, 'Q5355889', 'Redfern', 'Redfern [electoral district of New South Wales]'),
    ('a5a4c512-f9c4-4954-8de4-ed08d3d96e7b'::uuid, 'Q49687455', 'Gays Mills', 'Gays Mills Ridge [mountain ridge]'),
    ('de0cd018-7e13-4283-8a16-4e0d3fb8c19b'::uuid, 'Q56295945', 'Queen''s Gate', 'Queen''s Gate [ward or electoral division of the Unit]'),
    ('ba24a9a2-9421-42ee-9cf1-dfa9589ec1e5'::uuid, 'Q105437072', 'City of Albany', 'list of State Register of Heritage Places in the City of Albany [Wikimedia list article]'),
    ('3e43c12b-ac3a-4096-b803-6743ea94e580'::uuid, 'Q5355255', 'Coffs Harbour', 'Coffs Harbour [electoral district of New South Wales]'),
    ('9ce5f2b9-42ed-460e-b9af-126de5ec0aa5'::uuid, 'Q20707495', 'Lake Elmo', 'Lake Elmo [lake]'),
    ('ba1615b3-dbf2-4c84-9d99-84dd78d6f488'::uuid, 'Q49865278', 'Boulder Creek', 'Boulder Creek [stream,watercourse]'),
    ('43a8d4e2-448e-4ed7-88c3-19af5c4cad07'::uuid, 'Q5355891', 'Reservoir', 'Reservoir [electoral district of Victoria]'),
    ('f1bd5fbf-a140-4a22-b19e-a443426b1c91'::uuid, 'Q5355920', 'Ryde', 'Ryde [electoral district of New South Wales]'),
    ('34148ec5-c462-41c2-9799-cf839e567385'::uuid, 'Q5355131', 'Blue Mountains', 'Blue Mountains [electoral district of New South Wales]'),
    ('fc1f386d-b453-4bfa-940a-4c8fcb72eab6'::uuid, 'Q5355461', 'Gosford', 'Gosford [electoral district of New South Wales]'),
    ('667fb3a6-efa2-4fad-be93-6199463545e7'::uuid, 'Q59718617', 'Hacketstown', 'Hacketstown [electoral division]'),
    ('8792e77d-ab82-4e2f-8450-43a0bae0e594'::uuid, 'Q5355600', 'Lismore', 'Lismore [electoral district of New South Wales]'),
    ('a816a7b6-4ebe-433e-a825-708193f6f256'::uuid, 'Q748355', 'Mt Shasta', 'Mount Shasta [stratovolcano,mountain]'),
    ('b4c10beb-d335-4cdd-8a6c-42a14ff2b1b2'::uuid, 'Q5355858', 'Pittwater', 'Pittwater [electoral district of New South Wales]'),
    ('19bc6c53-c019-4672-80a8-6d5a22369f00'::uuid, 'Q109297676', 'Point Cook', 'Point Cook [electoral district of Victoria]'),
    ('1563b130-b346-4672-84f1-7a3f823b9676'::uuid, 'Q7495691', 'Sheung Wan', 'Sheung Wan [Council Constituency of Central and We]'),
    ('6bd3233f-cf27-4079-a725-abe560644507'::uuid, 'Q5355868', 'Port Macquarie', 'Port Macquarie [electoral district of New South Wales]');

  select count(*) into v_skipped
    from _bad_city b join public.cities c on c.id = b.id
   where c.wikidata_qid is distinct from b.qid;
  raise notice 'rows whose QID moved since the sweep, skipped: %', v_skipped;

  update public.cities c
     set wikidata_qid   = null,
         wikipedia_title = null,
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb) || jsonb_build_object(
           'wikidata_repair', jsonb_build_object(
             'cleared_qid', b.qid, 'resolved_to', b.what,
             'reason', 'not a place: no settlement class in P31',
             'by', 'migration:city_wikidata_not_a_place', 'at', now())),
         updated_at = now()
    from _bad_city b
   where c.id = b.id and c.wikidata_qid = b.qid;
  get diagnostics v_cleared = row_count;
  raise notice 'part 1 identifiers cleared: % of % expected', v_cleared, v_expected;

  ---------------------------------------------------------------------------
  -- PART 2 — predicate-computed, never a frozen id list, so it self-corrects
  ---------------------------------------------------------------------------
  create temporary table _wrong_state on commit drop as
  with states(s) as (values ('Alabama'),('Alaska'),('Arizona'),('Arkansas'),('California'),
   ('Colorado'),('Connecticut'),('Delaware'),('Florida'),('Georgia'),('Hawaii'),('Idaho'),
   ('Illinois'),('Indiana'),('Iowa'),('Kansas'),('Kentucky'),('Louisiana'),('Maine'),('Maryland'),
   ('Massachusetts'),('Michigan'),('Minnesota'),('Mississippi'),('Missouri'),('Montana'),
   ('Nebraska'),('Nevada'),('New Hampshire'),('New Jersey'),('New Mexico'),('New York'),
   ('North Carolina'),('North Dakota'),('Ohio'),('Oklahoma'),('Oregon'),('Pennsylvania'),
   ('Rhode Island'),('South Carolina'),('South Dakota'),('Tennessee'),('Texas'),('Utah'),
   ('Vermont'),('Virginia'),('Washington'),('West Virginia'),('Wisconsin'),('Wyoming'),
   ('District of Columbia'))
  select ci.id, ci.wikidata_qid, ci.wikipedia_title,
         trim(split_part(ci.wikipedia_title, ',', 2)) as qual
    from public.cities ci
    join public.countries co on co.id = ci.country_id and co.name = 'United States'
   where ci.wikipedia_title like '%,%'
     and ci.duplicate_of_id is null
     and coalesce(ci.shell_status,'real') not in ('ghost','merged')
     and trim(split_part(ci.wikipedia_title, ',', 2)) in (select s from states)
     and ci.region_name in (select s from states)
     and trim(split_part(ci.wikipedia_title, ',', 2)) <> ci.region_name;

  raise notice 'part 2 wrong-state rows matched: %', (select count(*) from _wrong_state);

  update public.cities c
     set postal_codes = null, area_codes = null, mayor = null,
         sister_cities = null, universities = null, local_language = null,
         climate_type = null, airport_codes = null,
         wikidata_qid = null, wikipedia_title = null,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'wikidata_repair_retracted', jsonb_build_object(
             'postal_codes', to_jsonb(c.postal_codes), 'area_codes', to_jsonb(c.area_codes),
             'mayor', to_jsonb(c.mayor), 'sister_cities', to_jsonb(c.sister_cities),
             'universities', to_jsonb(c.universities), 'local_language', to_jsonb(c.local_language),
             'climate_type', to_jsonb(c.climate_type), 'airport_codes', to_jsonb(c.airport_codes),
             'from_qid', c.wikidata_qid, 'from_title', c.wikipedia_title,
             'reason', 'wikipedia_title named a city in a different US state',
             'by', 'migration:city_wikidata_not_a_place', 'at', now())),
         updated_at = now()
    from _wrong_state w
   where c.id = w.id
     and (c.postal_codes is not null or c.area_codes is not null or c.mayor is not null
          or c.sister_cities is not null or c.universities is not null
          or c.local_language is not null or c.climate_type is not null
          or c.airport_codes is not null);
  get diagnostics v_facts = row_count;
  raise notice 'part 2 rows whose wrong facts were retracted: %', v_facts;

  ---------------------------------------------------------------------------
  -- Postconditions, stated positively.
  ---------------------------------------------------------------------------
  -- Scoped to the value the sweep VERIFIED, not to `is not null`. The UPDATE above
  -- deliberately SKIPS a row whose QID moved since the sweep — the soft-precondition
  -- rule this file's header states — and an unscoped assertion then RAISEs on exactly
  -- that row, aborting `db push` for every migration queued behind this one. What this
  -- file promises is that the WRONG identifier is gone; a row a concurrent session
  -- repointed correctly is a better outcome, not a failure.
  select count(*) into v_leak
    from _bad_city b join public.cities c on c.id = b.id
   where c.wikidata_qid = b.qid;
  if v_leak > 0 then
    raise exception 'postcondition failed: % part-1 cities still carry a non-place QID', v_leak;
  end if;

  select count(*) into v_leak
    from _wrong_state w join public.cities c on c.id = w.id
   where c.mayor is not null or c.postal_codes is not null or c.area_codes is not null;
  if v_leak > 0 then
    raise exception 'postcondition failed: % part-2 cities still publish wrong-city facts', v_leak;
  end if;

  -- Controls. If either collapses the predicate was wrong and we have stripped good data.
  raise notice 'live cities still carrying a QID (expect ~2130): %',
    (select count(*) from public.cities
      where wikidata_qid ~ '^Q[0-9]+$' and duplicate_of_id is null
        and coalesce(shell_status,'real') not in ('ghost','merged'));
  raise notice 'live cities still publishing a mayor (expect >0): %',
    (select count(*) from public.cities where mayor is not null and duplicate_of_id is null);
end $$;
