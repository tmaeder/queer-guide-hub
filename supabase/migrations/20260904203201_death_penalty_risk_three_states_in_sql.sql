-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260904203201 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- "No legal certainty" is not "No", and the SQL layer was reading it as one.
--
-- ILGA splits the capital-penalty fact across TWO fields and neither is sufficient alone:
--
--   Yemen     death_penalty 'Yes'                penalty 'Death Penalty'
--   Nigeria   death_penalty 'Yes'                penalty '10 years to life in prison'
--   Qatar     death_penalty 'No legal certainty' penalty 'Death Penalty (possible)'
--
-- Five countries sit in that third state — AE, AF, PK, QA, SO — where ILGA explicitly
-- records that it does NOT know, while naming the death penalty in `penalty`. Every SQL
-- reader tested `death_penalty = 'yes'`, so "the source cannot rule out execution" was
-- treated as identical to "the source says no". Absence of certainty read as a negative
-- finding — the same inversion this phase kept turning up.
--
-- THE TYPESCRIPT LAYER ALREADY GOT THIS RIGHT. `deathPenaltyRisk()` in
-- src/utils/equalityScore.ts models three states and `readCriminalisation` in
-- _shared/rights/verdict.ts mirrors it. This ports that same definition into SQL rather
-- than inventing a second one, so the two cannot drift on the platform's highest-stakes
-- field.
--
-- HOW IT SURFACED: the State Dept corroborator (20260904104703) flagged Afghanistan,
-- Somalia and Sudan as death-penalty disagreements. Two of the three were OUR bug, not
-- ILGA's gap — AF and SO are 'No legal certainty' + 'Death Penalty (possible)', which the
-- corroborator's own `^yes$` comparison also mis-read. Sudan is the opposite: ILGA says
-- 'No' with penalty '10 years to life in prison' (the 2020 reform replaced execution), and
-- the extractor false-positived there. So one flag was real, two were mirrors of this bug,
-- and none of the three warranted overwriting ILGA.
--
-- MEASURED IMPACT — a tier and a sentence, not a gate:
--   compose_safety_note for Kabul today -> 'high',     "...(penalty: Death Penalty (possible))"
--   with this fix                       -> 'critical', "...can carry the death penalty. Exercise extreme caution"
-- 8 published city notes sit in these five countries (AE 4, AF 2, PK 2), plus 63 venues
-- and 22 events.
--
-- IT CHANGES `safety_gated` FOR NOBODY: every country the widened predicate newly matches
-- is already high-risk via `legal = false`. The first draft of the assertion below claimed
-- otherwise and blocked this migration — it compared the spine-backed function against a
-- `countries`-backed expression, and for the five uninhabited territories whose
-- criminalisation object is '{}' that expression is NULL, not false, so
-- `false IS DISTINCT FROM NULL` counted as drift. The predicate never moved; the assertion
-- was wrong. It is kept, with the coalesce it should have had.
--
-- `confirmed` and `possible` stay distinct. A UI stating a fact ("carries the death
-- penalty") must use `confirmed`; "should this reader be warned" uses `<> 'none'`.
-- Collapsing them would overstate on five countries — a smaller harm than understating,
-- but still a false claim.

CREATE OR REPLACE FUNCTION public.death_penalty_risk(p_crim jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    -- Checked first: Nigeria is 'Yes' while its penalty text names only prison.
    WHEN coalesce(p_crim->>'death_penalty','') ~* '^\s*yes\s*$'        THEN 'confirmed'
    WHEN coalesce(p_crim->>'death_penalty','') ~* 'death'              THEN 'confirmed'
    WHEN coalesce(p_crim->>'death_penalty','') ~* 'no legal certainty' THEN 'possible'
    WHEN coalesce(p_crim->>'penalty','')       ~* 'death'              THEN 'possible'
    ELSE 'none'
  END;
$function$;

COMMENT ON FUNCTION public.death_penalty_risk(jsonb) IS
  'confirmed | possible | none. Mirrors deathPenaltyRisk() in src/utils/equalityScore.ts. "No legal certainty" is NOT "No".';

CREATE OR REPLACE FUNCTION public.location_is_high_risk(p_country_id uuid, p_city_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with resolved as (
    select coalesce(
      p_country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = p_city_id and gp.place_type = 'city')
    ) as country_id
  )
  select exists (
    select 1
    from public.geo_country_profiles cp, resolved r
    where cp.place_id = r.country_id
      and (
        (cp.lgbti_criminalization->>'legal') = 'false'
        or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
      )
  );
$function$;

DO $$
DECLARE v_af text; v_ng text; v_de text; v_sd text; v_drift int;
BEGIN
  SELECT public.death_penalty_risk(lgbti_criminalization) INTO v_af FROM public.countries WHERE code='AF';
  SELECT public.death_penalty_risk(lgbti_criminalization) INTO v_ng FROM public.countries WHERE code='NG';
  SELECT public.death_penalty_risk(lgbti_criminalization) INTO v_de FROM public.countries WHERE code='DE';
  SELECT public.death_penalty_risk(lgbti_criminalization) INTO v_sd FROM public.countries WHERE code='SD';
  IF v_af <> 'possible'  THEN RAISE EXCEPTION 'AF should be possible, got %', v_af; END IF;
  -- Nigeria: 'Yes' while its penalty names only prison — rules out reading `penalty` alone.
  IF v_ng <> 'confirmed' THEN RAISE EXCEPTION 'NG should be confirmed, got %', v_ng; END IF;
  IF v_de <> 'none'      THEN RAISE EXCEPTION 'DE should be none, got %', v_de; END IF;
  -- Sudan: the corroborator flagged it, but ILGA is right and must not be widened into.
  IF v_sd <> 'none'      THEN RAISE EXCEPTION 'SD should be none, got %', v_sd; END IF;

  SELECT count(*) INTO v_drift
    FROM public.countries co
   WHERE coalesce(public.location_is_high_risk(co.id, NULL), false)
         IS DISTINCT FROM coalesce(
           ((co.lgbti_criminalization->>'legal') = 'false')
             OR lower(coalesce(co.lgbti_criminalization->>'death_penalty','')) = 'yes', false);
  IF v_drift <> 0 THEN
    RAISE EXCEPTION 'widening moved the gate for % countries — expected 0', v_drift;
  END IF;
END $$;;
