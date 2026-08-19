-- ============================================================================
-- A stale safety note stayed PUBLISHED whenever the recomposed one needed a
-- human — i.e. on exactly the destinations where naming the wrong country hurts.
-- ----------------------------------------------------------------------------
-- 20260816112824 fixed "86 city safety notes described the wrong country" in
-- two parts: a one-shot retraction of the 86 then-live rows, and a selector
-- change making a stale derived note ELIGIBLE work rather than invisible state:
--
--   OR (c.field_provenance->'safety_notes'->>'source' = 'derived'
--       AND c.safety_notes NOT ILIKE '%' || co.name || '%')
--
-- That gets the row SELECTED. It does not get the wrong text off the page. The
-- auto-publish branch overwrites safety_notes and is therefore self-healing;
-- the ELSE branch only INSERTs into entity_review_queue and raises
-- needs_attention, so the note the composer just judged unfit to publish keeps
-- serving to readers while it waits for a human.
--
-- Auto-publish needs risk_tier='low' AND equality_score >= 75 AND
-- not-criminalizing AND not-death-penalty AND confidence >= 0.8. So the gap is
-- not uniform across the corpus: it is the whole sub-75 half of it, which is
-- where a wrong jurisdiction is most dangerous to a queer traveller.
--
-- Observed live 2026-08-19 while clearing the city_country_mismatch release
-- gate. Six cities had their country_id repaired via apply_city_country_repair;
-- GB and GR (equality 100) auto-republished themselves correctly, but:
--
--   Novosibirsk (now RU, equality 55) kept "Same-sex relationships are legal
--                                          in GERMANY..."
--   Sendai      (now JP, equality 71) kept "Same-sex relationships are legal
--                                          in the UNITED STATES..."
--
-- Both were cleared by hand in that session, so there is no live victim right
-- now — the next country repair into a sub-75 country reproduces it.
--
-- FIX. The ELSE branch retracts too, under the same predicate and with the same
-- bookkeeping as part 1 of 20260816112824: the old text is preserved under
-- field_provenance.safety_notes.retracted (this unpublishes, it does not
-- destroy) and needs_attention is raised. That migration's own rationale
-- already argues for it — "Clearing a dangerous claim is the conservative
-- direction: it removes an assertion rather than making one."
--
-- Only 'derived' notes are ever retracted. A note whose provenance source is
-- 'llm+human' has been through approve_city_review and is never touched — the
-- selector already excludes those rows, and the retraction predicate demands
-- source='derived' independently, so it is guarded twice.
--
-- Retraction and needs_attention are ONE statement, not two. cities UPDATEs
-- fire trg_search_documents_city; the 300-row batch cap on this job exists
-- because of that trigger, and a second UPDATE per queued row would double the
-- cost of the branch that runs on most of the corpus.
--
-- The one-shot below covers the rows the recurring job can no longer reach: a
-- city that already carries an OPEN safety_notes review row is skipped by the
-- selector's NOT EXISTS guard (correctly — it is waiting on a human), so a note
-- that went stale after being queued would never be re-examined. It is bounded
-- at 300 rows per statement for the same trigger reason.
-- ============================================================================

-- ── 1. Self-heal: the ELSE branch unpublishes what it could not republish ────
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
           -- A published derived note that does not name the city's OWN country.
           -- Computed here so the ELSE branch does not have to re-derive it.
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.safety_notes NOT ILIKE '%' || co.name || '%')       AS stale_note,
           (SELECT count(*) FROM public.venues v          WHERE v.city_id=c.id) AS venues,
           (SELECT count(*) FROM public.events e          WHERE e.city_id=c.id) AS events,
           (SELECT count(*) FROM public.queer_villages q  WHERE q.city_id=c.id) AS villages
    FROM public.cities c
    JOIN public.countries co ON co.id=c.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE c.duplicate_of_id IS NULL
      AND (
            -- never written
            c.safety_notes IS NULL OR length(trim(c.safety_notes))=0
            -- or written from a country this city no longer belongs to. Only
            -- 'derived' notes are re-examined: a human- or LLM+human-approved
            -- note is never overwritten by the composer.
            OR (c.field_provenance->'safety_notes'->>'source' = 'derived'
                AND c.safety_notes NOT ILIKE '%' || co.name || '%')
          )
      AND coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      AND NOT EXISTS (SELECT 1 FROM public.entity_review_queue q
                      WHERE q.entity_type='city' AND q.entity_id=c.id
                        AND q.field='safety_notes' AND q.status='open')
    ORDER BY (c.is_major_city IS TRUE) DESC, c.id
    LIMIT p_batch
  LOOP
    v_examined := v_examined + 1;
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
            -- Stamp the country the note was composed FROM, so a future reader
            -- has a key rather than only the prose to compare against.
            'country_id', rec.country_id,
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

      -- The proposed note waits for a human; the WRONG one must not keep
      -- serving in the meantime. Retract it, preserving the old text under
      -- field_provenance.safety_notes.retracted exactly as the one-shot in
      -- 20260816112824 did. One statement, so a queued row costs one
      -- trg_search_documents_city fire, not two.
      UPDATE public.cities SET
        needs_attention = true,
        safety_notes = CASE WHEN rec.stale_note THEN NULL ELSE safety_notes END,
        field_provenance = CASE WHEN rec.stale_note THEN
            jsonb_set(coalesce(field_provenance,'{}'::jsonb), ARRAY['safety_notes'],
              coalesce(field_provenance->'safety_notes','{}'::jsonb)
                || jsonb_build_object(
                     'retracted', jsonb_build_object(
                       'value',  safety_notes,
                       'reason', 'note described a different country than the city''s own',
                       'at',     now()),
                     'value', NULL::text),
              true)
          ELSE field_provenance END
      WHERE id=rec.city_id;
      IF rec.stale_note THEN v_retracted := v_retracted + 1; END IF;

      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined,
    items_changed=v_published+v_queued,
    summary=jsonb_build_object('examined',v_examined,'published',v_published,
                               'queued',v_queued,'retracted',v_retracted)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'published',v_published,
                            'queued',v_queued,'retracted',v_retracted);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;

COMMENT ON FUNCTION public.run_city_safety_backfill(integer, boolean) IS
  'Composes deterministic safety notes for cities. Auto-publishes only low-risk, high-equality destinations; everything else queues in entity_review_queue for a human AND retracts any published derived note that names a different country than the city''s own. Writes the BASE table, not the city_review_queue compat view — a view cannot carry ON CONFLICT.';

-- ── 2. One-shot: the rows the selector can no longer reach ───────────────────
-- A city with an OPEN safety_notes review row is skipped by the job's NOT
-- EXISTS guard, so a note that went stale AFTER being queued is unreachable by
-- part 1. Bounded at 300 per statement (trg_search_documents_city); the loop
-- terminates because clearing safety_notes falsifies the predicate.
DO $$
DECLARE v_n int; v_total int := 0;
BEGIN
  LOOP
    WITH stale AS (
      SELECT c.id
      FROM public.cities c
      JOIN public.countries co ON co.id = c.country_id
      WHERE c.safety_notes IS NOT NULL
        AND length(trim(c.safety_notes)) > 0
        AND c.field_provenance->'safety_notes'->>'source' = 'derived'
        AND c.safety_notes NOT ILIKE '%' || co.name || '%'
      LIMIT 300)
    UPDATE public.cities c
    SET safety_notes = NULL,
        needs_attention = true,
        field_provenance = jsonb_set(
          coalesce(c.field_provenance, '{}'::jsonb),
          ARRAY['safety_notes'],
          coalesce(c.field_provenance->'safety_notes', '{}'::jsonb)
            || jsonb_build_object(
                 'retracted', jsonb_build_object(
                   'value',  c.safety_notes,
                   'reason', 'note described a different country than the city''s own',
                   'at',     now()),
                 'value', NULL::text),
          true)
    FROM stale s
    WHERE c.id = s.id;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;
  RAISE NOTICE 'retracted % stale derived city safety note(s)', v_total;
END $$;
