-- event-city-match resolves a city by NAME ALONE with no country constraint and picks a US
-- namesake. Nine city rows, ten event links; eight of the ten events are live and indexable.
--
-- THE CORROBORATING SIGNAL WAS ON THE ROW THE WHOLE TIME. Seven of the ten events carry a
-- BRITISH POSTCODE and state='England' -- GU11 1SL (Aldershot), SM7 1JH (Banstead),
-- TW20 9HN (Egham x2), EC2A 3NW (Shoreditch), CT5 1DW (Whitstable), WD17 2BD (Elstree),
-- DE1 1LH (Derby) -- while country, country_id and currency all said US/USD. The match did
-- not lack evidence; it never asked.
--
-- This is the rule this repo already states for run_event_city_link and the news linker, on
-- a THIRD writer of events.city_id that nobody had audited: never resolve an entity by name
-- alone when the reference table cannot represent the ambiguity.
--
-- THE COHORT FILTER IS `like 'event-city-match%'`, NOT EQUALITY, AND THAT IS LOAD-BEARING.
-- A first pass used `= 'event-city-match'` and silently dropped every row later promoted to
-- 'event-city-match|promoted-2026-06-06' -- which is where the two WORST rows live, both
-- shell_status='real' and seo_indexable=true where the rest are deindexed placeholders.
-- The corpus-wide postcondition below is what caught it; the per-row measurement could not.
--
-- THE TWO CLASSES NEED OPPOSITE TREATMENTS AND ONLY RESOLVING THE QID SAYS WHICH:
--
--   (A) NAME right, COORDINATES wrong  -> correct the row in place.
--   (B) ROW legitimately correct, EVENT matched onto it by name -> unlink the event.
--
-- Derby and Elstree are the pair that proves the distinction. Derby carries Q755197, which
-- resolves live to "city in New Haven County, Connecticut" (P17=Q30, sitelink
-- "Derby, Connecticut") ~22 km from the row's own coordinates -- so the row IS Derby, CT and
-- the IDAHOBIT event in Derby, ENGLAND is what is misfiled (class B). Elstree carries
-- Q19931, which resolves to "village in the Hertsmere borough of Hertfordshire, England"
-- (P17=Q145) at 51.64,-0.30 -- 6 km from its event -- while the row sits at 34.94,-80.90 in
-- SOUTH CAROLINA, so the identifier and name are right and the coordinates are wrong
-- (class A). Reading only the name, or only the coordinates, gets one of these backwards.
--
-- Class A replacements were each resolved live against Wikidata BY REQUEST, filtered to a
-- settlement P31 class, and corroborated against the event's own coordinates:
--
--   Banstead   Q2280322  town in Reigate and Banstead, Surrey  51.32200,  -0.20400  1.5 km
--   Egham      Q746681   town in Runnymede, Surrey             51.42890,  -0.54790  0.4 km
--   Aldershot  Q646980   town in Hampshire                     51.24833,  -0.76139  0.4 km
--   Whitstable Q964785   town in Kent                          51.36069,   1.02569  0.4 km
--   Addison    Q353089   town in Dallas County, Texas          32.95778, -96.83500  1.0 km
--   Elstree    Q19931    village in Hertsmere, Hertfordshire   51.64000,  -0.30000  6.4 km
--
-- The resolver REJECTED Aldershot, Ontario (Q4713724) at 5737 km on the coordinate arm --
-- the very namesake class that caused this -- which is the positive control that the
-- corroboration does work rather than accepting whatever the name search returned.
--
-- COLLEGE PARK IS DELIBERATELY NOT REPOINTED, and finding that out is why this migration was
-- dry-run before it was trusted. That row serves TWO REAL PLACES: "SEE's Neon Night" (2014)
-- sits at 38.99041,-76.94386 = College Park, MARYLAND, byte-identical to the row's own
-- coordinates and so the row's true identity, while the Pride Night game is at Gateway
-- Center Arena, College Park, GEORGIA. Repointing would have moved the Maryland event to
-- Georgia -- this file's own defect, in the other direction -- and the first dry run caught
-- exactly that, surfacing a survivor the pre-fix measurement could not show because the
-- Maryland event was correctly placed until the repoint stranded it.
--
-- Per 20260802090844 the rule for class B is BLOCK RATHER THAN GUESS: the row stays put and
-- the event is UNLINKED, because a null city_id is recoverable and a wrong one is not. Each
-- unlinked event keeps its own coordinates, state and postcode, so nothing is lost and
-- run_event_city_link -- which has the state guard -- can link it once the right city row
-- exists. Creating those rows (College Park GA, Derby GB) is separate work.
--
-- Londres is handled differently and deliberately: it is the Spanish/French EXONYM for
-- London, and canonical London (GB, 1121 events) already exists, so correcting it in place
-- would mint a second London. Its country is corrected FIRST so the merge is same-country
-- and needs no cross-country override -- fix the wrong fact, then merge -- and the merge is
-- reversible via unmerge_cities.
--
-- Guards are SOFT (every write is keyed on the defect, so a row someone else already fixed
-- is skipped rather than aborting db push for the whole repo); postconditions are HARD.

begin;

-- ------------------------------------------------- 1. class A: correct six rows in place
with fix(id, qid, lat, lon, cc) as (
  values
    ('106ad24f-7e81-4ecd-854f-21fecc465585'::uuid, 'Q2280322', 51.32200::numeric,  -0.20400::numeric, 'GB'),
    ('e50651b5-7b81-403e-b922-258be1ed5711'::uuid, 'Q746681',  51.42890::numeric,  -0.54790::numeric, 'GB'),
    ('968ad3fb-d0cb-4b79-a1eb-e0084c61aa04'::uuid, 'Q646980',  51.24833::numeric,  -0.76139::numeric, 'GB'),
    ('3276d78f-f3a0-4874-a62b-08d4a18d0060'::uuid, 'Q964785',  51.36069::numeric,   1.02569::numeric, 'GB'),
    ('6d9f81a9-bee3-4980-bfa6-a6ff42172308'::uuid, 'Q353089',  32.95778::numeric, -96.83500::numeric, 'US'),
    ('85ced89c-da59-4e8a-a346-4e625ab325b3'::uuid, 'Q19931',   51.64000::numeric,  -0.30000::numeric, 'GB')
)
update cities c
   set latitude     = f.lat,
       longitude    = f.lon,
       country_id   = co.id,
       wikidata_qid = coalesce(c.wikidata_qid, f.qid),
       field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
         'latitude', jsonb_build_object(
            'source', 'wikidata:' || f.qid,
            'by',     'migration:99970901120000',
            'reason', 'event_city_match_name_only_namesake',
            'from',   jsonb_build_object('latitude', c.latitude, 'longitude', c.longitude)))
  from fix f
  join countries co on co.code = f.cc
 where c.id = f.id
   and haversine_m(c.latitude, c.longitude, f.lat, f.lon) > 100000;   -- soft

-- --------------------------------------- 2. class B: block rather than guess (two events)
update events e
   set city_id = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb) || jsonb_build_object(
         'event_city_link', jsonb_build_object(
            'blocked', true,
            'by',      'migration:99970901120000',
            'reason',  'name_only_namesake_collision',
            'detail',  b.detail))
  from (values
    ('baee1b62-2b7b-4dde-9816-e927f6d5d6d2'::uuid, '43f48339-2eb4-4def-811c-5bd8b235929d'::uuid,
     'College Park GA event unlinked from the College Park MD row; no College Park, Georgia city exists'),
    ('d3d204cc-7ab5-4ffa-a95d-b9f267da93b1'::uuid, 'dd4e3e3e-9018-4505-8ece-ada04f084acc'::uuid,
     'Derby England event unlinked from Derby, Connecticut (Q755197); no Derby, England city exists')
  ) b(event_id, wrong_city_id, detail)
 where e.id = b.event_id and e.city_id = b.wrong_city_id;   -- soft

-- the unlinked Derby event is in England and must stop claiming the United States
update events
   set country_id = (select id from countries where code = 'GB'),
       country    = 'GB',
       currency   = 'GBP',
       timezone   = coalesce(timezone, 'Europe/London')
 where id = 'd3d204cc-7ab5-4ffa-a95d-b9f267da93b1'
   and country_id is distinct from (select id from countries where code = 'GB');

-- ------------------------------------------------ 3. Londres: correct country, then merge
update cities
   set country_id = (select id from countries where code = 'GB')
 where id = 'da4f3a14-c321-4c26-b89e-d84aba579c94'
   and country_id is distinct from (select id from countries where code = 'GB');

do $londres$
declare v_keep uuid := 'bfa0a65c-b8c0-4665-8908-19e2553ae262';  -- London, GB
        v_drop uuid := 'da4f3a14-c321-4c26-b89e-d84aba579c94';  -- Londres
begin
  if exists (select 1 from cities where id = v_drop and duplicate_of_id is null) then
    perform merge_cities(v_keep, v_drop, false);
  end if;
end $londres$;

-- ------------------------------------------ 4. re-derive the affected events' geo fields
-- The geo triggers fire on EVENT writes, not on city writes, so correcting the city rows
-- above does not reach the events.
update events e
   set country_id = c.country_id,
       country    = co.code,
       currency   = case when co.code = 'GB' then 'GBP' else e.currency end,
       timezone   = coalesce(e.timezone, case when co.code = 'GB' then 'Europe/London' end)
  from cities c
  join countries co on co.id = c.country_id
 where e.city_id = c.id
   and c.id in ('106ad24f-7e81-4ecd-854f-21fecc465585','e50651b5-7b81-403e-b922-258be1ed5711',
                '968ad3fb-d0cb-4b79-a1eb-e0084c61aa04','3276d78f-f3a0-4874-a62b-08d4a18d0060',
                '85ced89c-da59-4e8a-a346-4e625ab325b3','bfa0a65c-b8c0-4665-8908-19e2553ae262')
   and e.country_id is distinct from c.country_id;

-- ------------------------------------------------------------------ postconditions: HARD
do $verify$
declare v_bad int; v_cohort int;
begin
  -- class A rows sit within 10 km of their Wikidata coordinates, in the right country
  select count(*) into v_bad
  from (values
    ('106ad24f-7e81-4ecd-854f-21fecc465585'::uuid, 51.32200::numeric,  -0.20400::numeric, 'GB'),
    ('e50651b5-7b81-403e-b922-258be1ed5711'::uuid, 51.42890::numeric,  -0.54790::numeric, 'GB'),
    ('968ad3fb-d0cb-4b79-a1eb-e0084c61aa04'::uuid, 51.24833::numeric,  -0.76139::numeric, 'GB'),
    ('3276d78f-f3a0-4874-a62b-08d4a18d0060'::uuid, 51.36069::numeric,   1.02569::numeric, 'GB'),
    ('6d9f81a9-bee3-4980-bfa6-a6ff42172308'::uuid, 32.95778::numeric, -96.83500::numeric, 'US'),
    ('85ced89c-da59-4e8a-a346-4e625ab325b3'::uuid, 51.64000::numeric,  -0.30000::numeric, 'GB')
  ) f(id, lat, lon, cc)
  join cities c  on c.id  = f.id
  join countries co on co.id = c.country_id
  where haversine_m(c.latitude, c.longitude, f.lat, f.lon) > 10000 or co.code <> f.cc;
  if v_bad <> 0 then raise exception 'P1 coords/country not corrected on % row(s)', v_bad; end if;

  -- class B: the two events are unlinked, and the rows they left keep their OWN events
  if exists (select 1 from events
              where id in ('baee1b62-2b7b-4dde-9816-e927f6d5d6d2','d3d204cc-7ab5-4ffa-a95d-b9f267da93b1')
                and city_id is not null) then
    raise exception 'P2 a namesake-collision event is still linked';
  end if;
  select count(*) into v_bad from events where city_id = '43f48339-2eb4-4def-811c-5bd8b235929d';
  if v_bad <> 1 then raise exception 'P3 College Park MD should keep its own 1 event, has %', v_bad; end if;

  -- unlinking must not have destroyed the events' own evidence
  if not exists (select 1 from events where id = 'baee1b62-2b7b-4dde-9816-e927f6d5d6d2'
                   and state = 'Georgia' and postal_code = '30337' and latitude is not null)
    then raise exception 'P4 the College Park GA event lost its own geo evidence'; end if;
  if not exists (select 1 from events e join countries co on co.id = e.country_id
                  where e.id = 'd3d204cc-7ab5-4ffa-a95d-b9f267da93b1'
                    and e.state = 'England' and e.postal_code = 'DE1 1LH' and co.code = 'GB')
    then raise exception 'P5 the Derby GB event lost its evidence or still claims the US'; end if;

  -- Londres is merged away, not merely reparented
  if not exists (select 1 from cities where id = 'da4f3a14-c321-4c26-b89e-d84aba579c94'
                   and duplicate_of_id = 'bfa0a65c-b8c0-4665-8908-19e2553ae262')
    then raise exception 'P6 Londres was not merged into London'; end if;

  -- THE INVARIANT THIS FILE EXISTS FOR, over the CORRECT cohort filter
  select count(*) into v_bad
  from cities c join events ev on ev.city_id = c.id
  where c.data_source like 'event-city-match%' and c.duplicate_of_id is null
    and c.latitude is not null and ev.latitude is not null
    and haversine_m(c.latitude, c.longitude, ev.latitude, ev.longitude) > 100000;
  if v_bad <> 0 then
    raise exception 'P7 still % event(s) over 100km from their event-city-match city', v_bad;
  end if;

  -- corpus-wide: no event anywhere claims the US while carrying an English address
  select count(*) into v_bad
  from events e join countries co on co.id = e.country_id
  where co.code = 'US' and e.state = 'England';
  if v_bad <> 0 then raise exception 'P8 % event(s) still filed US with state=England', v_bad; end if;

  -- positive control: the zeroes above must not be reachable from an empty probe
  select count(*) into v_cohort from cities
   where data_source like 'event-city-match%' and duplicate_of_id is null;
  if v_cohort < 200 then
    raise exception 'P9 event-city-match cohort unexpectedly small (%) - probe may be blind', v_cohort;
  end if;

  raise notice 'all postconditions passed (event-city-match cohort = % rows)', v_cohort;
end $verify$;

commit;
