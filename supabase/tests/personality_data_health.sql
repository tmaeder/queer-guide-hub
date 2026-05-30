-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql
BEGIN;

-- view exists and returns one row per eligible personality
-- (excludes private + duplicates — view WHERE COALESCE(visibility,'public') <> 'private' AND duplicate_of_id IS NULL)
DO $$
DECLARE v_eligible int; v_health int;
BEGIN
  SELECT count(*) INTO v_eligible
    FROM public.personalities
    WHERE COALESCE(visibility, 'public') <> 'private'
      AND duplicate_of_id IS NULL;
  SELECT count(*) INTO v_health FROM public.personality_data_health;
  ASSERT v_eligible = v_health,
    format('row count mismatch: eligible=%s health=%s', v_eligible, v_health);
END $$;

-- debt_score is higher for an emptier record
DO $$
DECLARE v_empty numeric; v_full numeric;
BEGIN
  SELECT max(debt_score) INTO v_empty
    FROM public.personality_data_health
    WHERE wikidata_qid_missing AND image_missing AND description_missing;
  SELECT min(debt_score) INTO v_full
    FROM public.personality_data_health
    WHERE NOT wikidata_qid_missing AND NOT image_missing AND NOT description_missing;
  ASSERT v_empty IS NULL OR v_full IS NULL OR v_empty >= v_full, 'emptier records must not score lower debt';
END $$;

ROLLBACK;
