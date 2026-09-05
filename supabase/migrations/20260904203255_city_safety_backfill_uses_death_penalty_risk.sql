-- Feed the three-state capital-penalty reading into the safety-note composer.
--
-- `run_city_safety_backfill` tested `(co.lgbti_criminalization->>'death_penalty')='Yes'`
-- in TWO places — the row it passes to compose_safety_note, and the fact fingerprint —
-- so the five 'No legal certainty' countries (AE, AF, PK, QA, SO) reached the composer as
-- death_penalty=false. Measured for Kabul: risk_tier 'high' with the capital penalty
-- buried as "(penalty: Death Penalty (possible))", where the correct reading gives
-- 'critical' and "can carry the death penalty. Exercise extreme caution".
--
-- Done as a targeted substitution on the live definition rather than by restating 150
-- lines, because a restatement of this function is a known merge-collision surface and
-- every line I did not intend to touch is a line I could get wrong. The replacement count
-- is asserted, so a silent no-op — the actual danger of string surgery — cannot pass.
--
-- REPLAY-SAFE ON A FRESH REBUILD: this reads whatever definition is current and rewrites
-- two expressions in it. On `db reset` the current definition at this point is
-- 20261103100000's, which contains exactly the two occurrences asserted below. If a later
-- migration ever changes that function, this one will find a count other than 2 and RAISE
-- rather than silently doing nothing.
--
-- CONSEQUENCE, and it is the intended one: `death_penalty` is one of the eight fields in
-- the fact fingerprint, so cities in those five countries now mismatch their stamp and
-- become fact-drift eligible. They are criminalising, so the composer refuses to
-- auto-publish; they take the ELSE branch, which RETRACTS the understated note and queues
-- it for a human. A note that understated capital risk should stop serving while it waits,
-- which is exactly what 20260830132442 built that branch to do.

DO $$
DECLARE
  v_def text;
  v_new text;
  v_hits int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_city_safety_backfill';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'run_city_safety_backfill not found';
  END IF;

  -- Both occurrences are the same literal expression.
  v_hits := (length(v_def) - length(replace(v_def,
              '(co.lgbti_criminalization->>''death_penalty'')=''Yes''', '')))
            / length('(co.lgbti_criminalization->>''death_penalty'')=''Yes''');

  IF v_hits <> 2 THEN
    RAISE EXCEPTION 'expected 2 occurrences of the death_penalty test, found % — refusing to guess', v_hits;
  END IF;

  v_new := replace(v_def,
    '(co.lgbti_criminalization->>''death_penalty'')=''Yes''',
    'public.death_penalty_risk(co.lgbti_criminalization) <> ''none''');

  EXECUTE v_new;
END $$;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_city_safety_backfill';

  IF position('death_penalty_risk' in v_def) = 0 THEN
    RAISE EXCEPTION 'substitution did not take — function still reads the raw field';
  END IF;
  IF position('(co.lgbti_criminalization->>''death_penalty'')=''Yes''' in v_def) > 0 THEN
    RAISE EXCEPTION 'an old ''Yes'' test survived the substitution';
  END IF;
  -- The retraction branch must still be intact; this migration must not have eaten it.
  IF position('rec.stale_note OR rec.fact_drift' in v_def) = 0 THEN
    RAISE EXCEPTION 'retraction condition missing after substitution';
  END IF;
END $$;
