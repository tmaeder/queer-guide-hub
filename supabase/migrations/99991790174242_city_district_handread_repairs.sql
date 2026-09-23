-- Five rows read one at a time. Each remedy is different, and the file says
-- which group each row is in so a later pass cannot take the loosest group's
-- licence and apply it to the rest.
--
-- All five came out of the P31 sample in 99991790173993. That migration's probe
-- REPORTS and never acts, because demoting a live indexable page with venues on
-- it cannot be undone per row. This file is the acting half, by hand, for the
-- rows a human actually read.
--
-- GROUP A -- A DISTRICT WHOSE PARENT CITY IS UNAMBIGUOUS: MERGE.
--   Kensington (Q288781) is classed "area of London" and NOTHING ELSE -- no
--   settlement sibling to rescue it, unlike Croydon ("market town") and
--   Greenwich ("town"). It is `real`, `seo_indexable`, and carries 15 venues
--   and 2 personalities.
--
--   Merged into London rather than archived, which is a deliberate change from
--   the obvious reading. `archive_city_as_nonplace` sets shell_status='ghost',
--   and a ghost 404s in both the SPA (`rejectGhost`) and the crawler path --
--   so archiving would kill an indexable URL outright AND leave 15 venues
--   pointing at a row nobody can open. A merge does strictly better on every
--   axis: merge_cities repoints the children itself, the sibling migration's
--   trigger mints the 301 and deindexes the row, `unmerge_cities` reverses it,
--   and a `city_aliases` row makes future ingest resolve "Kensington" to
--   London. This is also the shape the corpus already uses -- Harburg,
--   Altenwerder, Altona-Ottensen, Groß Flottbek and Bergedorf are all merged
--   into Hamburg, and Freisenbruch into Essen.
--
-- GROUP B -- AN ADMINISTRATIVE AREA WITH NO SINGLE PARENT: DISPOSITION, DO NOT
--            MERGE AND DO NOT ARCHIVE.
--   Amber Valley (Q457014, "non-metropolitan district", 10 venues) and
--   Dihlabeng Local Municipality (Q1225159, "local municipality of South
--   Africa", 2 venues) each CONTAIN several towns -- Amber Valley's venues are
--   in Ripley, Alfreton and Belper. There is no city to merge into, and
--   archiving would orphan the venues on a 404 row.
--
--   SO THE ROW STAYS FETCHABLE AND ONLY STOPS BEING INDEXED -- and a bare
--   `seo_indexable=false` WOULD NOT HOLD. `run_city_trust_recompute` (nightly)
--   rewrites `seo_indexable` unconditionally for every row in scope, and the
--   ONLY thing that takes a row out of that scope is
--   `enrichment_status->'disposition'->>'state' = 'not_a_city'`. Verified
--   against the live function body, not inferred. Without the stamp this fix
--   would be undone by the next nightly run -- the `detect_stale_venues`
--   failure, where a migration "fixed" a value that a cron owned.
--
--   The disposition is stamped WITHOUT ghosting, and `ghosted: false` records
--   that deliberately: the disposition says what the row IS, `shell_status`
--   says how it is published, and for a district that holds content those two
--   answers differ. Nothing was archived, so `unarchive_city` is not the way
--   back -- clearing the `disposition` key is.
--
-- GROUP C -- THE ENTITY IS RIGHT, A DERIVED VALUE IS NOT: RETRACT THE VALUE.
--   Greenwich (Q179385) is classed "town, district, area of London", so it
--   carries a settlement class and STAYS A CITY. Its `population` is
--   8,800,000, which is LONDON's. Only that is retracted.
--
-- GROUP D -- THE ENTITY IS WRONG: NULL IT, NEVER REPOINT.
--   Clapham (`clapham`) is Clapham, LONDON SW4 -- its coordinates are
--   51.4621/-0.1380 and its own venue "O'Neill's" is at "196 High St, Clapham,
--   Greater London, SW4 7UD". But `wikidata_qid` is Q1520409 = Clapham,
--   BEDFORDSHIRE ("village and civil parish"), `wikipedia_title` is literally
--   "Clapham, Bedfordshire", the `description` is that village's, and
--   `population` 4,500 is that village's too. Four fields from the wrong place.
--
--   THE CACHED TITLE IS WHY NULLING THE QID ALONE IS NOT ENOUGH.
--   `city-factual-backfill` fetches Wikipedia BY CACHED SITELINK TITLE, never
--   by `cities.name`, so a cleared QID beside a surviving "Clapham,
--   Bedfordshire" rebuilds the same wrong prose on the next pass. Both go.
--
--   NO REPOINT. The weekly `city_factual_sparql` / `city-corroboration` rebuild
--   facts from the identifier, so a plausible-but-wrong QID regenerates wrong
--   data forever while a null one regenerates nothing -- and "Clapham" is
--   genuinely ambiguous between London SW4, Bedfordshire and North Yorkshire.
--   Prefer NULL to a guess. The terminal `data_unavailable` stamp is part of
--   the fix and not bookkeeping: a bare null returns the row to the `qid_gap`
--   cohort, where a name-only probe would re-adopt the same village.
--
-- CROYDON IS DELIBERATELY UNTOUCHED AND IS ASSERTED AS A CONTROL. It is classed
-- "area of London, market town" and its own description opens "Croydon is a
-- large town in South London". A sweep that satisfied "the districts are gone"
-- by taking Croydon and Greenwich too must break this file's own check.

-- ------------------------------------------------------- A: Kensington -> London
DO $a$
DECLARE v_keep uuid; v_drop uuid; v_dup uuid;
BEGIN
  SELECT id INTO v_keep FROM public.cities WHERE slug = 'london' AND duplicate_of_id IS NULL;
  SELECT id, duplicate_of_id INTO v_drop, v_dup FROM public.cities WHERE slug = 'kensington-1';
  IF v_keep IS NULL OR v_drop IS NULL THEN
    RAISE NOTICE 'skip kensington-1: one side is gone';
  ELSIF v_dup IS NOT NULL THEN
    RAISE NOTICE 'skip kensington-1: already merged into %', v_dup;
  ELSE
    PERFORM public.merge_cities(v_keep, v_drop);
    RAISE NOTICE 'merged kensington-1 into london';
  END IF;
END $a$;

-- --------------------------------------- B: administrative areas, dispositioned
UPDATE public.cities c
   SET seo_indexable   = false,
       needs_attention = true,
       enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('disposition', jsonb_build_object(
              'state',   'not_a_city',
              'kind',    'administrative_area',
              'ghosted', false,
              'reason',  'Wikidata P31 says this is a local-government district that CONTAINS towns, '
                      || 'not a settlement. Kept fetchable rather than ghosted because its venues are '
                      || 'in several different towns and have no single city to move to.',
              'classes', to_jsonb(p.classes),
              'by',      'migration:99991790174242',
              'at',      now())),
       updated_at = now()
  FROM public.city_place_class_probe p
 WHERE c.slug IN ('amber-valley', 'dihlabeng-local-municipality')
   AND c.duplicate_of_id IS NULL
   AND p.wikidata_qid = c.wikidata_qid
   AND public.city_place_class_verdict(p.classes) = 'admin_area'
   AND coalesce(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city';

-- ------------------------------------------- C: Greenwich keeps its entity,
--                                                loses London's population
UPDATE public.cities
   SET population = NULL,
       field_provenance = coalesce(field_provenance, '{}'::jsonb)
         || jsonb_build_object('population', jsonb_build_object(
              'retracted', jsonb_build_object(
                'from',   population,
                'reason', 'This is London''s population on a row for the Greenwich district.',
                'by',     'migration:99991790174242',
                'at',     now()))),
       needs_attention = true,
       updated_at = now()
 WHERE slug = 'greenwich'
   AND duplicate_of_id IS NULL
   AND population = 8800000;

-- --------------------------------------------- D: Clapham loses a wrong entity
UPDATE public.cities
   SET wikidata_qid     = NULL,
       wikipedia_title  = NULL,
       description      = NULL,
       population       = NULL,
       needs_attention  = true,
       field_provenance = coalesce(field_provenance, '{}'::jsonb)
         || jsonb_build_object('wikidata_qid', jsonb_build_object(
              'retracted', jsonb_build_object(
                'qid',             'Q1520409',
                'wikipedia_title', wikipedia_title,
                'population',      population,
                'description',     description,
                'reason',          'Q1520409 is Clapham, Bedfordshire -- a village and civil parish. '
                                || 'This row is Clapham, London SW4 (51.4621/-0.1380; its own venue '
                                || 'O''Neill''s is at 196 High St, Clapham, Greater London, SW4 7UD). '
                                || 'Four fields were derived from the wrong place.',
                'by',              'migration:99991790174242',
                'at',              now()))),
       -- Terminal, so cities_due_for_refresh stops offering the row to the
       -- qid_gap sweep, which would re-adopt the same village on the name.
       -- reset_city_enrichment_state() is the way back.
       enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
         || jsonb_build_object('wikidata_link', jsonb_build_object(
              'state',  'data_unavailable',
              'reason', 'wrong_entity_namesake',
              'detail', 'Q1520409 is Clapham, Bedfordshire. The correct identifier for Clapham, '
                     || 'London is deliberately NOT guessed: a plausible-but-wrong QID regenerates '
                     || 'wrong facts weekly while a null one regenerates nothing.',
              'by',     'migration:99991790174242',
              'at',     now())),
       updated_at = now()
 WHERE slug = 'clapham'
   AND duplicate_of_id IS NULL
   AND wikidata_qid = 'Q1520409';

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  v_bad  int := 0;
  v_pop  bigint;
BEGIN
  -- A. Kensington is merged into London, deindexed, and redirects there.
  IF NOT EXISTS (
    SELECT 1 FROM public.cities d JOIN public.cities k ON k.id = d.duplicate_of_id
     WHERE d.slug = 'kensington-1' AND k.slug = 'london'
       AND d.shell_status = 'merged' AND d.seo_indexable = false
       AND EXISTS (SELECT 1 FROM public.city_slug_redirects r
                    WHERE r.old_slug = 'kensington-1' AND r.city_id = k.id)
  ) THEN
    RAISE WARNING 'kensington-1 was not merged into london'; v_bad := v_bad + 1;
  END IF;
  -- Its content followed it.
  IF (SELECT count(*) FROM public.venues v JOIN public.cities c ON c.id = v.city_id
       WHERE c.slug = 'kensington-1' AND v.duplicate_of_id IS NULL) <> 0 THEN
    RAISE WARNING 'venues are still attached to the merged kensington-1 row'; v_bad := v_bad + 1;
  END IF;

  -- B. Both administrative areas are dispositioned, deindexed, and OUT of the
  --    nightly recompute's scope -- which is the half that makes it stick.
  IF (SELECT count(*) FROM public.cities
       WHERE slug IN ('amber-valley','dihlabeng-local-municipality')
         AND duplicate_of_id IS NULL
         AND seo_indexable = false
         AND enrichment_status->'disposition'->>'state' = 'not_a_city') <> 2 THEN
    RAISE WARNING 'the two administrative areas are not both dispositioned'; v_bad := v_bad + 1;
  END IF;
  -- They keep their venues: the whole reason they are not ghosted.
  IF (SELECT count(*) FROM public.venues v JOIN public.cities c ON c.id = v.city_id
       WHERE c.slug = 'amber-valley' AND v.duplicate_of_id IS NULL) = 0 THEN
    RAISE WARNING 'amber-valley lost its venues'; v_bad := v_bad + 1;
  END IF;

  -- C. Greenwich is still a city, and no longer claims London's population.
  SELECT population INTO v_pop FROM public.cities WHERE slug = 'greenwich';
  IF v_pop IS NOT NULL THEN
    RAISE WARNING 'greenwich still carries a population (%)', v_pop; v_bad := v_bad + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'greenwich' AND duplicate_of_id IS NULL
                    AND field_provenance->'population'->'retracted'->>'from' = '8800000') THEN
    RAISE WARNING 'greenwich did not record what was retracted'; v_bad := v_bad + 1;
  END IF;

  -- D. Clapham lost the wrong entity in ALL FOUR fields, recorded every one of
  --    them, and is terminal so the sweep cannot re-adopt it.
  IF NOT EXISTS (
    SELECT 1 FROM public.cities
     WHERE slug = 'clapham' AND duplicate_of_id IS NULL
       AND wikidata_qid IS NULL AND wikipedia_title IS NULL
       AND description IS NULL AND population IS NULL
       AND field_provenance->'wikidata_qid'->'retracted'->>'qid' = 'Q1520409'
       AND field_provenance->'wikidata_qid'->'retracted'->>'wikipedia_title' = 'Clapham, Bedfordshire'
       AND enrichment_status->'wikidata_link'->>'state' = 'data_unavailable'
  ) THEN
    RAISE WARNING 'clapham was not fully retracted'; v_bad := v_bad + 1;
  END IF;
  -- A retraction that records nothing is a deletion.
  IF (SELECT field_provenance->'wikidata_qid'->'retracted'->>'description'
        FROM public.cities WHERE slug = 'clapham') IS NULL THEN
    RAISE WARNING 'clapham did not preserve the description it retracted'; v_bad := v_bad + 1;
  END IF;

  -- CONTROLS. A sweep that satisfied "the districts are gone" by taking these
  -- too must break this check. Both carry a settlement class and are cities.
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'croydon' AND duplicate_of_id IS NULL
                    AND seo_indexable AND wikidata_qid = 'Q2213391') THEN
    RAISE WARNING 'CONTROL: croydon was changed'; v_bad := v_bad + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'greenwich' AND duplicate_of_id IS NULL
                    AND seo_indexable AND wikidata_qid = 'Q179385') THEN
    RAISE WARNING 'CONTROL: greenwich stopped being an indexable city'; v_bad := v_bad + 1;
  END IF;

  IF v_bad <> 0 THEN
    RAISE EXCEPTION '% hand-read city repair(s) did not reach the intended end state', v_bad;
  END IF;
  RAISE NOTICE 'ok: kensington merged, 2 admin areas dispositioned, greenwich population retracted, clapham entity cleared, croydon untouched';
END $verify$;
