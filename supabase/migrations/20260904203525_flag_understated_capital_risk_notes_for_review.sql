-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260904203525 with no repo file — the signature of
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
-- Flag the eight human-approved notes that understate capital risk. Do not overwrite them,
-- and do not retract them.
--
-- All eight published notes in the five 'No legal certainty' countries carry
-- field_provenance.safety_notes.source = 'llm+human' — a human approved each one. They were
-- composed by the machine at the wrong tier (death_penalty read as false) and then
-- approved, so the human ratified the machine's tier judgement without the machine ever
-- offering the stronger reading.
--
-- Kabul, verbatim:
--   "Same-sex activity is criminalized in Afghanistan (penalty: Death Penalty (possible)).
--    Kabul has 24 LGBTQ+ venues. Be discreet and aware of outing risks; same-sex activity
--    is illegal here."
-- The capital penalty survives only as a raw field dump inside nested parentheses; the
-- advice is the `high` tier's "be discreet" rather than the `critical` tier's "exercise
-- extreme caution"; and a venue count sits between the two, which in context reads closer
-- to reassurance than to warning.
--
-- WHY NEITHER OVERWRITE NOR RETRACT:
--   * Overwrite — 'llm+human' is the one provenance the composer is never allowed to touch.
--     Every automated path in this schema already excludes it, and a migration that made an
--     exception would be the precedent that erodes the rule.
--   * Retract — these notes are WEAK, not WRONG. They do say the activity is criminalised
--     and they do name a possible death penalty. Blanking them would leave a criminalising
--     destination with NO warning at all while it waited for a human, which is a worse
--     state than a weak one. That is the opposite trade from 20260830132442, where the
--     retracted notes described the wrong COUNTRY and were affirmatively misleading.
--
-- So: the corrected note is queued as a proposal, `needs_attention` is raised, and the
-- existing note keeps serving until a human chooses. The machine states the better reading;
-- the human decides. Nothing is published by this migration.

DO $$
DECLARE
  rec record; v_out jsonb; v_n int := 0;
BEGIN
  FOR rec IN
    SELECT c.id, c.name AS city_name, co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false' AS criminalizing,
           co.lgbti_criminalization->>'penalty' AS penalty,
           (SELECT count(*) FROM public.venues v WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages q WHERE q.city_id=c.id) AS villages
      FROM public.cities c
      JOIN public.countries co ON co.id = c.country_id
     WHERE c.duplicate_of_id IS NULL
       AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible'
       AND c.safety_notes IS NOT NULL
       AND length(trim(c.safety_notes)) > 0
  LOOP
    v_out := public.compose_safety_note(jsonb_build_object(
      'surface','city','country_name',rec.country_name,'equality_score',rec.equality_score,
      'criminalizing',rec.criminalizing,'death_penalty',true,'penalty',rec.penalty,
      'unions_summary',NULL,'marriage',NULL,'marriage_since',NULL,'city_name',rec.city_name,
      'density', jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages)));

    IF (v_out->>'auto_publishable')::boolean THEN
      RAISE EXCEPTION 'composer offered auto-publish for criminalising % — invariant broken', rec.country_name;
    END IF;

    INSERT INTO public.entity_review_queue
      (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
    VALUES ('city', rec.id, 'safety_notes',
      jsonb_build_object('value', v_out->>'note',
        'rationale','Existing note understates capital risk: this country records a POSSIBLE death penalty ("No legal certainty" + "Death Penalty (possible)"), which the SQL layer read as none, so the note was composed at risk_tier high instead of critical. Existing note left published — it is weak, not wrong.',
        'risk_tier', v_out->>'risk_tier',
        'supersedes_source','llm+human'),
      '[]'::jsonb, (v_out->>'confidence')::numeric, 'composer:derived', 'open')
    ON CONFLICT (entity_type, entity_id, field) WHERE status='open'
    DO UPDATE SET proposed_value=EXCLUDED.proposed_value, confidence=EXCLUDED.confidence,
                  model=EXCLUDED.model, created_at=now();

    UPDATE public.cities SET needs_attention = true WHERE id = rec.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'flagged nothing — contradicts the measured 8 published notes';
  END IF;
  RAISE NOTICE 'flagged % notes for review', v_n;
END $$;

DO $$
DECLARE v_q int; v_still int;
BEGIN
  SELECT count(*) INTO v_q FROM public.entity_review_queue q
    JOIN public.cities c ON c.id = q.entity_id
    JOIN public.countries co ON co.id = c.country_id
   WHERE q.entity_type='city' AND q.field='safety_notes' AND q.status='open'
     AND public.death_penalty_risk(co.lgbti_criminalization) = 'possible';
  IF v_q < 8 THEN RAISE EXCEPTION 'expected >= 8 queued, got %', v_q; END IF;

  -- The existing notes must still be serving. This migration publishes and removes nothing.
  SELECT count(*) INTO v_still FROM public.cities c JOIN public.countries co ON co.id=c.country_id
   WHERE public.death_penalty_risk(co.lgbti_criminalization)='possible'
     AND c.safety_notes IS NOT NULL AND length(trim(c.safety_notes))>0;
  IF v_still < 8 THEN RAISE EXCEPTION 'a note was removed — expected all 8 to remain published, % left', v_still; END IF;
END $$;;
