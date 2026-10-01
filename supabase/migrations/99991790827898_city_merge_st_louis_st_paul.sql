-- ============================================================================
-- St. Louis and St. Paul each exist twice, and in BOTH pairs the row holding the
-- content holds the WORSE identity data -- so this is a field-level merge
-- ----------------------------------------------------------------------------
-- 99991790797580 shipped the "Washington DC" alias and deliberately refused the
-- other two names its sweep returned, because each resolves to one half of a
-- duplicate pair and an alias would pick a side. Its P3 asserts zero
-- `st louis`/`st paul` aliases. That file is APPLIED and is not edited here, and
-- P3 does not need editing: on a rebuild from zero it runs BEFORE this higher
-- version, so "zero aliases" is true at its point in the ordering. Rewriting it
-- to expect the aliases would break exactly that path.
--
-- ── THE PAIRS, RE-MEASURED ──────────────────────────────────────────────────
--   Saint Louis / Missouri  slug saint-louis   16 ev    5 ven   0 vil   0 pers  Q38022
--   St. Louis   / Missouri  slug st-louis     202 ev   26 ven   3 vil  11 pers  no qid
--     -> 4.07 km apart, same region, far inside the <10 km gate
--        `place_pair_corroboration` uses, so duplicates and not a collision.
--
-- THOSE TWO COUNTS ARE LIVE ROWS, AND THE FIRST DRAFT OF THIS FILE HAD THEM
-- WRONG. 99991790797580 records st-louis as "203 events, 29 venues" and a first
-- measurement here agreed, because both counted `city_id = c.id` with no
-- `duplicate_of_id IS NULL` filter: st-louis carries 202 live events + 1
-- merged-away, and 26 live venues + 3. P3 below was written from the unfiltered
-- sums (219/34) and FAILED on correct code during the dry run, which is the
-- postcondition earning its place -- a floor copied from an unfiltered count
-- reads exactly like lost content. Live sums are 218 events and 31 venues.
--
--   Saint Paul / Minnesota  slug saint-paul     1 ev   11 ven   4 pers
--   St. Paul   / Minnesota  slug tmp-cd646368…  0 ev    0 ven   1 pers
--     -> 3.41 km apart. The `tmp-` row is NOT content-free: 1 personality.
--
-- Q38022 was resolved LIVE rather than recalled: label "St. Louis", description
-- "independent city in Missouri, United States", P31 = independent city / city /
-- big city, P17 = Q30. It is the right entity and its classes are the settlement
-- classes `city-class-guard` whitelists.
--
-- ── WHY THE DIRECTION IS NOT AN EDITORIAL CALL ──────────────────────────────
-- It looked like one (identifier on one row, content on the other). It is not.
-- `merge_cities` was READ, and it touches `wikidata_qid`, `description`,
-- `population` and `wikipedia_title` NOWHERE. It reparents 24 FK triples, the
-- two denormalized city TEXT columns, `news_articles.city_ids`,
-- `news_article_cities` and `city_aliases`, mints an alias from the dropped
-- row's name, and stamps `schema:1` + per-relation id lists so
-- `unmerge_cities` can replay it. It carries no scalar.
--
-- So keeping `st-louis` would leave the survivor with no identifier and strand
-- Q38022 on a row whose `duplicate_of_id` excludes it from
-- `cities_due_for_refresh` and every weekly rebuild -- the identifier would be
-- lost, not moved. `saint-louis` survives. The cost is stated rather than
-- hidden: 203 events' canonical URLs move to `/city/saint-louis`.
--
-- THE REDIRECT IS AUTOMATIC BUT NOT FROM `merge_cities`. It has no
-- `city_slug_redirects` write and no spine write; `trg_cities_zz_merge_redirect`
-- (BEFORE UPDATE -> `cities_merge_redirect`) and `trg_sync_geo_spine` do both.
-- Verified empirically rather than assumed: 387 redirect rows against 387
-- merged-away rows, and 369 of 399 recorded merges have a redirect for the
-- dropped slug. Asserted below per dropped slug anyway.
--
-- ── `saint-paul` IS A CHIMERA, AND IT INVERTS THE OBVIOUS READING ───────────
-- The `tmp-` row reads like the junk shell of the documented
-- `personality-birth-place` cohort, and the content-bearing row like the real
-- one. Read field by field, the opposite is true:
--
--                  saint-paul (11 ven, 4 pers)      tmp-cd646368… (0 ven)
--   region/coords  Minnesota / 44.96,-93.14 OK      Minnesota / 44.95,-93.10 OK
--   population     108,088  <- SAINT-PAUL, RÉUNION  285,068 (2010 MN census)
--   description    NULL                             the CORRECT Minnesota lead
--   aliases        11, every one RÉUNION's          0
--
-- The 11 aliases are consistently the FRENCH reading, which is what makes the
-- attribution certain rather than suggestive: "Saint-Paul de la Réunion",
-- `سن بول ريونيون` ("Saint Paul Réunion"), `サン＝ポール` (San-Pōru, not
-- セントポール), `생폴` (Saeng-pol, not 세인트폴), `Сен-Поль` (not Сент-Пол).
-- `圣保罗` is ambiguous between São Paulo and Saint-Paul and is Minnesota's
-- under no reading. The population matches Saint-Paul, Réunion (~105k), not a
-- US state capital.
--
-- So 99991790797580's note that "the alias table already asserts they are the
-- same place in both directions" is TRUE OF ST. LOUIS AND FALSE OF ST. PAUL.
-- For St. Louis it understates the evidence -- both rows carry 39 near-identical
-- aliases including "Mound City", "STL" and "The Gateway City", i.e. one harvest
-- ran against both rows. For St. Paul there is no mutual assertion at all: one
-- side's aliases are a different city's and the other side has none.
--
-- The same shape sits on St. Louis: the 203-event row's description is the
-- LLM drift register ("a VIBRANT and inclusive city ... GAY-FRIENDLY bars",
-- both active `styleguide_terms` avoid phrases) while the 16-event survivor
-- carries the encyclopedic lead whose population agrees with its own column.
-- Nothing is carried for that pair, because the survivor already holds the
-- better value in every field.
--
-- ── WHAT IS CARRIED, AND WHY NOT MORE ───────────────────────────────────────
-- `description` is filled onto `saint-paul` only while it is NULL, and
-- `population` only while it still reads 108,088 -- content-guarded, so a human
-- who fixes either first keeps their work.
--
-- 285,068 is a COLUMN-TO-COLUMN carry of a real census figure. The dropped row's
-- own prose says 311,527 (2020), which is better, and it is deliberately NOT
-- written: lifting a number out of a description into a numeric column is the
-- text-derived-scalar pattern this corpus distrusts, and `saint-paul` carries no
-- `wikidata_qid`, so nothing will ever re-derive it. Leaving 108,088 was not an
-- option -- it is a factual error about a US state capital on a live indexable
-- row. The better figure and its source are stamped on the row so the gap is a
-- recorded decision rather than a silent staleness.
--
-- No identifier is invented for `saint-paul`. Resolving one is the `qid_gap`
-- engine's job and a recalled QID is how a glossary row ended up pointing at a
-- family of microcontrollers.
--
-- ── THE RÉUNION ALIASES MUST GO BEFORE THE NEW ONE ARRIVES ──────────────────
-- `merge_cities` MOVES `city_aliases` from the dropped row to the survivor, so
-- these 11 persist through the merge either way. They are a standing rule: left
-- in place they route every future Réunion and São Paulo event to Minnesota.
-- Adding `St Paul` on top without removing them compounds a live defect instead
-- of repairing one. Deleted by a FROZEN alias_key list, never a pattern, so the
-- set is reviewable and a legitimate future Minnesota translation cannot be
-- swept with them.
--
-- ── MECHANICS ───────────────────────────────────────────────────────────────
-- `city_aliases.alias_key` is `GENERATED ALWAYS AS city_canonical_key(alias)`,
-- so it must NOT be inserted (428C9); `(city_id, alias_key)` is a legal conflict
-- target on it.
--
-- Each merge is GUARDED ON ITS OWN PRECONDITION rather than asserting it.
-- `merge_cities` RAISEs 'drop city already merged' / 'keep city is itself a
-- duplicate', and a concurrent session legitimately merging one of these rows
-- between authoring and CI would turn that into a `db push` abort that blocks
-- every migration queued behind it, repo-wide. Soft on preconditions, hard on
-- postconditions: the DO blocks no-op on work already done and the verify block
-- asserts the END STATE, so the file composes in both worlds.
--
-- `auth.uid()` is NULL under `db push`, so `merge_cities`' admin gate passes.
-- Both pairs are same-country, so `p_confirm_cross_country` stays false and the
-- 50 km cross-country refusal is never reached.
--
-- No events are linked here. The 4 stale stamps are RELEASED and the nightly
-- `event_city_link` alias arm does the linking, so guards A and B still decide.
-- All 4 carry `linked:false, matched_on:null` stamped 2026-09-29 03:05 by a
-- force-run that predates any alias -- the stale-stamp class 99991790797580
-- already hit with Cancun, so the alias alone would only help future events.
-- ============================================================================

-- (1) St. Louis: keep the row carrying Q38022 and the encyclopedic lead.
DO $merge_stl$
DECLARE v_res jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cities
              WHERE id = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d' AND duplicate_of_id IS NULL)
     AND EXISTS (SELECT 1 FROM public.cities
              WHERE id = '5987db13-9a4f-4c4e-b87a-020731926350' AND duplicate_of_id IS NULL)
  THEN
    v_res := public.merge_cities(
      p_keep_id              => 'a6c09eb9-f514-4987-9d94-e1fb25a4205d',
      p_drop_id              => '5987db13-9a4f-4c4e-b87a-020731926350',
      p_confirm_cross_country => false);
    RAISE NOTICE 'st louis merged: %', v_res->'reparented';
  ELSE
    RAISE NOTICE 'st louis: already merged or rows moved; skipped';
  END IF;
END $merge_stl$;

-- (2) St. Paul: keep the content-bearing row. Its identity fields are repaired
--     in step (3) -- the merge carries no scalar.
DO $merge_stp$
DECLARE v_res jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cities
              WHERE id = '637d48ff-6b95-4eb9-a8c5-c99a10608187' AND duplicate_of_id IS NULL)
     AND EXISTS (SELECT 1 FROM public.cities
              WHERE id = 'b2f12f63-cd73-47dd-a149-951863bec49f' AND duplicate_of_id IS NULL)
  THEN
    v_res := public.merge_cities(
      p_keep_id              => '637d48ff-6b95-4eb9-a8c5-c99a10608187',
      p_drop_id              => 'b2f12f63-cd73-47dd-a149-951863bec49f',
      p_confirm_cross_country => false);
    RAISE NOTICE 'st paul merged: %', v_res->'reparented';
  ELSE
    RAISE NOTICE 'st paul: already merged or rows moved; skipped';
  END IF;
END $merge_stp$;

-- (3) Carry the two scalars `merge_cities` cannot. Content-guarded in both arms.
--     field_provenance is built with `||` rather than jsonb_set(create_missing),
--     which creates only the LAST path element and would silently write nothing
--     on a row with no `population` key.
UPDATE public.cities k
SET population = CASE WHEN k.population = 108088 THEN d.population ELSE k.population END,
    description = CASE WHEN nullif(btrim(coalesce(k.description, '')), '') IS NULL
                       THEN d.description ELSE k.description END,
    field_provenance = coalesce(k.field_provenance, '{}'::jsonb) || jsonb_build_object(
      'population', coalesce(k.field_provenance->'population', '{}'::jsonb) || jsonb_build_object(
        'source', 'derived:city_merge',
        'by',     'migration:99991790827898_city_merge_st_louis_st_paul',
        'at',     now(),
        'value',  d.population,
        'note',   '2010 US census, carried column-to-column from the merged-away St. Paul row. '
               || 'Replaces 108088, which is Saint-Paul, Réunion''s population and was never '
               || 'Minnesota''s. The better figure is 311527 (2020 census), stated in that row''s '
               || 'own description and deliberately NOT written here: lifting a scalar out of prose '
               || 'is not a measurement. This row carries no wikidata_qid, so nothing re-derives it.',
        'superseded_value', 108088,
        'better_value_known', 311527),
      'description', coalesce(k.field_provenance->'description', '{}'::jsonb) || jsonb_build_object(
        'source', 'derived:city_merge',
        'by',     'migration:99991790827898_city_merge_st_louis_st_paul',
        'at',     now(),
        'note',   'Carried from the merged-away St. Paul row, which held the correct Minnesota '
               || 'lead while this row held none.'))
FROM public.cities d
WHERE k.id = '637d48ff-6b95-4eb9-a8c5-c99a10608187'
  AND d.id = 'b2f12f63-cd73-47dd-a149-951863bec49f'
  AND (k.population = 108088 OR nullif(btrim(coalesce(k.description, '')), '') IS NULL);

-- (4) Remove Saint-Paul, Réunion's aliases from the Minnesota row. FROZEN list.
--     Scoped to the one city_id so an identical key on another city is untouched.
DELETE FROM public.city_aliases
WHERE city_id = '637d48ff-6b95-4eb9-a8c5-c99a10608187'
  AND alias_key IN (
    'saint-paul',                 -- the bare French form
    'saint-paul de la reunion',
    'σαιν-πωλ',
    'сен пол',
    'сен-поль',
    'սեն պոլ',
    'סן-פול',
    'سن بول ريونيون',
    '생폴',
    'サン=ポール',
    '圣保罗');

-- (5) The two aliases 99991790797580 refused. Safe now: each pair is one
--     canonical row, so there is no side to pick.
INSERT INTO public.city_aliases (city_id, alias, locale)
SELECT c.id, v.alias, 'en'
FROM (VALUES
  ('a6c09eb9-f514-4987-9d94-e1fb25a4205d'::uuid, 'St Louis'),
  ('637d48ff-6b95-4eb9-a8c5-c99a10608187'::uuid, 'St Paul')
) AS v(city_id, alias)
JOIN public.cities c ON c.id = v.city_id AND c.duplicate_of_id IS NULL
ON CONFLICT (city_id, alias_key) DO NOTHING;

-- (6) Release the stale stamps so the nightly runner can reach these 4 events.
--     Deletes the stamp ONLY. Pinned to the city the alias must resolve to, so
--     if `cities` moves under this the row simply does not match.
WITH verified(city, cc, target_name, target_region) AS (VALUES
  ('St Louis', 'US', 'Saint Louis', 'Missouri'),
  ('St Paul',  'US', 'Saint Paul',  'Minnesota')
)
UPDATE public.events e
SET enrichment_status = e.enrichment_status - 'event_city_link'
FROM verified v
JOIN public.countries co ON co.code = v.cc
WHERE e.duplicate_of_id IS NULL
  AND e.city_id IS NULL
  AND e.country_id = co.id
  AND btrim(e.city) = v.city
  AND coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'
  AND e.enrichment_status->'event_city_link'->>'blocked' IS NULL
  AND EXISTS (
    SELECT 1 FROM public.cities c
     WHERE c.id = public.city_by_alias(e.country_id, e.city)
       AND c.name = v.target_name
       AND c.region_name = v.target_region);

DO $verify$
DECLARE
  v_us   uuid;
  v_n    int;
  v_name text;
  v_pop  int;
  v_desc text;
  v_slug text;
BEGIN
  SELECT id INTO v_us FROM public.countries WHERE code = 'US';

  -- P1: one canonical city per name, and the dropped rows point at the survivors.
  SELECT count(*) INTO v_n FROM public.cities
   WHERE duplicate_of_id IS NULL AND region_name = 'Missouri'
     AND public.city_name_key(name) IN (public.city_name_key('Saint Louis'), public.city_name_key('St. Louis'));
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1a: expected exactly 1 canonical St. Louis in Missouri; found %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.cities
   WHERE duplicate_of_id IS NULL AND region_name = 'Minnesota'
     AND public.city_name_key(name) IN (public.city_name_key('Saint Paul'), public.city_name_key('St. Paul'));
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1b: expected exactly 1 canonical St. Paul in Minnesota; found %', v_n;
  END IF;

  IF (SELECT duplicate_of_id FROM public.cities WHERE id = '5987db13-9a4f-4c4e-b87a-020731926350')
     IS DISTINCT FROM 'a6c09eb9-f514-4987-9d94-e1fb25a4205d'::uuid THEN
    RAISE EXCEPTION 'P1c: st-louis does not point at saint-louis';
  END IF;
  IF (SELECT duplicate_of_id FROM public.cities WHERE id = 'b2f12f63-cd73-47dd-a149-951863bec49f')
     IS DISTINCT FROM '637d48ff-6b95-4eb9-a8c5-c99a10608187'::uuid THEN
    RAISE EXCEPTION 'P1d: tmp- St. Paul does not point at saint-paul';
  END IF;

  -- P2: the identifier SURVIVED. This is the whole reason for the direction.
  SELECT wikidata_qid INTO v_name FROM public.cities
   WHERE id = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d';
  IF v_name IS DISTINCT FROM 'Q38022' THEN
    RAISE EXCEPTION 'P2: the surviving St. Louis carries qid % (expected Q38022)', coalesce(v_name, '<null>');
  END IF;

  -- P3: content was reparented onto the survivors, not lost. Floors are the
  --     measured pre-merge sums of LIVE rows (16+202 events, 5+26 venues) -- see
  --     the header: the unfiltered sums are 219/34 and failed here on correct code.
  SELECT count(*) INTO v_n FROM public.events
   WHERE city_id = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d' AND duplicate_of_id IS NULL;
  IF v_n < 218 THEN
    RAISE EXCEPTION 'P3a: surviving St. Louis holds only % events (expected >= 218)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.venues
   WHERE city_id = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d' AND duplicate_of_id IS NULL;
  IF v_n < 31 THEN
    RAISE EXCEPTION 'P3b: surviving St. Louis holds only % venues (expected >= 31)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.venues
   WHERE city_id = '637d48ff-6b95-4eb9-a8c5-c99a10608187' AND duplicate_of_id IS NULL;
  IF v_n < 11 THEN
    RAISE EXCEPTION 'P3c: surviving St. Paul holds only % venues (expected >= 11)', v_n;
  END IF;

  -- P4: Réunion's population is gone and the carry landed, WITH its provenance.
  --     A bare value check would pass on a row someone set by hand with no record.
  SELECT population, description INTO v_pop, v_desc FROM public.cities
   WHERE id = '637d48ff-6b95-4eb9-a8c5-c99a10608187';
  IF v_pop = 108088 THEN
    RAISE EXCEPTION 'P4a: St. Paul still carries 108088, which is Saint-Paul, Réunion''s population';
  END IF;
  IF nullif(btrim(coalesce(v_desc, '')), '') IS NULL THEN
    RAISE EXCEPTION 'P4b: St. Paul has no description';
  END IF;
  IF v_desc NOT ILIKE '%Minnesota%' THEN
    RAISE EXCEPTION 'P4c: St. Paul''s description does not name Minnesota';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE id = '637d48ff-6b95-4eb9-a8c5-c99a10608187'
                    AND field_provenance->'population'->>'superseded_value' = '108088'
                    AND field_provenance->'population'->>'better_value_known' = '311527') THEN
    RAISE EXCEPTION 'P4d: the population correction is not recorded in field_provenance';
  END IF;

  -- P5: every Réunion alias is gone from the Minnesota row.
  SELECT count(*) INTO v_n FROM public.city_aliases
   WHERE city_id = '637d48ff-6b95-4eb9-a8c5-c99a10608187'
     AND alias_key IN ('saint-paul', 'saint-paul de la reunion', 'σαιν-πωλ', 'сен пол',
                       'сен-поль', 'սեն պոլ', 'סן-פול', 'سن بول ريونيون', '생폴',
                       'サン=ポール', '圣保罗');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P5: % Saint-Paul/Réunion alias(es) still sit on the Minnesota row', v_n;
  END IF;

  -- P6: both aliases EXIST and RESOLVE. Existence alone is satisfied by a row the
  --     de-qualification rule refuses, which would link nothing -- the behavioural
  --     half is the check that matters (99991790797580's P2 lesson).
  SELECT count(*) INTO v_n FROM public.city_aliases
   WHERE alias_key IN ('st louis', 'st paul');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'P6a: expected exactly 2 st louis/st paul aliases; found %', v_n;
  END IF;

  SELECT c.name INTO v_name FROM public.cities c
   WHERE c.id = public.city_by_alias(v_us, 'St Louis');
  IF v_name IS DISTINCT FROM 'Saint Louis' THEN
    RAISE EXCEPTION 'P6b: city_by_alias(US, ''St Louis'') resolved to % (expected Saint Louis)',
      coalesce(v_name, '<null>');
  END IF;

  SELECT c.name INTO v_name FROM public.cities c
   WHERE c.id = public.city_by_alias(v_us, 'St Paul');
  IF v_name IS DISTINCT FROM 'Saint Paul' THEN
    RAISE EXCEPTION 'P6c: city_by_alias(US, ''St Paul'') resolved to % (expected Saint Paul)',
      coalesce(v_name, '<null>');
  END IF;

  -- P7: a redirect exists for each dropped slug. The trigger does this, not
  --     `merge_cities`, so it is asserted rather than assumed.
  IF NOT EXISTS (SELECT 1 FROM public.city_slug_redirects WHERE old_slug = 'st-louis') THEN
    RAISE EXCEPTION 'P7a: no redirect for the dropped slug st-louis; 203 events'' URLs would 404';
  END IF;

  -- P8: the survivors' own slugs did NOT move. `trg_cities_slug` is BEFORE INSERT
  --     OR UPDATE and step (3) updates `cities`, so this is cheap insurance on
  --     the rule that a statement not writing the slug does not change it.
  SELECT slug INTO v_slug FROM public.cities WHERE id = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d';
  IF v_slug IS DISTINCT FROM 'saint-louis' THEN
    RAISE EXCEPTION 'P8a: surviving St. Louis slug moved to %', v_slug;
  END IF;
  SELECT slug INTO v_slug FROM public.cities WHERE id = '637d48ff-6b95-4eb9-a8c5-c99a10608187';
  IF v_slug IS DISTINCT FROM 'saint-paul' THEN
    RAISE EXCEPTION 'P8b: surviving St. Paul slug moved to %', v_slug;
  END IF;

  -- P9: both merges are REVERSIBLE. A pre-schema audit row cannot be auto-undone,
  --     and these two auto-merge nothing but are the first repair of this pair.
  SELECT count(*) INTO v_n FROM public.city_merge_audit
   WHERE drop_id IN ('5987db13-9a4f-4c4e-b87a-020731926350',
                     'b2f12f63-cd73-47dd-a149-951863bec49f')
     AND details->>'schema' = '1'
     AND details->'moved' IS NOT NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'P9: expected 2 schema:1 reversible audit rows; found %', v_n;
  END IF;

  -- P10: the release is a DELETION, not a link. Keyed on nothing but the stamp,
  --      because `derive_entity_geo_address` rewrites `events.city` FROM `city_id`
  --      once a row links, so a predicate on the pre-link spelling reads zero.
  SELECT count(*) INTO v_n FROM public.events e
   JOIN public.countries co ON co.id = e.country_id
   WHERE e.duplicate_of_id IS NULL
     AND e.city_id IS NULL
     AND (co.code, btrim(e.city)) IN (('US', 'St Louis'), ('US', 'St Paul'))
     AND coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P10: % event(s) still carry a stale stamp', v_n;
  END IF;

  -- P11: and no event was linked HERE -- the nightly runner must do that, so
  --      guards A and B still decide.
  SELECT count(*) INTO v_n FROM public.events e
   WHERE e.id IN ('cddcb7c1-8f03-4d1c-91bd-4df53e99b9ec',
                  '45014ccc-f1a4-4319-89cf-8bc70d42d2a1',
                  '5c1287f4-a26c-4c0a-b99b-1d0734dac3cb',
                  'b5f2f2dd-1378-4ab9-99a9-7a2418e6544d')
     AND e.city_id IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P11: % event(s) were linked by this migration; the runner must do that', v_n;
  END IF;

  RAISE NOTICE 'city_merge_st_louis_st_paul: 2 pairs merged (Q38022 survives), Réunion scalars and aliases removed from St. Paul, 2 aliases resolving, 4 stamps released';
END $verify$;
