-- ============================================================================
-- Retract the city descriptions that are about a different subject entirely
-- ============================================================================
-- `city-agentic-enrich` grounds its prose in a Wikipedia extract fetched with
-- `action=query&prop=extracts&redirects=1&titles=<cities.name>`. The API follows
-- redirects and a disambiguation page carries a long enough extract to pass the
-- length check, so a city whose `wikipedia_title` was never cached silently adopts
-- whatever article owns its bare name. `cities.description` is NOT review-gated: it
-- auto-publishes at confidence >= 0.8.
--
-- Measured on prod 2026-09-12 across all 79 agentic-enriched cities with a NULL
-- `wikidata_qid`. 14 are wrong; the other 65 are correct and are not touched here.
--
--   WRONG SUBJECT (7) — the article is about something else under the same name
--     Daphne, Alabama    -> "a figure from Greek mythology ... pursued by Apollo"
--     Delphi, Indiana    -> "an ancient sacred precinct in central Greece"
--     Parma, Ohio        -> Parma, ITALY ("prosciutto, cheese")
--     Brisbane, Calif.   -> Brisbane, AUSTRALIA
--     Highland, Calif.   -> "areas of high elevation ... the Scottish Highlands"
--     West, Texas        -> "one of the four cardinal directions"
--     Englewood, Colo.   -> the ETYMOLOGY of the name ("Dutch Engelse woud")
--
--   UNRESOLVED DISAMBIGUATION (4) — names several places, commits to none
--     Ephrata PA, Fairview Heights IL, Point Pleasant WV, Castle Rock CO
--
--   REFUSAL PROSE (3) — "the sources do not provide any information about LGBTQ+..."
--     Milton PA, Morton IL, Spooner WI
--
-- THE THIRD GROUP IS A SYMPTOM OF THE SECOND, not a separate defect: all three were
-- handed a disambiguation page, correctly found no city in it, and told the reader so.
-- Morton additionally invented a fact from the page's own list — "known for being the
-- location of Morton Arboretum in nearby Lisle, Illinois". The arboretum is in Lisle,
-- 130 miles away, and is not Morton's.
--
-- 12 of the 14 are `seo_indexable`, so /city/daphne served the Apollo myth to crawlers.
--
-- NOT CAUSED BY THE VOICE FLIP. Split by arm: 8 `compact`, 3 `off`, 3 predating the
-- stamp. The name-only grounding hole is arm-independent and has been open since the
-- composer shipped.
--
-- WHAT THIS FILE DOES **NOT** DO. It does not rewrite. New prose re-enters through the
-- normal grounded path once `_shared/city-wiki-guard.ts` (same PR) makes that path
-- resolve to the right article — measured, all 14 then ground correctly. Retraction
-- only ever REMOVES; inventing replacement prose here is the LLM rewrite this repo
-- retired after the tag prose judge nulled 16 rows and got 13 of them wrong.
--
-- EACH ROW IS GUARDED ON ITS OWN SIGNATURE, not blanket-nulled by id, so a human who
-- has written real prose for one of these cities since the audit keeps it. Soft on
-- preconditions (an already-repaired row is a no-op), hard on the postcondition.
--
-- KNOWN AND ACCEPTED: a city left with no description may be reclassified `ghost` and
-- deindexed by the nightly completeness/trust recompute if it also has no venues or
-- events. That is honest — a page with nothing on it is a thin page — and it reverses
-- itself, because the classifier restores `seo_indexable` when the row gains content.
-- A blank is recoverable; a published myth is not.
-- ============================================================================

WITH wrong AS (
  SELECT * FROM (VALUES
    ('59c8d5e5-e7e3-466a-a670-14684e52aae0'::uuid, 'Daphne is a figure from Greek mythology%',            'wrong_subject'),
    ('e09ab18d-e895-4846-96ff-c42239c8af2a'::uuid, 'Delphi is an ancient sacred precinct%',               'wrong_subject'),
    ('a9c04884-503f-4de5-a6f7-00828e9ec918'::uuid, 'Parma is a city in Northern Italy%',                  'wrong_subject'),
    ('00aa340f-3b6c-4d3f-a24f-c4b6a3c20f9e'::uuid, 'Brisbane is the capital and largest city of the Australian%', 'wrong_subject'),
    ('d4240d8b-3cd8-4c34-872c-81ae4e318ae7'::uuid, 'Highland is a general term referring to areas of high elevation%', 'wrong_subject'),
    ('64358a69-aa0e-4eb7-99fa-054174239f7a'::uuid, 'West is one of the four cardinal directions%',        'wrong_subject'),
    ('6a968427-ccaf-4a48-9dd8-3bbd7cfb44f2'::uuid, 'Englewood is a place name with origins in Dutch%',    'wrong_subject'),
    ('18fc9a6a-7a9a-4a59-b1d1-e3e03cd9cb98'::uuid, 'Ephrata refers to multiple places%',                  'unresolved_disambiguation'),
    ('6ed6d884-eb0a-4c37-85f3-67011147e3ac'::uuid, 'Fairview Heights is a place name that refers to multiple%', 'unresolved_disambiguation'),
    ('41d5ac49-8981-4cb1-bf50-138928efb705'::uuid, 'Point Pleasant is a name shared by multiple locations%', 'unresolved_disambiguation'),
    ('751571c3-f21c-427d-b053-1f5c0575fdff'::uuid, 'Castle Rock is a butte near the city of%',            'unresolved_disambiguation'),
    ('5a7034a7-279f-4c55-a765-415388452f6f'::uuid, '%sources do not provide any information about LGBTQ+ community%', 'refusal_prose'),
    ('5d9c2ad6-9d3d-4c14-aba8-cd3174d40108'::uuid, '%Morton Arboretum in nearby Lisle%',                  'refusal_prose'),
    ('15a33281-b3c1-4338-91a3-3f121f4f5254'::uuid, '%provided sources do not contain any information%',   'refusal_prose')
  ) AS t(city_id, signature, defect)
)
UPDATE public.cities c
   SET description = NULL,
       needs_attention = true,
       -- NOT jsonb_set(fp, '{description,retracted}', ...). `create_missing` creates
       -- only the LAST path element, so on a row whose `field_provenance` has no
       -- `description` key at all — which is every row in this set — it returns the
       -- document UNCHANGED and the retraction destroys the text with no record.
       -- Caught by dry-running on prod; reading the call did not catch it.
       field_provenance = COALESCE(c.field_provenance, '{}'::jsonb)
         || jsonb_build_object('description',
              COALESCE(c.field_provenance -> 'description', '{}'::jsonb)
              || jsonb_build_object('retracted', jsonb_build_object(
                   'at', now(),
                   'defect', w.defect,
                   'by', 'migration:20800101100000',
                   'reason', 'grounded in a Wikipedia article about a different subject',
                   'value', c.description
                 )))
  FROM wrong w
 WHERE c.id = w.city_id
   AND c.description IS NOT NULL
   AND c.description ILIKE w.signature;

-- ---------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------
DO $verify$
DECLARE
  v_left      int;
  v_brisbane  text;
  v_untouched int;
  v_snapshots int;
BEGIN
  -- The retracted text must survive, or this file has destroyed evidence rather than
  -- unpublished a claim. Asserted because the first draft's `jsonb_set` silently
  -- wrote nothing on these rows and every other check still passed.
  SELECT count(*) INTO v_snapshots
    FROM public.cities
   WHERE field_provenance -> 'description' -> 'retracted' ->> 'value' IS NOT NULL
     AND field_provenance -> 'description' -> 'retracted' ->> 'by' = 'migration:20800101100000';
  IF v_snapshots <> 14 THEN
    RAISE EXCEPTION 'expected 14 preserved description snapshots, found % — the retraction kept no record', v_snapshots;
  END IF;

  -- The whole point: none of the fourteen signatures may still be published.
  SELECT count(*) INTO v_left
    FROM public.cities
   WHERE description IS NOT NULL
     AND (description ILIKE 'Daphne is a figure from Greek mythology%'
       OR description ILIKE 'Delphi is an ancient sacred precinct%'
       OR description ILIKE 'Parma is a city in Northern Italy%'
       OR description ILIKE 'Highland is a general term referring to areas of high elevation%'
       OR description ILIKE 'West is one of the four cardinal directions%'
       OR description ILIKE 'Englewood is a place name with origins in Dutch%'
       OR description ILIKE 'Ephrata refers to multiple places%'
       OR description ILIKE 'Fairview Heights is a place name that refers to multiple%'
       OR description ILIKE 'Point Pleasant is a name shared by multiple locations%'
       OR description ILIKE 'Castle Rock is a butte near the city of%'
       OR description ILIKE '%Morton Arboretum in nearby Lisle%');
  IF v_left > 0 THEN
    RAISE EXCEPTION 'wrong-subject city descriptions survived: %', v_left;
  END IF;

  -- Brisbane, AUSTRALIA carries the SAME text and is CORRECT for that row. Keying
  -- this repair by slug or by description alone would have retracted it; it is keyed
  -- by id for exactly this reason, and that must stay true.
  SELECT c.description INTO v_brisbane
    FROM public.cities c
    JOIN public.countries co ON co.id = c.country_id
   WHERE c.name = 'Brisbane, Australia' AND co.code = 'AU';
  IF v_brisbane IS NULL OR v_brisbane NOT ILIKE '%Australian state of Queensland%' THEN
    RAISE EXCEPTION 'the Australian Brisbane lost its (correct) description — wrong row matched';
  END IF;

  -- The other agentic-described cities are not this change's business.
  SELECT count(*) INTO v_untouched
    FROM public.cities
   WHERE enrichment_status ? 'agentic' AND description IS NOT NULL;
  IF v_untouched < 250 THEN
    RAISE EXCEPTION 'over-retraction: only % agentic descriptions remain, expected ~261', v_untouched;
  END IF;

  RAISE NOTICE 'retraction complete; % agentic city descriptions remain', v_untouched;
END
$verify$;
