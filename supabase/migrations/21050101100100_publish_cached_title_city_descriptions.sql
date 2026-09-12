-- Two city descriptions were fetched from the BARE name and never replaced by the
-- correct article that a later pass had already fetched and recorded.
--
-- This is the residue of the same defect 21050101100000 retracted, reached by a
-- different producer, and the selection criterion of that pass could not see it:
-- the 14 wrong-subject rows were chosen as `city-agentic-enrich`-touched AND
-- wikidata_qid IS NULL. These two were written by the `city-factual-backfill` /
-- `city-corroboration` path, carry a CORRECT wikidata_qid and a CORRECT cached
-- `wikipedia_title`, and were never agentic-enriched at all.
--
--   /city/cambria  (Cambria, California, seo_indexable, shell_status='real')
--     published: "Cambria is a name for Wales, being the Latinised form ..."
--     which is en.wikipedia.org/wiki/Cambria -- the Latin name for WALES.
--     The row's own correct text explains exactly how it got here:
--     "The name Cambria, chosen in 1869, is the Latin name for Wales."
--
--   /city/timon    (Timon, Maranhao, Brazil, shell_status='ghost')
--     published: "Timon is a masculine given name and a surname which may refer to:"
--     which is en.wikipedia.org/wiki/Timon -- a given-name disambiguation page.
--
-- WHY THIS IS A CORRECTION AND NOT A RETRACTION. The correct description was
-- already fetched and is sitting UNPUBLISHED in the same row, at
-- field_provenance.description.candidates[0].value, because `city-factual-backfill`
-- is fill-if-empty: it recorded the right answer as a candidate and the non-empty
-- wrong column was never overwritten. So these rows can never self-heal -- the
-- filler skips them for being non-empty, and nothing revalidates a derived field
-- against the input it was derived from. Same class as the 86 wrong-country
-- safety_notes (20260816112824), and corrected the same way: in place, guarded on
-- the defect's own signature, with the prior text preserved.
--
-- Nulling instead would strip an indexable `real` city page of its description and
-- then depend on a refill that only happens once the column is empty -- two steps
-- where one suffices, and a thinner page in between.
--
-- The published text is a LITERAL here, not read out of the row's jsonb at apply
-- time, so what lands is deterministic and is exactly what was verified. Both
-- strings were checked against live Wikipedia on 2026-09-12 via
-- action=query&prop=extracts&exintro=1&redirects=1 on the row's own cached title:
--   "Cambria, California" -> "Cambria () is a coastal town in San Luis Obispo County..."
--   "Timon, Maranhao"     -> "Timon is a Brazilian municipality in the State of Maranhao..."
-- while the bare names still return Wales and the given-name page respectively.
-- Both also PASS the `cityWikiVerdict` seal shipped in 21050101100000: each lead
-- describes a place and each corroborates the row's own region or country.
--
-- Keyed by ID, never by slug or name -- the lesson of the Brisbane row in the
-- previous pass, where a byte-identical description was CORRECT for a different row.
-- Guarded per row on the wrong text still being present, so a human who fixed
-- either one first keeps their work and this no-ops.

do $repair$
declare
  v_corrected  integer;
  v_wrong_left integer;
  v_cambria_ok boolean;
  v_timon_ok   boolean;
begin

  with wrong (city_id, wrong_signature, correct_text) as (
    values
      ('ee854868-69d8-4e16-9f1f-43068383c86a'::uuid,
       'Cambria is a name for Wales%',
       'Cambria is a coastal town in San Luis Obispo County, California, United States midway between San Francisco and Los Angeles along California State Route 1. The name Cambria, chosen in 1869, is the Latin name for Wales. Cambria is situated amidst Monterey pines in one of only three such native forests. The town previously had gone by the names of Slabtown, Rosaville, San Simeon, and Santa Rosa.'),
      ('b02cf360-9398-41d5-9451-b4a142efd5b1'::uuid,
       'Timon is a masculine given name%',
       'Timon is a Brazilian municipality in the State of Maranhão. The population is 174,465 (2022 Census) and the total area is 1765 km2.')
  ),
  corrected as (
    update public.cities c
       set description = w.correct_text,
           -- NOT jsonb_set(fp, '{description,corrected}', ..., true). `create_missing`
           -- creates only the LAST path element, so on a row without a `description`
           -- key it writes nothing at all while every other check still passes
           -- (21050101100000's dry run caught exactly that).
           field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
             || jsonb_build_object('description',
                  coalesce(c.field_provenance -> 'description', '{}'::jsonb)
                  || jsonb_build_object(
                       'value', w.correct_text,
                       'source', 'wikipedia',
                       'corrected', jsonb_build_object(
                         'at', now(),
                         'by', 'migration:21050101100100',
                         'reason', 'published description was grounded in the bare-name Wikipedia article; replaced with the article for the row''s own cached wikipedia_title',
                         'title', c.wikipedia_title,
                         'from', c.description)))
      from wrong w
     where c.id = w.city_id
       and c.description is not null
       and c.description ilike w.wrong_signature
    returning c.id
  )
  select count(*) into v_corrected from corrected;

  -- Postcondition 1: both rows carry this migration's correction stamp. A row a
  -- human had already fixed no-ops above and would land here as a shortfall, which
  -- is the right place to notice it rather than a silent partial apply.
  select count(*) into v_corrected
    from public.cities
   where field_provenance -> 'description' -> 'corrected' ->> 'by'
         = 'migration:21050101100100';

  if v_corrected <> 2 then
    raise exception 'expected 2 corrected city descriptions, found %', v_corrected;
  end if;

  -- Postcondition 2: neither wrong-subject lead survives ANYWHERE in cities, not
  -- merely on the two ids -- the signature is what a future regression looks like.
  select count(*) into v_wrong_left
    from public.cities
   where description is not null
     and (description ilike 'Cambria is a name for Wales%'
       or description ilike 'Timon is a masculine given name%');

  if v_wrong_left > 0 then
    raise exception 'a bare-name city description survived the correction: % row(s)', v_wrong_left;
  end if;

  -- Postcondition 3: positive controls. Removing the wrong text is not the goal;
  -- publishing the right text is, so assert each row now names its own place.
  select description like '%San Luis Obispo County, California%'
    into v_cambria_ok
    from public.cities where id = 'ee854868-69d8-4e16-9f1f-43068383c86a';

  select description like '%Brazilian municipality in the State of Maranh%'
    into v_timon_ok
    from public.cities where id = 'b02cf360-9398-41d5-9451-b4a142efd5b1';

  if not coalesce(v_cambria_ok, false) then
    raise exception 'Cambria did not end up with its San Luis Obispo County description';
  end if;

  if not coalesce(v_timon_ok, false) then
    raise exception 'Timon did not end up with its Maranhao municipality description';
  end if;

  raise notice 'corrected % bare-name city descriptions; wrong signatures left %',
    v_corrected, v_wrong_left;

end $repair$;
