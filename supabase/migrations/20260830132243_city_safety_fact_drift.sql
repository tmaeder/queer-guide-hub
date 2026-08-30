-- Phase 2 — Legal corroboration, part D: safety_notes FACT drift.
-- Spec: docs/superpowers/specs/2026-08-30-legal-corroboration-phase-2-design.md
--
-- THE GAP. Eligibility in run_city_safety_backfill has been, since 20260912164200:
--     (note never written)
--  OR (source='derived' AND safety_notes NOT ILIKE '%' || country.name || '%')
-- The text test detects a city being RELINKED to another country — the failure that left
-- 86 published notes describing a different jurisdiction. It cannot detect a country
-- CHANGING ITS LAW: the prose still names the correct country and
-- field_provenance.safety_notes.country_id still points at it, so the row satisfies
-- neither arm and is never re-examined. The note serves outdated law indefinitely, on
-- exactly the destinations where being wrong is most dangerous.
--
-- THE FIX. Stamp a fingerprint of the LEGAL INPUTS the composer actually read, and make a
-- mismatch against the country's CURRENT inputs an eligibility condition. The 8 fields are
-- precisely the legal half of the `v_in` object already built per row, so the stamp costs
-- nothing extra to compute.
--
-- WHY `density` IS DELIBERATELY EXCLUDED. compose_safety_note() also reads venue/event/
-- village counts, but those churn continuously: including them would make every city with
-- any ingest activity eligible every night, and each write walks
-- cities → geo_places → search_reindex_queue on a disk-constrained DB. Density drift
-- changes the note's TONE, not its legal correctness. This is a deliberate, bounded
-- residue, recorded rather than implied away.
--
-- WHY NO BACKFILL. All ~4,529 existing derived notes are unstamped, so they are eligible
-- once, recompose, and stamp — converging at 300/night in roughly 15 nights. That is
-- preferred over a migration that stamps TODAY's facts onto an OLD note: doing so would
-- record "these facts produced this note" without proving it, and would permanently bless
-- a note that had ALREADY drifted. The same reasoning gated 20260913114500's country_id
-- stamp on the note naming its current country.
--
-- WHAT THIS DOES NOT CHANGE: the outing-safety invariant. compose_safety_note() still
-- forces auto_publishable=false for criminalising and death-penalty countries, and
-- approve_city_review() still requires p_confirm=true. A fact-drifted note now reaches the
-- existing ELSE branch, which retracts it — so it stops serving stale law while it waits
-- for a human, instead of serving it for months.
--
-- No explicit BEGIN/COMMIT — db push wraps migrations; an explicit COMMIT lands the data
-- while breaking history bookkeeping.

-- ── Normalisation ───────────────────────────────────────────────────────────────
-- '' , NULL and ILGA's literal 'No data' are the SAME absence and must produce the same
-- key, or a cosmetic upstream flicker would fire the detector on the whole corpus.
CREATE OR REPLACE FUNCTION public.safety_fact_norm(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
           nullif(nullif(lower(trim(coalesce(p_value, ''))), ''), 'no data'),
           '');
$$;

COMMENT ON FUNCTION public.safety_fact_norm(text) IS
  'Normalises a composer input for fingerprinting: NULL, empty and ''No data'' collapse to ''''.';

-- ── The fingerprint ─────────────────────────────────────────────────────────────
-- Takes the SAME jsonb shape passed to compose_safety_note() and projects only the legal
-- half. IMMUTABLE so it can be compared in a WHERE clause without a per-row function-call
-- penalty in the planner.
CREATE OR REPLACE FUNCTION public.city_safety_fact_key(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'country_name',   public.safety_fact_norm(p->>'country_name'),
    'equality_score', public.safety_fact_norm(p->>'equality_score'),
    'criminalizing',  public.safety_fact_norm(p->>'criminalizing'),
    'death_penalty',  public.safety_fact_norm(p->>'death_penalty'),
    'penalty',        public.safety_fact_norm(p->>'penalty'),
    'unions_summary', public.safety_fact_norm(p->>'unions_summary'),
    'marriage',       public.safety_fact_norm(p->>'marriage'),
    'marriage_since', public.safety_fact_norm(p->>'marriage_since'));
$$;

COMMENT ON FUNCTION public.city_safety_fact_key(jsonb) IS
  'Fingerprint of the LEGAL composer inputs for a city safety note. Excludes density on purpose — see 20261103100100.';

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
  v_drifted int := 0;
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
           -- A published derived note that does not name the city's OWN country.
           -- Computed here so the ELSE branch does not have to re-derive it.
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.safety_notes NOT ILIKE '%' || co.name || '%')       AS stale_note,
           -- NEW: a published derived note whose stamped legal facts no longer match the
           -- country's current ones. Unstamped notes count as drifted, which is what makes
           -- the ~4,529 pre-existing rows self-heal one batch at a time.
           (c.safety_notes IS NOT NULL
            AND length(trim(c.safety_notes)) > 0
            AND c.field_provenance->'safety_notes'->>'source' = 'derived'
            AND c.field_provenance->'safety_notes'->'facts' IS DISTINCT FROM fk.k) AS fact_drift,
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
            -- never written
            c.safety_notes IS NULL OR length(trim(c.safety_notes))=0
            -- or written from a country this city no longer belongs to. Only
            -- 'derived' notes are re-examined: a human- or LLM+human-approved
            -- note is never overwritten by the composer.
            OR (c.field_provenance->'safety_notes'->>'source' = 'derived'
                AND c.safety_notes NOT ILIKE '%' || co.name || '%')
            -- NEW: or composed from legal facts that have since changed. This is the arm
            -- the country-name test structurally cannot reach.
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
    IF rec.fact_drift THEN v_drifted := v_drifted + 1; END IF;
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
            -- NEW: and the LEGAL FACTS it was composed from, so a future reader can tell
            -- that the country is unchanged but its LAW is not.
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

      -- The proposed note waits for a human; the WRONG one must not keep
      -- serving in the meantime. Retract it, preserving the old text under
      -- field_provenance.safety_notes.retracted exactly as the one-shot in
      -- 20260816112824 did. One statement, so a queued row costs one
      -- trg_search_documents_city fire, not two.
      --
      -- Retraction now covers BOTH failure modes. A note whose facts drifted is wrong in
      -- the same way as one naming the wrong country — the only difference is which
      -- detector found it — so it must not keep serving either.
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
                               'queued',v_queued,'retracted',v_retracted,'fact_drift',v_drifted)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'published',v_published,
                            'queued',v_queued,'retracted',v_retracted,'fact_drift',v_drifted);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;
