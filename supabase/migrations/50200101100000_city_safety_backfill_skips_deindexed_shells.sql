-- ============================================================================
-- run_city_safety_backfill: stop composing safety notes for pages nobody can
-- reach
--
-- Measured on prod 2026-09-14. `entity_review_queue` holds 3,997 open rows
-- against 242 human decisions in the queue's entire life — 231 of them in
-- a single burst on 2026-07-26, and FIVE in the last sixty days. It is
-- worked in rare bursts and otherwise untouched, so anything occupying it
-- that cannot be decided is displacing something that can. The largest
-- city cohort is `safety_notes`, 692 open — and 253 of those target a city
-- whose `shell_status` is 'ghost' or 'merged'.
--
-- A ghost city is, by `20260821051221`'s own classifier, a row with zero
-- venues and zero events that the recompute has ALSO set `seo_indexable=false`
-- on. It is excluded from the sitemap, from `search_documents`
-- (`20261016110000`), and from `CityDistricts`. Composing a safety note for it
-- produces a proposal about a page that no reader — crawler or human — can
-- arrive at, and then asks a reviewer to make an outing-safety judgement about
-- it. That is not a decision, it is a distraction from the 346 proposals in
-- this same queue that DO sit on criminalizing destinations.
--
-- The selector already carried `c.duplicate_of_id IS NULL`, so merged rows
-- were excluded at source; the 24 merged-away rows in the queue today were
-- queued BEFORE their city was merged, and are cleaned up by
-- `run_review_queue_close_unactionable` in the next migration rather than
-- here. This change is only about not MAKING more of them.
--
-- THIS IS A PRECONDITION FOR THAT CLOSER, NOT A FIX FOR ACTIVE SPAM, AND THE
-- DISTINCTION MATTERS. Dry-run on prod 2026-09-14: the selector currently
-- matches THREE cities, not 253 — its own `NOT EXISTS (... status='open')`
-- guard means the 692 rows already sitting open block it from re-selecting
-- them, so the job is presently idle behind its own backlog and composes
-- almost nothing. The 253 ghost proposals were made once and got stuck.
--
-- That is precisely why this migration has to land BEFORE the closer. The
-- moment those 253 rows move open -> rejected, the NOT EXISTS guard stops
-- holding them back, every one becomes eligible again (empty note, no
-- duplicate_of_id, no open row), and the composer would re-create all 253
-- over the following nights at 300/batch — the rejection treadmill this repo
-- has already measured once on `marketplace-tag-backfill`, where 126 listings
-- were rejected more than once. Shipped alone, the closer would be a loop.
-- Shipped in this order, the pair is terminal.
--
-- With the predicate applied the same dry run matches ONE city, i.e. two of
-- the three currently-eligible rows are themselves deindexed shells.
--
-- WHY THIS IS NOT A LOSS, AND WHY IT SELF-HEALS. `shell_status` is recomputed
-- nightly by `run_city_completeness_recompute` / `run_city_trust_recompute`,
-- which route a row OUT of 'ghost' and restore `seo_indexable` the moment it
-- gains real content. The eligibility predicate below is evaluated per run, so
-- a shell that acquires a venue is composed for on the very next nightly pass.
-- Nothing is stamped, nothing is terminal, and there is no state to reset —
-- which is deliberately unlike the `data_unavailable` sentinel used elsewhere,
-- because "this city currently has no readers" is a fact about today, not an
-- exhausted source.
--
-- THE ONE THING THIS MUST NOT DO is suppress a note for a city that is merely
-- THIN. `shell_status='placeholder'` is the thin-but-indexable tier (1,952
-- rows, all of them live in `search_documents` — measured 2026-09-02) and is
-- deliberately NOT in the exclusion: a placeholder city is reachable, and a
-- reachable city in a criminalizing country is exactly who this note is for.
-- Only 'ghost' and 'merged' are excluded, which is the same pair
-- `search_documents_index_cities` itself excludes. The verify block asserts
-- that placeholders survive.
--
-- The body is restated in full because the change is a predicate in the middle
-- of the selector's WHERE clause and there is no wrapper seam to use. It is
-- reproduced from the live `pg_get_functiondef` output read immediately before
-- authoring; the ONLY edit is the two-line `shell_status` predicate and this
-- comment. Everything else — the fact-key staleness arms, the retract-on-
-- evidence branch, the run bookkeeping — is byte-for-byte the deployed text.
-- ============================================================================

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
           public.death_penalty_risk(co.lgbti_criminalization) <> 'none' AS death_penalty,
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
                                'death_penalty',  public.death_penalty_risk(co.lgbti_criminalization) <> 'none',
                                'penalty',        co.lgbti_criminalization->>'penalty',
                                'unions_summary', uu.u->>'summary',
                                'marriage',       uu.u->>'marriage',
                                'marriage_since', uu.u->>'marriage_since')) AS k) fk ON true
    WHERE c.duplicate_of_id IS NULL
      -- A deindexed shell has no readers: not in the sitemap, not in
      -- search_documents, not linked from its country page. Composing an
      -- outing-safety note for it manufactures review work about a page
      -- nobody can reach. 'placeholder' is deliberately NOT excluded — thin
      -- but reachable is exactly who the note is for.
      AND coalesce(c.shell_status::text,'real') NOT IN ('ghost','merged')
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

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Assert the predicate is present AND that it did not over-reach. A migration
-- that excluded 'placeholder' too would still pass a "ghosts are gone" test,
-- so the placeholder control is the load-bearing half.
DO $verify$
DECLARE
  v_src   text := pg_get_functiondef('public.run_city_safety_backfill(integer,boolean)'::regprocedure);
  v_ghost int;
  v_place int;
BEGIN
  IF position($$NOT IN ('ghost','merged')$$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'shell_status exclusion missing from run_city_safety_backfill';
  END IF;
  IF position('placeholder''' IN v_src) > 0 THEN
    RAISE EXCEPTION 'placeholder must NOT be excluded: thin-but-reachable cities still need notes';
  END IF;

  -- Positive controls against the live corpus: there must BE ghosts this would
  -- have composed for (else the change is decorative), and there must still be
  -- reachable cities left to compose for (else it starved the job).
  SELECT count(*) INTO v_ghost FROM public.cities c
   WHERE c.duplicate_of_id IS NULL
     AND coalesce(c.shell_status::text,'real') IN ('ghost','merged')
     AND (c.safety_notes IS NULL OR length(trim(c.safety_notes))=0);
  SELECT count(*) INTO v_place FROM public.cities c
   WHERE c.duplicate_of_id IS NULL
     AND coalesce(c.shell_status::text,'real') = 'placeholder';

  IF v_ghost = 0 THEN
    RAISE EXCEPTION 'no deindexed shells found — predicate would be a no-op, re-measure before shipping';
  END IF;
  IF v_place = 0 THEN
    RAISE EXCEPTION 'no placeholder cities found — the placeholder control cannot be trusted';
  END IF;

  RAISE NOTICE 'city_safety_backfill: % deindexed shells now skipped, % placeholders still eligible',
    v_ghost, v_place;
END
$verify$;
