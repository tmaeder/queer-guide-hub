-- Normalise the leftover transportation_info airport lines.
--
-- `run_city_airport_link` rewrites `transportation_info->>'airports'` whenever
-- the stored line does not name the primary it just picked. That clears almost
-- everything -- Istanbul stopped advertising "ISL - Ataturk Airport", closed to
-- passengers since 2019 -- but it cannot catch a line that still CONTAINS the
-- new primary while being wrong around it. Berlin was the case in point:
--
--   BER, TXL, SXF, THF
--
-- BER is correct and is the primary, so the rule left the line alone, and the
-- city page went on naming three airports that are closed. Six rows have this
-- shape (Berlin, Dakar, Juiz de Fora, Myrtle Beach, Sarasota, Victoria de
-- Durango) -- all survivors of the old writer's fallback branch, which emitted a
-- bare comma-separated code list when it could not decide on a primary.
--
-- This normalises them to the canonical `CODE - Name` form, which is what every
-- other row already carries. After that the shape that defeats the rule no
-- longer exists in the corpus, which is why the function itself is left alone
-- rather than given a broader licence to overwrite: nothing here is
-- hand-written prose (measured: 832 rows, all single-key, all machine-authored
-- by the wikidata.sparql path), but a rule that overwrites unconditionally would
-- also overwrite the first hand-edited line somebody adds.
--
-- A comma in the line is NOT itself evidence of the defect: "FLR - Florence
-- Airport, Peretola" is a correct line whose airport name contains a comma.
-- The test is a bare code list, or a line that does not begin with the primary.

UPDATE public.cities c
SET transportation_info = c.transportation_info
      || jsonb_build_object('airports', s.iata_code || ' — ' || s.name)
FROM public.airport_service s
WHERE s.iata_code = c.major_airport_code
  AND c.duplicate_of_id IS NULL
  AND c.transportation_info IS NOT NULL
  AND c.transportation_info <> '{}'::jsonb
  AND (
    -- a bare list of codes, the old fallback shape
    c.transportation_info->>'airports' ~ '^[A-Z]{3}(\s*,\s*[A-Z]{3})+$'
    -- or a line that does not lead with the airport we publish as primary
    OR c.transportation_info->>'airports' NOT LIKE c.major_airport_code || '%'
  );