-- Nine cities on four continents publish a US namesake's facts, and my own part-2
-- predicate in 99991789819768 structurally could not see them.
--
-- THAT PREDICATE REQUIRED BOTH SIDES TO BE US STATES:
--     trim(split_part(wikipedia_title, ',', 2)) in (states)   -- the title names a state
--     AND region_name in (states)                             -- ... and so does the row
-- The second line is what made it blind. It was written for "Columbus, Ohio carries
-- Columbus, Georgia's facts", where both sides are US. It cannot express "Cambridge,
-- ENGLAND carries Cambridge, MASSACHUSETTS's facts", because England is not a US state.
-- The defect is the same one — a row publishing a same-name city's facts — and crossing a
-- national border makes it worse, not better.
--
-- MEASURED ON PROD, all nine `seo_indexable` AND present in `search_documents`, i.e. both
-- reader- and crawler-visible (unlike the part-2 cohort's Washington example, see below):
--
--   Cambridge, England        (UK)        <- Cambridge, Massachusetts   mayor 'Denise Simmons'
--   Worcester, England        (UK)        <- Worcester, Massachusetts   mayor 'Joseph Petty'
--   Victoria, British Columbia(Canada)    <- Victoria, Texas            mayor 'Duane Crocker'
--   Plymouth, England         (UK)        <- Plymouth, Michigan
--   Falmouth, England         (UK)        <- Falmouth, Massachusetts
--   Lewes, England            (UK)        <- Lewes, Delaware
--   Savona, Liguria           (Italy)     <- Savona, New York
--   Fire Island Pines, Valencian Community (Spain) <- Fire Island Pines, New York
--   San Rafael, 13            (Argentina) <- San Rafael, California
--
-- Three of the nine publish A NAMED REAL PERSON as the mayor of a city they have no
-- connection to, on another continent. That is the same reason part 2 retracted `mayor`
-- even where it kept other columns, and it is why this cohort is worth its own migration
-- rather than a note.
--
-- A CORRECTION THIS FILE HAS TO MAKE, because the earlier claim was mine. While tracing
-- this I reported that `/city/washington` was publishing 'Donald Sadler', the mayor of
-- Washington, NORTH CAROLINA, live on prod. That was WRONG. The row carrying it is
-- `washington-us-6cos0`, which has `duplicate_of_id` set — a duplicate of the canonical
-- `washington-d-c`, whose own `mayor` is NULL. 99991789819768 excluded it correctly via
-- `duplicate_of_id is null`, and the city indexer excludes duplicates too, so no reader or
-- crawler ever saw it. The probe that produced the false alarm was
-- `name ilike 'Washington%' and mayor is not null`, which does not filter duplicates —
-- a reminder that a probe needs the same exclusions as the predicate it is checking.
-- The duplicate row is deliberately left alone: it is a redirect, its facts are inert, and
-- rewriting a merged row's columns would touch a merge trail for no reader benefit.
--
-- THE GEORGIA GUARD IS LATENT TODAY, AND SAYING SO IS THE POINT. Dropping the
-- `region_name in (states)` requirement means the predicate now fires on any row whose
-- title tail is a US state name — and `Georgia` is BOTH a US state and a sovereign
-- country, so a city in Georgia the country legitimately carries a title ending in
-- ', Georgia'. Rows whose own country name equals the title tail are excluded, which
-- covers any collision of that shape without naming Georgia.
-- Measured on prod: it currently excludes ZERO rows. So it is not doing work today; it
-- exists because the widening this file performs is what makes that false positive
-- possible in the first place. The run reports the excluded count as a notice, so a later
-- reader can tell a guard that is merely quiet from one that has stopped matching.
--
-- WHAT IS RETRACTED and what is not: exactly the columns part 2 retracted — the facts
-- `city-factual-backfill` sources FROM the wikipedia title. `description`, `population`,
-- coordinates and `timezone` are NOT touched; they come from other sources and are mostly
-- right even here. `wikipedia_title` IS cleared, because leaving it makes the next weekly
-- pass refetch the wrong article and republish everything this file just removed — the
-- Kowloon lesson: nulling an identifier while leaving the cached title keeps producing.
--
-- SOFT ON PRECONDITIONS: the cohort is a live PREDICATE, not a frozen id list, so a row
-- fixed or added between authoring and CI is handled. HARD ON THE POSTCONDITION.
-- REVERSIBLE: every retracted value is preserved under
-- enrichment_status.wikidata_repair_retracted.

do $$
declare
  v_rows int;
  v_leak int;
begin
  perform set_config('app.actor', 'migration:city_facts_cross_country_namesake', true);

  create temporary table _us_states (s text primary key) on commit drop;
  insert into _us_states (s) values
    ('Alabama'),('Alaska'),('Arizona'),('Arkansas'),('California'),('Colorado'),
    ('Connecticut'),('Delaware'),('Florida'),('Georgia'),('Hawaii'),('Idaho'),
    ('Illinois'),('Indiana'),('Iowa'),('Kansas'),('Kentucky'),('Louisiana'),('Maine'),
    ('Maryland'),('Massachusetts'),('Michigan'),('Minnesota'),('Mississippi'),
    ('Missouri'),('Montana'),('Nebraska'),('Nevada'),('New Hampshire'),('New Jersey'),
    ('New Mexico'),('New York'),('North Carolina'),('North Dakota'),('Ohio'),
    ('Oklahoma'),('Oregon'),('Pennsylvania'),('Rhode Island'),('South Carolina'),
    ('South Dakota'),('Tennessee'),('Texas'),('Utah'),('Vermont'),('Virginia'),
    ('Washington'),('West Virginia'),('Wisconsin'),('Wyoming');

  create temporary table _cross (id uuid primary key, nm text, region text, tail text) on commit drop;
  insert into _cross (id, nm, region, tail)
  select ci.id, ci.name, ci.region_name, trim(split_part(ci.wikipedia_title, ',', 2))
    from public.cities ci
    left join public.countries co on co.id = ci.country_id
   where ci.duplicate_of_id is null
     and coalesce(ci.shell_status,'real') not in ('ghost','merged')
     and ci.wikipedia_title like '%,%'
     and trim(split_part(ci.wikipedia_title, ',', 2)) in (select s from _us_states)
     and ci.region_name is not null
     -- the row is NOT in the state its title names ...
     and ci.region_name <> trim(split_part(ci.wikipedia_title, ',', 2))
     -- ... and its region is not a US state either, which is the half 99991789819768
     -- already covered. This file is only the cross-border residue.
     and ci.region_name not in (select s from _us_states)
     -- GEORGIA GUARD: 'Georgia' is a US state AND a country. A city in Georgia the
     -- country legitimately ends its title in ', Georgia'.
     and coalesce(co.name, '') <> trim(split_part(ci.wikipedia_title, ',', 2));

  raise notice 'cross-country namesake rows matched: %', (select count(*) from _cross);

  update public.cities c
     set mayor = null, postal_codes = null, area_codes = null,
         sister_cities = null, universities = null,
         local_language = null, climate_type = null, airport_codes = null,
         wikipedia_title = null,
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb) || jsonb_build_object(
           'wikidata_repair_retracted', jsonb_build_object(
             'reason',          'facts sourced from a same-name city in another country',
             'wrong_title',     c.wikipedia_title,
             'row_region',      x.region,
             'title_names',     x.tail,
             'mayor',           to_jsonb(c.mayor),
             'postal_codes',    to_jsonb(c.postal_codes),
             'area_codes',      to_jsonb(c.area_codes),
             'sister_cities',   to_jsonb(c.sister_cities),
             'universities',    to_jsonb(c.universities),
             'local_language',  to_jsonb(c.local_language),
             'climate_type',    to_jsonb(c.climate_type),
             'airport_codes',   to_jsonb(c.airport_codes),
             'by',              'migration:city_facts_cross_country_namesake',
             'at',              now()
           )),
         updated_at = now()
    from _cross x
   where c.id = x.id
     and (c.mayor is not null or c.postal_codes is not null or c.area_codes is not null
          or c.sister_cities is not null or c.universities is not null
          or c.local_language is not null or c.climate_type is not null
          or c.airport_codes is not null or c.wikipedia_title is not null);
  get diagnostics v_rows = row_count;
  raise notice 'rows whose wrong facts were retracted: %', v_rows;

  -- POSTCONDITION: none of the matched rows may still publish a sourced fact or keep the
  -- title that would refetch them.
  select count(*) into v_leak
    from _cross x join public.cities c on c.id = x.id
   where c.mayor is not null or c.postal_codes is not null or c.area_codes is not null
      or c.wikipedia_title is not null;
  if v_leak > 0 then
    raise exception 'postcondition failed: % cross-country rows still publish a namesake fact', v_leak;
  end if;

  -- Control: this must not have emptied the corpus's mayors. Part 2 already took the
  -- US-internal cohort, so a healthy number here is the rest of the world plus US rows
  -- whose title agrees with their state.
  raise notice 'control — live cities still publishing a mayor: %',
    (select count(*) from public.cities
      where mayor is not null and duplicate_of_id is null
        and coalesce(shell_status,'real') not in ('ghost','merged'));

  -- Control: the Georgia guard must not be vacuous in the other direction — report how
  -- many rows it excluded, so a future reader can tell a working guard from a dead one.
  raise notice 'control — rows excluded by the country/state name collision guard: %',
    (select count(*) from public.cities ci join public.countries co on co.id = ci.country_id
      where ci.duplicate_of_id is null and ci.wikipedia_title like '%,%'
        and trim(split_part(ci.wikipedia_title, ',', 2)) in (select s from _us_states)
        and co.name = trim(split_part(ci.wikipedia_title, ',', 2)));
end $$;
