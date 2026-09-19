-- Derby, Connecticut published Derby, England's prose AND its population number.
--
-- FOUND BY THE PROD E2E PROBE WRITTEN FOR 99991789843667, NOT BY READING. That file
-- creates Derby, England; the probe fetched https://queer.guide/city/derby with a
-- Googlebot UA to assert the England event is not on the Connecticut page, and the
-- served <meta name="description"> read:
--
--   "Derby is a cathedral city and unitary authority area on the River Derwent in
--    Derbyshire, England. ... The population of Derby is 274,149 (2024)."
--
-- The row is Derby, CONNECTICUT: region_name 'Connecticut', wikidata_qid Q755197,
-- wikipedia_title 'Derby, Connecticut' -- both correct -- 4 venues, seo_indexable,
-- so crawlers were served it too. This is the wrong-SUBJECT class 40000101100000
-- recorded for Cambria and 21050101100000 for Daphne: a correct identifier does not
-- make the prose derived from it correct, and neither tag-wiki-guard nor the
-- wrong-entity repair can see a row whose QID is right.
--
-- THE NUMBER IS WHAT MAKES THE DIRECTION UNARGUABLE. cities.population on this row
-- is 255394. Resolved live (never recalled -- CLAUDE.md's Kowloon rule):
--   Q755197 "city in New Haven County, Connecticut"  P1082 = 12,325   (2020 census)
--   Q43475  "city in Derbyshire ... England"          P1082 = 255,394 (2011)
-- 255,394 is Derby, England's Wikidata value BYTE-EXACT, so the population did not
-- drift or get estimated -- it was copied off the namesake, as the prose was. (The
-- served text's own "274,149 (2024)" is a third, later figure for England, which is
-- why the prose and the column disagree with each other as well as with the row.)
--
-- THE CORRECT TEXT WAS ALREADY IN THE ROW, UNPUBLISHED. field_provenance.description
-- .candidates[0] holds 582 chars sourced 'wikipedia' opening "Derby is a city in New
-- Haven County, Connecticut, United States ... The population was 12,325 at the 2020
-- census." city-factual-backfill is FILL-IF-EMPTY, so it recorded the right answer as
-- a candidate and never overwrote the non-empty wrong column -- exactly 40000101100000's
-- finding, and the reason this row could never self-heal: the filler skips it for being
-- non-empty and nothing revalidates a derived field against the input it came from.
-- Before repairing a wrong derived value, check whether the right one is already there.
--
-- SO THIS CORRECTS, IT DOES NOT RETRACT. The row is live, indexable and content-bearing;
-- nulling would strip a real city page and then wait on a refill that only fires once
-- the column is empty -- two steps where one suffices, with a thinner page in between
-- (the darkroom/methadone rule). The published text is a VALUES LITERAL rather than the
-- row's jsonb read at apply time, so what lands is deterministic and is exactly the text
-- verified against Wikipedia, not whatever a later enrichment pass leaves in candidates
-- by the time CI applies this.
--
-- Both UPDATEs are CONTENT-GUARDED on the defect's own signature, so a human (or the
-- nightly composer) who fixes it first keeps their work, and the prior text is preserved
-- at field_provenance.description.corrected.from. The provenance is built with `||`, not
-- jsonb_set(..., create_missing => true): create_missing creates only the LAST path
-- element, and 21050101100000 records that writing into a missing parent key silently
-- stores NOTHING while destroying the text.
--
-- The sibling row gets the two facts that are genuinely its own: 99991789843667 creates
-- derby-england from Q43475 with no population and no wikipedia_title, and P1082 255,394
-- plus sitelink 'Derby' are that row's, resolved in the same live call. The title matters
-- beyond tidiness -- city-factual-backfill fetches Wikipedia BY CACHED SITELINK TITLE, so
-- a row that carries the right one cannot be re-grounded on the wrong article.
--
-- NOT DONE HERE, MEASURED AND NAMED RATHER THAN SWEPT: this is not one row. Probing for
-- one description text published on two live city rows returns 43 shared texts over 86
-- rows, 65 of them indexable, 24 crossing a country boundary -- Carlisle/Pennsylvania
-- serving Cumbria's lead, Chester/Pennsylvania serving Cheshire's, Aberdeen/South Dakota
-- and Dundee/Oregon serving Scotland's, Florence/Colorado serving Tuscany's, and
-- Saint Augustine/Florida serving a description of Augustine of Hippo, the theologian.
-- Some of the 43 are instead genuine duplicate ROWS (Genoa/Genova, Ft Lauderdale) whose
-- remedy is a merge, not a rewrite, so the direction has to be decided per pair by hand.
-- That is its own change. This file fixes the one row whose pair this PR creates, whose
-- direction is proven by a byte-exact population match, and whose replacement text the
-- row itself already holds.

begin;

update public.cities c
   set description = 'Derby is a city in New Haven County, Connecticut, United States, approximately 8 miles (13 km) west-northwest of New Haven. It is located in southwest Connecticut at the confluence of the Housatonic and Naugatuck rivers. It shares borders with the cities of Ansonia to the north and Shelton to the southwest, and the towns of Orange to the south, Seymour to the northwest, and Woodbridge to the east. The city is part of the Naugatuck Valley Planning Region. The population was 12,325 at the 2020 census. It is the smallest city in Connecticut by area, at 5.3 square miles (14 km2).',
       population = 12325,
       field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
         || jsonb_build_object('description',
              coalesce(c.field_provenance->'description', '{}'::jsonb)
              || jsonb_build_object('corrected', jsonb_build_object(
                   'by', 'migration:99991789843669',
                   'source', 'field_provenance.description.candidates[0] (wikipedia), corroborated by wikidata:Q755197 P1082=12325',
                   'reason', 'namesake_prose_and_population_from_Q43475',
                   'from', c.description,
                   'from_population', c.population)))
 where c.slug = 'derby'
   and c.wikidata_qid = 'Q755197'
   and c.description ilike '%Derbyshire, England%';

update public.cities c
   set population = 255394,
       wikipedia_title = 'Derby'
 where c.slug = 'derby-england'
   and c.wikidata_qid = 'Q43475'
   and c.population is null
   and c.wikipedia_title is null;

do $verify$
declare
  v_bad int;
begin
  -- P1 the Connecticut row now describes Connecticut, with its own population
  select count(*) into v_bad from public.cities c
  where c.slug = 'derby'
    and c.description like 'Derby is a city in New Haven County, Connecticut%'
    and c.population = 12325
    and c.wikidata_qid = 'Q755197';
  if v_bad <> 1 then
    raise exception 'P1 failed: derby (Connecticut) does not carry its own description and population (found %)', v_bad;
  end if;

  -- P2 no trace of the namesake's prose or number survives on it
  select count(*) into v_bad from public.cities c
  where c.slug = 'derby'
    and (c.description ilike '%Derbyshire%' or c.description ilike '%River Derwent%'
         or c.population = 255394);
  if v_bad <> 0 then
    raise exception 'P2 failed: derby (Connecticut) still carries Derby, England content (% row(s))', v_bad;
  end if;

  -- P3 the prior text is recoverable, not merely gone
  select count(*) into v_bad from public.cities c
  where c.slug = 'derby'
    and c.field_provenance->'description'->'corrected'->>'from' ilike '%Derbyshire, England%'
    and (c.field_provenance->'description'->'corrected'->>'from_population') = '255394'
    and c.field_provenance->'description'->'candidates' is not null;
  if v_bad <> 1 then
    raise exception 'P3 failed: the replaced text/population was not preserved, or the candidate was destroyed (found %)', v_bad;
  end if;

  -- P4 the England row carries the facts that are genuinely its own
  select count(*) into v_bad from public.cities c
  where c.slug = 'derby-england' and c.wikidata_qid = 'Q43475'
    and c.population = 255394 and c.wikipedia_title = 'Derby';
  if v_bad <> 1 then
    raise exception 'P4 failed: derby-england is missing its own population/sitelink (found %)', v_bad;
  end if;

  -- P5 MIRROR: this file touches exactly these two rows and no other Derby
  select count(*) into v_bad from public.cities c
  where c.field_provenance->'description'->'corrected'->>'by' = 'migration:99991789843669';
  if v_bad <> 1 then
    raise exception 'P5 failed: this migration corrected % rows, it may correct exactly 1', v_bad;
  end if;

  -- P6 MIRROR: the England row still has its own England prose. Correcting the
  -- Connecticut row must not be satisfied by a sweep that emptied its sibling.
  select count(*) into v_bad from public.cities c
  where c.slug = 'derby-england'
    and c.description ilike '%Derbyshire%'
    and length(btrim(c.description)) > 100;
  if v_bad <> 1 then
    raise exception 'P6 failed: derby-england lost its own description (found %)', v_bad;
  end if;
end $verify$;

commit;
