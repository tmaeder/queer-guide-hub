-- ORDERING FIX, not new logic: re-apply the death_penalty_risk substitution last.
--
-- `20260904203255` rewrites the two `death_penalty = 'Yes'` tests inside
-- run_city_safety_backfill, but it was applied to prod via MCP and therefore carries a
-- call-time version that sorts BELOW `20261103100000_city_safety_fact_drift_final.sql`,
-- which redefines that same function.
--
-- On prod this is invisible: `db push` matches by version and skips an already-applied
-- migration, so 20261103100000 never re-runs and the live function is correct.
--
-- On a FRESH `db reset` the replay order is:
--     20260904203255  (substitutes — the definition in place is 20260830132442's,
--                      which does contain the two 'Yes' tests, so it succeeds)
--     20260912164200  (reverts)
--     20261103100000  (reverts again)
-- and the rebuilt database quietly loses the fix, with every guard test still green
-- because they read the migrations directory in that same order. The environment where
-- it bites is not the one you are looking at — the same shape as 20261103100000's own
-- header, one function later.
--
-- IDEMPOTENT BY CONSTRUCTION. Prod already has the substituted definition, so a strict
-- "expect exactly 2 occurrences" assertion would RAISE here on merge. It therefore
-- no-ops when the function already reads death_penalty_risk, and only substitutes when
-- it finds the pre-fix form — and still refuses to guess if it finds neither.

DO $$
DECLARE
  v_def text;
  v_hits int;
  v_needle constant text := '(co.lgbti_criminalization->>''death_penalty'')=''Yes''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_city_safety_backfill';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'run_city_safety_backfill not found';
  END IF;

  IF position('death_penalty_risk' in v_def) > 0 THEN
    RAISE NOTICE 'already substituted — nothing to do';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
  IF v_hits <> 2 THEN
    RAISE EXCEPTION
      'run_city_safety_backfill neither reads death_penalty_risk nor contains the 2 expected ''Yes'' tests (found %) — refusing to guess',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_needle,
    'public.death_penalty_risk(co.lgbti_criminalization) <> ''none''');
END $$;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_city_safety_backfill';

  IF position('death_penalty_risk' in v_def) = 0 THEN
    RAISE EXCEPTION 'run_city_safety_backfill still does not read death_penalty_risk';
  END IF;
  -- The branch that retracts a wrong note must survive every rewrite of this function.
  IF position('rec.stale_note OR rec.fact_drift' in v_def) = 0 THEN
    RAISE EXCEPTION 'retraction condition missing';
  END IF;
END $$;
