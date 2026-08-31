-- Phase 2 follow-up: carry the parent's NAME in the provenance stamp.
--
-- Found by testing the shipped change on prod rather than trusting it. Two country pages
-- were misattributing:
--   /country/western-sahara  cited "ILGA World Database · Updated Apr 21, 2026" for a
--                            criminalisation claim ILGA does not make — it is our own
--                            manual, deliberately-qualified reading of the de-facto legal
--                            regime, and publishing it under ILGA's name lends it an
--                            authority it does not have. On legal data that is the exact
--                            over-claim this phase exists to prevent.
--   /country/aland-islands   cited ILGA for what is really FINLAND's ILGA entry, with
--                            nothing saying so.
--
-- The stamp already carries `parent` as an ISO2 code, but "via FI" is not a sentence a
-- reader can use, and resolving the code in the UI would mean a lookup table that drifts.
-- The row should carry what the surface needs to render, so add `parent_name` at write
-- time where the parent row is already in hand.
--
-- `basis` is likewise lifted onto the provenance object for EH so the UI has one place to
-- read from, rather than having to know that a disputed criminalisation keeps its
-- justification inside lgbti_criminalization.
--
-- Consumed by src/components/rights/SourceLine.tsx, which now refuses to cite ILGA for a
-- country ILGA does not cover.

WITH parent_map(child, parent) AS (
  VALUES ('AX','FI'), ('CC','AU'), ('CX','AU'), ('NF','AU'), ('SJ','NO')
)
UPDATE public.countries c SET
  enrichment_status = jsonb_set(
    c.enrichment_status, ARRAY['lgbti_rights'],
    coalesce(c.enrichment_status->'lgbti_rights', '{}'::jsonb)
      || jsonb_build_object('parent_name', p.name),
    true)
FROM parent_map m
JOIN public.countries p ON p.code = m.parent
WHERE c.code = m.child;

UPDATE public.countries SET
  enrichment_status = jsonb_set(
    enrichment_status, ARRAY['lgbti_rights'],
    coalesce(enrichment_status->'lgbti_rights', '{}'::jsonb)
      || jsonb_build_object(
           'basis',              lgbti_criminalization->>'basis',
           'de_facto_authority', lgbti_criminalization->>'de_facto_authority',
           'disputed',           true),
    true)
WHERE code = 'EH';

DO $$
DECLARE v_named int; v_basis text;
BEGIN
  SELECT count(*) INTO v_named FROM public.countries
   WHERE code IN ('AX','CC','CX','NF','SJ')
     AND enrichment_status->'lgbti_rights'->>'parent_name' IS NOT NULL;
  IF v_named <> 5 THEN
    RAISE EXCEPTION 'expected 5 inherited rows to carry parent_name, got %', v_named;
  END IF;

  SELECT enrichment_status->'lgbti_rights'->>'basis' INTO v_basis
    FROM public.countries WHERE code='EH';
  IF v_basis IS NULL THEN
    RAISE EXCEPTION 'EH provenance is missing its basis string';
  END IF;
END $$;
