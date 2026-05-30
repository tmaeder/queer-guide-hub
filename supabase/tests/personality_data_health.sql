-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_data_health.sql
BEGIN;

-- view row count equals personalities minus private/duplicate (view's WHERE filter)
DO $$
DECLARE v_eligible int; v_health int;
BEGIN
  SELECT count(*) INTO v_eligible FROM public.personalities
    WHERE COALESCE(visibility,'public') <> 'private' AND duplicate_of_id IS NULL;
  SELECT count(*) INTO v_health FROM public.personality_data_health;
  ASSERT v_eligible = v_health, format('row count mismatch: eligible=%s health=%s', v_eligible, v_health);
END $$;

-- debt_score is a non-negative weighted sum, and emptier records score strictly higher
DO $$
DECLARE v_min numeric; v_max numeric; v_empty numeric; v_full numeric;
BEGIN
  SELECT min(debt_score), max(debt_score) INTO v_min, v_max FROM public.personality_data_health;
  ASSERT v_min >= 0, format('debt_score must be >= 0, got %s', v_min);
  ASSERT v_max <= 80, format('debt_score max weight is 80, got %s', v_max);

  -- an all-missing record scores 80; a record with qid+image+long description present
  -- loses 15+15+20, so its debt_score must be <= 30 and strictly less than 80.
  SELECT max(debt_score) INTO v_empty FROM public.personality_data_health
    WHERE wikidata_qid_missing AND image_missing AND description_missing
      AND birth_date_missing AND profession_missing AND nationality_missing;
  IF v_empty IS NOT NULL THEN
    ASSERT v_empty = 80, format('fully-missing record must score 80, got %s', v_empty);
  END IF;

  SELECT max(debt_score) INTO v_full FROM public.personality_data_health
    WHERE NOT wikidata_qid_missing AND NOT image_missing AND NOT description_missing;
  IF v_full IS NOT NULL THEN
    ASSERT v_full <= 30, format('record with qid+image+desc present must score <= 30, got %s', v_full);
  END IF;
END $$;

ROLLBACK;
