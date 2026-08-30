-- Phase 2 part D, ORDERING FIX — this file is the definitive definition of
-- run_city_safety_backfill. It exists because of a migration-ordering hazard, not because
-- the logic changed: the body below is identical to 20260830132442.
--
-- THE HAZARD. The fact-drift work was applied early to prod via MCP `apply_migration`,
-- which stamps its OWN call-time version. That produced 20260830132243 and 20260830132442
-- — versions that sort BEFORE the previously-latest definition of this function,
-- 20260912164200_city_safety_retract_stale_note_on_queue.sql.
--
-- On prod this is invisible: `db push` matches by version and SKIPS an already-applied
-- migration, so the 0912 file never re-runs and the live function is correct (verified:
-- run_city_safety_backfill(3, true) returned fact_unstamped:3, fact_drift:0, retracted:0).
--
-- But on a FRESH `db reset`, migrations replay in filename order:
--     20260830132243 (adds fingerprint)
--     20260830132442 (unstamped != drifted)
--     20260912164200 (OLD definition — silently reverts both)
-- and the rebuilt database would quietly lose fact-drift detection entirely, with every
-- guard test still green because they read the migrations directory in the same broken
-- order. That is the same shape as the duplicate-version silent skip already recorded in
-- this repo's history: the environment where it bites is not the one you are looking at.
--
-- Numbering this above the repo ceiling makes the last writer the correct one in BOTH
-- environments. Do not renumber the two 0830 files to fix this instead — their versions
-- are already recorded in remote `schema_migrations`, and renaming them would leave a
-- remote version with no repo file, which is exactly the drift that halts every PR.

CREATE OR REPLACE FUNCTION public.run_city_safety_backfill(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now();
  v_examined int := 0; v_published int := 0; v_queued int := 0; v_retracted int := 0;
  v_drifted int := 0; v_unstamped int := 0;
  rec record; v_in jsonb; v_out jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug='city_safety_backfill';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'city_safety_backfill',v_started,'success',0,0) RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  FOR rec IN
    SELECT c.id AS city_id, c.name AS city_name,
           co.id AS country_id, co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary'        AS unions_summary,
           uu.u->>'marriage'       AS marriage,
           uu.u->>'marriage_since' AS marriage_since,
           fk.k                    AS fact_key,
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.safety_notes NOT ILIKE '%' || co.name || '%')       AS stale_note,
           -- Stamped, and the stamp disagrees with the country's CURRENT facts.
           -- This is evidence the note is wrong: eligible AND retractable.
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.field_provenance->'safety_notes'->'facts' IS NOT NULL
            AND c.field_provenance->'safety_notes'->'facts' IS DISTINCT FROM fk.k) AS fact_drift,
           -- No stamp yet. Absence of evidence: eligible so it ACQUIRES one, but never
           -- grounds to retract. This is what makes the pre-existing corpus self-heal.
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.field_provenance->'safety_notes'->'facts' IS NULL)  AS fact_unstamped,
           (SELECT count(*) FROM public.venues v          WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e          WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages q  WHERE q.city_id=c.id) AS villages
    FROM public.cities c
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    LEFT JOIN LATERAL (SELECT public.city_safety_fact_key(jsonb_build_object(
                                'country_name',   co.name,
                                'equality_score', co.equality_score,
                                'criminalizing',  (co.lgbti_criminalization->>'legal')='false',
                                'death_penalty',  (co.lgbti_criminalization->>'death_penalty')='Yes',
                                'penalty',        co.lgbti_criminalization->>'penalty',
                                'unions_summary', uu.u->>'summary',
                                'marriage',       uu.u->>'marriage',
                                'marriage_since', uu.u->>'marriage_since')) AS k) fk ON true
    WHERE c.duplicate_of_id IS NULL
      AND (
            c.safety_notes IS NULL OR length(trim(c.safety_notes))=0
            OR (c.field_provenance->'safety_notes'->>'source' = 'derived'
                AND c.safety_notes NOT ILIKE '%' || co.name || '%')
            -- Both the stamped-and-changed and the never-stamped cases are eligible; only
            -- the first is later allowed to retract.
            OR (c.field_provenance->'safety_notes'->>'source' = 'derived'
                AND c.field_provenance->'safety_notes'->'facts' IS DISTINCT FROM fk.k)
          )
      AND coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      AND NOT EXISTS (SELECT 1 FROM public.entity_review_queue q
                      WHERE q.entity_type='city' AND q.entity_id=c.id
                        AND q.field='safety_notes' AND q.status='open')
    ORDER BY (c.is_major_city IS TRUE) DESC, c.id
    LIMIT p_batch
  LOOP
    v_examined := v_examined + 1;
    IF rec.fact_drift     THEN v_drifted   := v_drifted   + 1; END IF;
    IF rec.fact_unstamped THEN v_unstamped := v_unstamped + 1; END IF;
    v_in := jsonb_build_object(
      'surface','city','country_name',rec.country_name,'equality_score',rec.equality_score,
      'criminalizing',rec.criminalizing,'death_penalty',rec.death_penalty,'penalty',rec.penalty,
      'unions_summary',rec.unions_summary,'marriage',rec.marriage,'marriage_since',rec.marriage_since,
      'city_name',rec.city_name,
      'density', jsonb_build_object('venues',rec.venues,'events',rec.events,'villages',rec.villages));
    v_out := public.compose_safety_note(v_in);

    IF (v_out->>'auto_publishable')::boolean THEN
      UPDATE public.cities SET
        safety_notes = v_out->>'note',
        field_provenance = jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
          jsonb_build_object('value', v_out->>'note', 'source','derived',
            'confidence',(v_out->>'confidence')::numeric, 'risk_tier',v_out->>'risk_tier',
            'country_id', rec.country_id,
            'facts', rec.fact_key,
            'approved_at', now()), true)
      WHERE id=rec.city_id;
      v_published := v_published + 1;
    ELSE
      INSERT INTO public.entity_review_queue
        (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
      VALUES ('city', rec.city_id,'safety_notes',
        jsonb_build_object('value',v_out->>'note',
          'rationale','Composed from country legal status + city LGBTQ+ density',
          'risk_tier',v_out->>'risk_tier'),
        '[]'::jsonb, (v_out->>'confidence')::numeric, 'composer:derived','open')
      ON CONFLICT (entity_type, entity_id, field) WHERE status='open'
      DO UPDATE SET proposed_value=EXCLUDED.proposed_value, confidence=EXCLUDED.confidence,
                    model=EXCLUDED.model, created_at=now();

      -- Retract on EVIDENCE only: wrong country, or stamped facts that changed.
      -- `fact_unstamped` is deliberately absent from this condition.
      UPDATE public.cities SET
        needs_attention = true,
        safety_notes = CASE WHEN rec.stale_note OR rec.fact_drift THEN NULL ELSE safety_notes END,
        field_provenance = CASE WHEN rec.stale_note OR rec.fact_drift THEN
            jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
              coalesce(field_provenance->'safety_notes','{}'::jsonb)
                || jsonb_build_object(
                     'retracted', jsonb_build_object(
                       'value',  safety_notes,
                       'reason', CASE WHEN rec.stale_note
                                      THEN 'note described a different country than the city''s own'
                                      ELSE 'country legal facts changed since the note was composed' END,
                       'at',     now()),
                     'value', NULL::text),
              true)
          ELSE field_provenance END
      WHERE id=rec.city_id;
      IF rec.stale_note OR rec.fact_drift THEN v_retracted := v_retracted + 1; END IF;

      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined,
    items_changed=v_published+v_queued,
    summary=jsonb_build_object('examined',v_examined,'published',v_published,
                               'queued',v_queued,'retracted',v_retracted,
                               'fact_drift',v_drifted,'fact_unstamped',v_unstamped)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'published',v_published,
                            'queued',v_queued,'retracted',v_retracted,
                            'fact_drift',v_drifted,'fact_unstamped',v_unstamped);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;
