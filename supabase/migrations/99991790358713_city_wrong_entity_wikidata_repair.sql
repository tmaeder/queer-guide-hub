-- Eleven cities published another place's encyclopedia article, and clearing the
-- identifier alone would NOT have stopped it.
--
-- The namesake chimera, one entity type further on. `tag_wikidata_repair_audit`
-- did this for the glossary; 99970101100100 / 99991789833562 / 99991789840157 did
-- it for personalities on 2026-09-19, where it was defamation;
-- 20261102100000_city_wrong_qid_geneva_lugano did two cities by hand. This is the
-- same class at cohort scale.
--
-- WHAT WAS LIVE. Every row below is `seo_indexable = true`, `shell_status='real'`:
--   /city/frisco-us-xyxtu        Frisco, TEXAS          -> Q62      San Francisco
--                                published SF's article AND mayor "Daniel Lurie"
--   /city/par-gb-n8jw1           Par, CORNWALL (pop 9k) -> Q90      Paris
--                                published Paris's article AND "Emmanuel Gregoire"
--   /city/pittsburg-us-8m9nd     Pittsburg, CALIFORNIA  -> Q1342    Pittsburgh PA
--                                published Pittsburgh's article AND "Corey O'Connor"
--   /city/saint-peters-gb-y5sot  Saint Peters, KENT     -> Q656     St Petersburg RU
--                                mayor "Alexander Beglov" (a Russian governor) over
--                                a description of a PENNSYLVANIA village -- three
--                                different places on one row
--   /city/kos-gr-9jvjc           Kos, GREECE            -> Q62868   Koszalin, POLAND
--                                published Koszalin's article AND "Tomasz Sobieraj"
--   /city/city-of-troy           City of Troy, NY       -> Q22647   Troy, the ANCIENT
--                                Homeric city in Asia Minor
--   /city/arabkir                Arabkir, YEREVAN (AM)  -> Q626165  Arapgir, TURKEY
--   /city/ganda                  Ganda, ANGOLA          -> Q3958155 Gandapura, INDONESIA
--   /city/guara                  Guara, DISTRITO FEDERAL-> Q905157  Guaratingueta, SP
--   /city/n-yf                   Nayf, DUBAI (AE)       -> Q2813294 Nayfeld, RUSSIA
--   /city/oetz                   Oetz (DE)              -> Q680480  Oetzen, Lower Saxony
--
-- HOW THEY WERE FOUND, and the bound is the platform's own, not a new opinion.
-- `_shared/city-class-guard.ts` exports CITY_COORD_MAX_KM = 100 and
-- `city-factual-backfill` already refuses an adoption whose P625 disagrees with the
-- row's own coordinates by more than that (`refused_coords:<km>km`). That guard
-- shipped 2026-09-15; every row here predates it, so the producer is ALREADY
-- SEALED and a cleared row is refused rather than re-adopted. Sweeping all 2,959
-- QID-bearing cities against live Wikidata P625 found 167 failing the same bound
-- -- 123 indexable, all 123 with content.
--
-- THE SWEEP IS A CANDIDATE GENERATOR, NOT THE DECISION, which is why this repairs
-- 11 rows and not 167. Distance cannot tell a wrong IDENTIFIER from wrong
-- COORDINATES, and both were in the candidate set:
--   Burj Hammoud sits at longitude EXACTLY 0.000000 (null island) and is filed
--   country DZ while the place is Lebanese. Its QID Q895235 and its article are
--   both CORRECT and our row is the broken half -- clearing it would have
--   destroyed a right answer. It is asserted below as a control.
--   Quebec-Ouest's coordinates (47.81/-69.56) are ~170 km from Quebec City, so its
--   169 km from Vanier measures our own defect, and Vanier is a plausible
--   neighbouring former municipality besides.
-- Both were dropped by hand. The other 155 have prose that is still correct for
-- the row, so they are a work list for a human and are deliberately NOT swept.
--
-- CLEARING THE QID IS NOT ENOUGH, AND THE PRECEDENT MISSED THIS.
-- `city-factual-backfill/index.ts:451` reads the CACHED `wikipedia_title`
-- (`let enwikiTitle = relink ? null : c.wikipedia_title`) and lines 570-573 fetch
-- the article BY THAT TITLE, independently of the QID. Every row here carries the
-- wrong article's title -- Frisco's says "San Francisco", Kos's says "Koszalin".
-- Description fill is fill-if-empty, so retracting the description while leaving
-- the title makes the NEXT nightly pass re-fetch San Francisco and write it back:
-- the repair would silently undo itself. 20261102100000 cleared QIDs only; it had
-- no wrong titles to deal with, so this is an extension of that pattern rather
-- than a correction of it. Both columns go, and a postcondition asserts it.
--
-- `population` is deliberately NOT cleared, diverging from 20261102100000, which
-- cleared it because Geneva, Alabama had copied Swiss Geneva's figure. Checked per
-- row here and the opposite is true: Frisco 154,407, Kos 19,244, Par 9,462 and
-- Pittsburg 69,424 are each that row's OWN population. The wrong value was
-- proposed as a provenance candidate and never applied, because that path is
-- fill-if-empty and the column was already set. Repair only the wrong FIELDS.
--
-- Nothing is repointed. A wrong identifier is permanent and self-reinforcing
-- (`city_factual_sparql` and `city-corroboration` rebuild from it weekly) while a
-- null one regenerates nothing. Prefer NULL to a guess.
--
-- WHAT THIS RELEASES. `uq_cities_wikidata_qid` is partial on
-- `duplicate_of_id IS NULL`, so a junk row holding a famous QID BLOCKS the real
-- city from ever adopting it. Measured before this migration, five real cities sit
-- at `qid_conflict` waiting on these exact ids: San Francisco (668 venues / 3,829
-- events), Paris (536 / 264), Pittsburgh (34 / 216), Saint Petersburg (19 / 4) and
-- Guaratingueta. This does not adopt anything on their behalf -- the nightly
-- backfill does that, under the coordinate guard -- but it unblocks them.
--
-- Prior values are preserved under `field_provenance.<field>.retracted*`. The key
-- `field_provenance.wikidata_qid.retracted_value` is the one 20261102100000
-- established, reused here so one query finds every such repair.

-- No `set local statement_timeout`: it is a documented no-op under `db push`, and
-- this touches 11 rows by slug.

with target(slug, qid, wrong_title, entity_label, km, drop_mayor) as (
  values
    ('frisco-us-xyxtu',       'Q62',      'San Francisco',    'San Francisco',    2366.5, true),
    ('par-gb-n8jw1',          'Q90',      'Paris',            'Paris',             534.6, true),
    ('pittsburg-us-8m9nd',    'Q1342',    'Pittsburgh',       'Pittsburgh',       3583.6, true),
    ('saint-peters-gb-y5sot', 'Q656',     'Saint Petersburg', 'Saint Petersburg', 2017.8, true),
    ('kos-gr-9jvjc',          'Q62868',   'Koszalin',         'Koszalin',         2103.0, true),
    ('city-of-troy',          'Q22647',   'Troy',             'Troy (ancient)',   7805.3, false),
    ('arabkir',               'Q626165',  'Arapgir',          'Arapgir',           530.5, false),
    ('ganda',                 'Q3958155', 'Gandapura',        'Gandapura',        9303.2, false),
    ('guara',                 'Q905157',  'Guaratinguetá',    'Guaratinguetá',     830.6, false),
    ('n-yf',                  'Q2813294', 'Nayfeld',          'Nayfeld',          7059.8, false),
    ('oetz',                  'Q680480',  'Oetzen',           'Oetzen',            217.2, false)
)
update public.cities c
set
  wikidata_qid    = null,
  wikipedia_title = null,
  description     = null,
  mayor           = case when t.drop_mayor then null else c.mayor end,
  needs_attention = true,
  updated_at      = now(),
  -- Built with `||`, never jsonb_set(..., create_missing => true): that only
  -- creates the LAST path element, so on a row with no `description` key in
  -- field_provenance it writes NOTHING and the retraction is lost silently
  -- (21050101100000 lost a whole retraction to exactly this).
  field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
    || jsonb_build_object(
         'wikidata_qid',
         coalesce(c.field_provenance->'wikidata_qid', '{}'::jsonb)
           || jsonb_build_object(
                'retracted_value', t.qid,
                'retracted_wikipedia_title', t.wrong_title,
                'reason', t.qid || ' is ' || t.entity_label || '; this row is a different place ('
                          || t.km::text || ' km away, past CITY_COORD_MAX_KM=100). '
                          || 'wikipedia_title cleared too: city-factual-backfill re-fetches the '
                          || 'article by that cached title regardless of the QID.',
                'at', now(),
                'by', 'migration:99991790358713')
       )
    || jsonb_build_object(
         'description',
         coalesce(c.field_provenance->'description', '{}'::jsonb)
           || jsonb_build_object('retracted', jsonb_build_object(
                'from', to_jsonb(c.description),
                'reason', 'article of ' || t.entity_label || ', not of this row',
                'at', now(),
                'by', 'migration:99991790358713'))
       )
    || case when t.drop_mayor then jsonb_build_object(
         'mayor',
         coalesce(c.field_provenance->'mayor', '{}'::jsonb)
           || jsonb_build_object('retracted', jsonb_build_object(
                'from', to_jsonb(c.mayor),
                'reason', 'mayor of ' || t.entity_label || ', not of this row',
                'at', now(),
                'by', 'migration:99991790358713'))
       ) else '{}'::jsonb end
from target t
where c.slug = t.slug
  -- SOFT ON PRECONDITIONS. 20261102100000 raises when a row has moved; that aborts
  -- `db push` for the whole repo, and a concurrent session legitimately repairing
  -- one of these rows would take every queued migration with it. Skip instead, and
  -- let the postconditions below assert the state that was actually reached.
  and c.wikidata_qid is not distinct from t.qid;

do $verify$
declare
  v_repaired    int;
  v_still_wrong int;
  v_kept_title  int;
  v_preserved   int;
  v_mayors      int;
  v_control_pop int;
  v_burj        int;
  v_released    int;
begin
  -- Positive form. Counting rows in a BAD state returns zero for a slug that has
  -- gone missing from the corpus entirely, which is the vacuous shape this repo
  -- has shipped more than once.
  select count(*) into v_repaired
    from public.cities
   where field_provenance->'wikidata_qid'->>'by' = 'migration:99991790358713';

  select count(*) into v_still_wrong
    from public.cities
   where slug in ('frisco-us-xyxtu','par-gb-n8jw1','pittsburg-us-8m9nd',
                  'saint-peters-gb-y5sot','kos-gr-9jvjc','city-of-troy','arabkir',
                  'ganda','guara','n-yf','oetz')
     and wikidata_qid is not null;

  -- The re-infection vector. Non-zero here means the repair undoes itself on the
  -- next nightly backfill pass.
  select count(*) into v_kept_title
    from public.cities
   where slug in ('frisco-us-xyxtu','par-gb-n8jw1','pittsburg-us-8m9nd',
                  'saint-peters-gb-y5sot','kos-gr-9jvjc','city-of-troy','arabkir',
                  'ganda','guara','n-yf','oetz')
     and wikipedia_title is not null;

  -- Retraction must PRESERVE, never merely delete.
  select count(*) into v_preserved
    from public.cities
   where field_provenance->'description'->'retracted'->>'by' = 'migration:99991790358713'
     and field_provenance->'description'->'retracted'->'from' is not null;

  select count(*) into v_mayors
    from public.cities
   where slug in ('frisco-us-xyxtu','par-gb-n8jw1','pittsburg-us-8m9nd',
                  'saint-peters-gb-y5sot','kos-gr-9jvjc')
     and mayor is null;

  -- CONTROL: population is the row's own and must SURVIVE. A sweep that nulled
  -- every column would satisfy every assertion above.
  select count(*) into v_control_pop
    from public.cities where slug = 'frisco-us-xyxtu' and population = 154407;

  -- CONTROL: the row deliberately EXCLUDED keeps its CORRECT identifier. Asserts
  -- the repair did not widen to the whole candidate set.
  select count(*) into v_burj
    from public.cities where slug = 'burj-hammoud' and wikidata_qid = 'Q895235';

  -- The point of the migration: these ids are now unclaimed, so the real cities
  -- can adopt them on the next backfill pass.
  select count(*) into v_released
    from public.cities
   where wikidata_qid in ('Q62','Q90','Q1342','Q656','Q62868','Q22647','Q626165',
                          'Q3958155','Q905157','Q2813294','Q680480')
     and duplicate_of_id is null;

  if v_repaired <> 11 then
    raise exception 'expected 11 rows stamped by this migration, found %', v_repaired;
  end if;
  if v_still_wrong <> 0 then
    raise exception '% row(s) still carry a Wikidata identifier', v_still_wrong;
  end if;
  if v_kept_title <> 0 then
    raise exception '% row(s) kept wikipedia_title -- the wrong article will be re-fetched', v_kept_title;
  end if;
  if v_preserved <> 11 then
    raise exception 'expected 11 preserved descriptions, found % -- retraction destroyed the prior value', v_preserved;
  end if;
  if v_mayors <> 5 then
    raise exception 'expected 5 wrong mayors cleared, found %', v_mayors;
  end if;
  if v_control_pop <> 1 then
    raise exception 'Frisco lost its own population -- the repair over-reached';
  end if;
  if v_burj <> 1 then
    raise exception 'burj-hammoud lost its CORRECT identifier -- the repair swept the excluded rows';
  end if;
  if v_released <> 0 then
    raise exception '% of the 11 identifiers are still claimed by some row', v_released;
  end if;

  raise notice 'city wrong-entity repair: 11 cleared, 5 mayors, 11 descriptions preserved, 11 ids released, controls intact';
end
$verify$;
