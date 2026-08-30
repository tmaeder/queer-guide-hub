-- Zug was filed in the canton of Zurich, and 40 Swiss cities had no canton at all.
--
-- FOUND BY VERIFYING THE PREVIOUS CHANGE RATHER THAN BY LOOKING FOR IT. After the
-- aids-ch centres were linked, each clinic was measured against the city it had
-- landed on. Every link was inside 11 km and none was over 25 km -- but the worst
-- of them, 10.8 km, was a Zug clinic, and the Zug row read `region_name = 'Zurich'`.
-- Both halves were wrong: Zug is its own canton, and the stored longitude 8.65429
-- sits ~11 km east of the city, which is what inflated the distance. Wikidata
-- Q68144 ("capital of the canton of Zug") puts it at 47.16806/8.51694.
--
-- "IS IT A REAL CANTON NAME" IS NOT THE TEST, which is why this hid. `Zurich` is
-- a perfectly real canton and simply not Zug's, so any check that validates
-- region_name against a vocabulary passes it. The postal directory decides it
-- instead: a city's own postal codes carry a canton, and where they agree on one
-- canton that is the answer. Measured over the 101 Swiss cities decidable that
-- way, exactly ONE disagreed -- this one -- and none of the 45 cities added by
-- 20261102100100 did.
--
-- WHY region_name MATTERS beyond display: guard A of `run_event_city_link`
-- compares `events.state` against `cities.region_name` and BLOCKS when they
-- disagree, which is one of the two guards protecting against the same-name city
-- collisions 20260802090844 records. A wrong canton there is a wrong answer to a
-- safety question, and a missing one is a guard that cannot fire at all -- which
-- is why the 40 nulls are filled in the same pass rather than left as "not
-- wrong, merely absent".
--
-- The 40 are only the cities whose stored postal codes resolve to exactly one
-- canton. Rows whose codes span cantons, or that carry no codes, are left alone:
-- there is no second signal for them here and inventing one is the mistake this
-- whole line of work exists to avoid.

do $$
declare
  v_ch      uuid := (select id from public.countries where code = 'CH');
  v_n       integer;
  v_filled  integer := 0;
  r         record;
begin
  if v_ch is null then
    raise exception 'no country row for CH';
  end if;

  ------------------------------------------------------------------ Zug
  -- Asserted, not assumed: if production has already been corrected, this fails
  -- loudly rather than overwriting someone else's fix with stale coordinates.
  update public.cities c
     set region_name = 'Zug',
         latitude    = 47.16806,
         longitude   = 8.51694,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'region_name', jsonb_build_object(
             'value', 'Zug', 'previous', 'Zurich', 'source', 'geonames-ch-postal-directory',
             'at', now(), 'by', 'migration:20261110110000'),
           'latitude', jsonb_build_object(
             'value', 47.16806, 'previous', 47.2045968, 'source', 'wikidata:Q68144',
             'reason', 'stored point sat ~11 km east of the city',
             'at', now(), 'by', 'migration:20261110110000')),
         updated_at = now()
   where c.country_id = v_ch
     and c.wikidata_qid = 'Q68144'
     and c.region_name = 'Zurich';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'expected exactly one Zug row (Q68144) filed under Zurich, updated %', v_n;
  end if;

  --------------------------------------------------- cantons the directory knows
  for r in
    select * from (values
      ('Aarberg'::text, 'Bern'::text),
      ('Arth', 'Schwyz'),
      ('Balsthal', 'Solothurn'),
      ('Biberist', 'Solothurn'),
      ('Bremgarten bei Bern', 'Bern'),
      ('Brig-Glis', 'Valais'),
      ('Bulle', 'Fribourg'),
      ('Celerina/Schlarigna', 'Grisons'),
      ('Davos', 'Grisons'),
      ('Dietikon', 'Zurich'),
      ('Dübendorf', 'Zurich'),
      ('Ebikon', 'Lucerne'),
      ('Ernen', 'Valais'),
      ('Freienbach', 'Schwyz'),
      ('Fribourg - Freiburg', 'Fribourg'),
      ('Gossau', 'St. Gallen'),
      ('Hunzenschwil', 'Aargau'),
      ('Ingenbohl', 'Schwyz'),
      ('Ittigen', 'Bern'),
      ('Kloten', 'Zurich'),
      ('Lauperswil', 'Bern'),
      ('Lufingen', 'Zurich'),
      ('Martigny', 'Valais'),
      ('Menzingen', 'Zug'),
      ('Mühleberg', 'Bern'),
      ('Münchenstein', 'Basel-Landschaft'),
      ('Neuchâtel', 'Neuchâtel'),
      ('Neuendorf', 'Solothurn'),
      ('Nidau', 'Bern'),
      ('Oberentfelden', 'Aargau'),
      ('Pratteln', 'Basel-Landschaft'),
      ('Reiden', 'Lucerne'),
      ('Rheinfelden', 'Aargau'),
      ('Rorschach', 'St. Gallen'),
      ('Rümlang', 'Zurich'),
      ('Sion', 'Valais'),
      ('Solothurn', 'Solothurn'),
      ('Wängi', 'Thurgau'),
      ('Zofingen', 'Aargau'),
      ('Zollikon', 'Zurich')
    ) as t(name, canton)
  loop
    -- Fill-only. A row that has since acquired a canton keeps it: this pass has
    -- one signal and no standing to overrule a second one it cannot see.
    update public.cities c
       set region_name = r.canton,
           field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
             'region_name', jsonb_build_object(
               'value', r.canton, 'source', 'geonames-ch-postal-directory',
               'rule', 'the single canton this city''s own postal codes resolve to',
               'at', now(), 'by', 'migration:20261110110000')),
           updated_at = now()
     where c.country_id = v_ch
       and c.duplicate_of_id is null
       and lower(c.name) = lower(r.name)
       and c.region_name is null;
    get diagnostics v_n = row_count;
    v_filled := v_filled + v_n;
  end loop;

  raise notice 'swiss cantons: Zug corrected, % of 40 nulls filled', v_filled;

  -------------------------------------------------------------------- assert
  -- Zug specifically, and the invariant the whole migration is for.
  if not exists (
    select 1 from public.cities
     where wikidata_qid = 'Q68144' and region_name = 'Zug'
       and round(longitude::numeric, 3) = 8.517
  ) then
    raise exception 'Zug was not corrected';
  end if;
end $$;
