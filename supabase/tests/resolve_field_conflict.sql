-- Tests for public.resolve_field_conflict(jsonb, text).
-- Run against a non-prod branch or in SQL editor.
-- Inserts deterministic source_reliability rows, asserts winner per scenario,
-- then cleans up.
--
-- Usage:  psql ... -f supabase/tests/resolve_field_conflict.sql
-- Expected: all RAISE EXCEPTION lines silent; final NOTICE 'all-tests-passed'.

DO $$
DECLARE
  v_result jsonb;
  v_winner text;
BEGIN
  -- Seed: two synthetic sources with very different reliability for entity 'venue'.
  INSERT INTO public.source_reliability(source_slug, entity_type, weight, sample_size)
  VALUES
    ('test_high_rel', 'venue', 0.90, 1000),
    ('test_low_rel',  'venue', 0.20, 1000)
  ON CONFLICT (source_slug, entity_type) DO UPDATE
    SET weight = EXCLUDED.weight, sample_size = EXCLUDED.sample_size;

  -- ===== Test 1: high-reliability source wins on equal length/recency =====
  v_result := public.resolve_field_conflict(
    jsonb_build_array(
      jsonb_build_object('source','test_high_rel','value', to_jsonb('Open 9am-5pm'::text), 'recency_days', 0),
      jsonb_build_object('source','test_low_rel','value',  to_jsonb('Open 8am-4pm'::text), 'recency_days', 0)
    ),
    'venue'
  );
  v_winner := v_result->>'resolved_source';
  IF v_winner <> 'test_high_rel' THEN
    RAISE EXCEPTION 'T1 FAILED: expected test_high_rel, got %  full=%', v_winner, v_result;
  END IF;
  RAISE NOTICE 'T1 PASSED: high-reliability wins';

  -- ===== Test 2: NULL/empty values get score 0 and lose =====
  v_result := public.resolve_field_conflict(
    jsonb_build_array(
      jsonb_build_object('source','test_high_rel','value', 'null'::jsonb,                    'recency_days', 0),
      jsonb_build_object('source','test_low_rel','value',  to_jsonb('Has content'::text),    'recency_days', 0)
    ),
    'venue'
  );
  v_winner := v_result->>'resolved_source';
  IF v_winner <> 'test_low_rel' THEN
    RAISE EXCEPTION 'T2 FAILED: expected test_low_rel (high source had null value), got %  full=%', v_winner, v_result;
  END IF;
  RAISE NOTICE 'T2 PASSED: null value loses to non-null';

  -- ===== Test 3: empty array returns null winner =====
  v_result := public.resolve_field_conflict('[]'::jsonb, 'venue');
  IF v_result->>'resolved_value' IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FAILED: empty input should return null, got %', v_result;
  END IF;
  RAISE NOTICE 'T3 PASSED: empty input → null';

  -- ===== Test 4: unknown source falls back to neutral weight 0.5 =====
  v_result := public.resolve_field_conflict(
    jsonb_build_array(
      jsonb_build_object('source','unknown_src',  'value', to_jsonb('A'::text), 'recency_days', 0),
      jsonb_build_object('source','test_low_rel', 'value', to_jsonb('A'::text), 'recency_days', 0)
    ),
    'venue'
  );
  -- unknown_src gets neutral 0.5, test_low_rel has 0.2 → unknown should win on equal value
  v_winner := v_result->>'resolved_source';
  IF v_winner <> 'unknown_src' THEN
    RAISE EXCEPTION 'T4 FAILED: expected unknown_src (neutral 0.5 > 0.2), got %  full=%', v_winner, v_result;
  END IF;
  RAISE NOTICE 'T4 PASSED: unknown source neutral fallback';

  -- ===== Test 5: longer value tilts the score when reliability close =====
  -- Tie-ish weights but very different lengths. Use two sources with same weight.
  INSERT INTO public.source_reliability(source_slug, entity_type, weight, sample_size)
  VALUES
    ('test_eq_a', 'venue', 0.60, 1000),
    ('test_eq_b', 'venue', 0.60, 1000)
  ON CONFLICT (source_slug, entity_type) DO UPDATE SET weight = 0.60;

  v_result := public.resolve_field_conflict(
    jsonb_build_array(
      jsonb_build_object('source','test_eq_a','value', to_jsonb('Short'::text), 'recency_days', 0),
      jsonb_build_object('source','test_eq_b','value', to_jsonb(repeat('Long description content. ', 10)), 'recency_days', 0)
    ),
    'venue'
  );
  v_winner := v_result->>'resolved_source';
  IF v_winner <> 'test_eq_b' THEN
    RAISE EXCEPTION 'T5 FAILED: expected test_eq_b (longer), got %  full=%', v_winner, v_result;
  END IF;
  RAISE NOTICE 'T5 PASSED: longer value wins on equal weight';

  -- ===== Cleanup =====
  DELETE FROM public.source_reliability WHERE source_slug IN ('test_high_rel','test_low_rel','test_eq_a','test_eq_b');

  RAISE NOTICE 'all-tests-passed';
END;
$$;
