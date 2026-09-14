-- ============================================================================
-- Auto-approve the review queue at a confidence threshold (operator decision)
--
-- The Quality queue held 3,997 open rows at an average age of 41 days with
-- ZERO human decisions among them. The operator's decision is to stop waiting:
-- approve everything at confidence >= 0.90 without a human, across every field.
-- Measured population at 0.90 on prod: 1,409 rows.
--
--   city.safety_notes                627   (287 risk-gated)
--   venue.accessibility_attributes   588
--   venue.accessibility_notes        131
--   city.lgbt_friendly_rating         25
--   city.editorial_hook               24
--   city.best_time_to_visit            5
--   village.description/hook/history   9
--
-- ── This is NOT approve_entity_review in a loop, and it cannot be ──────────
-- `approve_entity_review` opens with has_any_role_jwt(ARRAY['admin']) and
-- RAISEs 42501 'unauthorized' when it fails. pg_cron carries no JWT, so every
-- call from a scheduled job would abort. It also stamps the audit
-- source='llm+human' and passes approved_by=auth.uid() — NULL from cron — so
-- even if it ran it would record a human approval that never happened.
--
-- So this composes the SAME internals that function composes
-- (_apply_review_value, _review_write_provenance, _review_write_audit,
-- _review_clear_needs_attention). One implementation of the apply rule: the
-- apply_mode dispatch, provenance and needs_attention clearing stay byte-for-
-- byte the behaviour a human approval gets. What differs is attribution, and
-- only attribution: reviewer_id stays NULL, the note carries an 'auto-approve:'
-- prefix, and the audit source is 'llm' rather than 'llm+human'.
--
-- KNOWN COARSENESS, recorded rather than hidden: _review_write_audit's VENUE
-- branch hardcodes agreeing_sources = ARRAY['llm','human'] whenever the action
-- is 'auto_commit', and 'auto_commit' is one of only four values
-- city_consensus_audit's CHECK permits, so the action cannot be renamed per
-- caller without forking a shared helper. The row-level truth therefore lives
-- in details: machine_autoapprove=true, human_reviewed=false, approved_by=null.
-- Read details, not agreeing_sources, to tell a machine approval from a human
-- one.
--
-- ── Two guards survive the threshold, because both are MEASURED defects ────
-- (1) UNREACHABLE ENTITY -> reject, never publish. 209 of the 627 safety notes
--     at >=0.90 target a ghost/merged city: a page absent from the sitemap,
--     from search_documents and from every link. Publishing a note there is
--     not a safety win, it is work about a page nobody can reach.
-- (2) WRONG COUNTRY -> reject. 3 of the 627 propose a note that does not name
--     the city's own country. That is the live tail of the incident where 86
--     published notes described a DIFFERENT country's laws (Aden, Yemen served
--     UK marriage law). A pure >=0.90 threshold would publish all three today.
--     The check is deliberately the same crude ILIKE the retraction used, so it
--     catches notes written before any provenance key existed.
--
-- Neither guard is a confidence judgement and neither withholds a decidable
-- row from the operator's policy: one rejects work about dead pages, the other
-- rejects proposals that are provably about the wrong jurisdiction.
--
-- Risk-gated rows ARE approved: p_confirm is passed for criminalizing
-- destinations, which is the operator's explicit instruction. The DB-level
-- invariants that do not depend on a human stay in force untouched — in
-- particular resolve_entity_accessibility, the unscoped BEFORE trigger on
-- venues and events, still refuses to let a positive access claim overwrite a
-- recorded negative, so auto-apply cannot publish "step-free" over a stored
-- "not step-free".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_review_queue_autoapprove(
  p_batch integer DEFAULT 2000,
  p_min_confidence numeric DEFAULT 0.90
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  r          record;
  reg        public.review_field_registry%ROWTYPE;
  v_applied  int := 0;
  v_unreach  int := 0;
  v_wrongco  int := 0;
  v_errors   int := 0;
  v_confirm  boolean;
  v_country  text;
  v_note     text;
BEGIN
  -- See the reconciler: try, never block. This one does real work per row, so
  -- an overlapping pass would also contend on the same entity rows.
  IF NOT pg_try_advisory_xact_lock(hashtext('review_queue_autoapprove')) THEN
    RETURN jsonb_build_object('skipped', 'another run holds the lock');
  END IF;

  FOR r IN
    SELECT q.*
      FROM public.entity_review_queue q
      JOIN public.review_field_registry g
        ON g.entity_type = q.entity_type AND g.field = q.field AND g.active
     WHERE q.status = 'open'
       AND q.confidence IS NOT NULL
       AND q.confidence >= p_min_confidence
     ORDER BY q.confidence DESC, q.created_at
     LIMIT p_batch
  LOOP
    BEGIN
      SELECT * INTO reg FROM public.review_field_registry
       WHERE entity_type = r.entity_type AND field = r.field AND active;

      -- Guard 1: the entity is unreachable. Reject rather than publish.
      IF (r.entity_type = 'city' AND EXISTS (
            SELECT 1 FROM public.cities c WHERE c.id = r.entity_id
              AND (c.duplicate_of_id IS NOT NULL
                   OR coalesce(c.shell_status::text,'real') IN ('ghost','merged'))))
         OR (r.entity_type = 'venue' AND EXISTS (
            SELECT 1 FROM public.venues v WHERE v.id = r.entity_id
              AND (v.duplicate_of_id IS NOT NULL OR v.closed_at IS NOT NULL)))
         OR (r.entity_type = 'village' AND EXISTS (
            SELECT 1 FROM public.queer_villages w WHERE w.id = r.entity_id
              AND w.duplicate_of_id IS NOT NULL))
      THEN
        UPDATE public.entity_review_queue
           SET status='rejected', reviewer_id=NULL, reviewed_at=now(),
               reviewer_note='auto-unactionable: entity is deindexed, merged or closed — nothing reads this page'
         WHERE id = r.id;
        v_unreach := v_unreach + 1;
        CONTINUE;
      END IF;

      -- Guard 2: a safety note that does not name its own country.
      IF r.entity_type = 'city' AND r.field = 'safety_notes' THEN
        SELECT co.name INTO v_country
          FROM public.cities c JOIN public.countries co ON co.id = c.country_id
         WHERE c.id = r.entity_id;
        IF v_country IS NULL
           OR coalesce(r.proposed_value #>> '{}', '') NOT ILIKE '%' || v_country || '%' THEN
          UPDATE public.entity_review_queue
             SET status='rejected', reviewer_id=NULL, reviewed_at=now(),
                 reviewer_note='auto-blocked: proposed safety note does not name '
                               || coalesce(v_country,'(city has no country)')
                               || ' — the wrong-country defect class, never auto-published'
           WHERE id = r.id;
          v_wrongco := v_wrongco + 1;
          CONTINUE;
        END IF;
      END IF;

      -- Operator policy: confirm risk-gated rows rather than withhold them.
      v_confirm := public._review_risk_blocked(r.entity_type, r.field, r.entity_id);

      PERFORM public._apply_review_value(reg, r.entity_id, r.proposed_value);
      PERFORM public._review_write_provenance(r.entity_type, r.entity_id, r.field,
                                              r.proposed_value, r.confidence, r.citations);

      v_note := 'auto-approve: confidence ' || r.confidence::text
                || ' >= ' || p_min_confidence::text
                || CASE WHEN v_confirm THEN ' (risk-gated, machine-confirmed per operator policy)' ELSE '' END;

      UPDATE public.entity_review_queue
         SET status='approved', reviewer_id=NULL, reviewed_at=now(), reviewer_note=v_note
       WHERE id = r.id;

      PERFORM public._review_write_audit(
        r.entity_type, r.entity_id, r.field, r.proposed_value, r.confidence,
        'auto_commit', 'llm',
        jsonb_build_object('machine_autoapprove', true,
                           'human_reviewed', false,
                           'approved_by', NULL,
                           'confidence_threshold', p_min_confidence,
                           'risk_confirmed', v_confirm,
                           'citations', r.citations));

      PERFORM public._review_clear_needs_attention(r.entity_type, r.entity_id);
      v_applied := v_applied + 1;

    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not abort the batch, and a swallowed error must not
      -- read as a success: the row stays open and is counted separately.
      v_errors := v_errors + 1;
      RAISE WARNING 'autoapprove skipped % % (%): %', r.entity_type, r.field, r.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'rejected_unreachable', v_unreach,
    'rejected_wrong_country', v_wrongco,
    'errors', v_errors,
    'still_open', (SELECT count(*) FROM public.entity_review_queue WHERE status='open'),
    'still_open_at_threshold', (SELECT count(*) FROM public.entity_review_queue
                                 WHERE status='open' AND confidence >= p_min_confidence)
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.run_review_queue_autoapprove(integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_review_queue_autoapprove(integer, numeric) TO service_role;

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule, auto_pause_threshold)
VALUES (
  'review_queue_autoapprove',
  'Review queue: auto-approve at the confidence threshold',
  'Applies open entity_review_queue rows at confidence >= 0.90 without a human, per operator policy. Rejects rows whose entity is unreachable and safety notes that name the wrong country. Runs every 5 minutes, offset from the closers; 2,000/pass against a measured 5.3 ms/row.',
  'system', true,
  '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('fn','run_review_queue_autoapprove','type','rpc',
    'command','SELECT public.run_review_queue_autoapprove(2000, 0.90);',
    'jobname','review_queue_autoapprove'),
  '2-59/5 * * * *', 3
)
ON CONFLICT (slug) DO UPDATE
  SET action = EXCLUDED.action, schedule = EXCLUDED.schedule,
      enabled = true, description = EXCLUDED.description;

-- Every 5 minutes, OFFSET two minutes from the closers (which run at */5), so
-- the cheap deterministic closes land before anything is published: never
-- publish a row a closer would have removed. The offset is the same device the
-- projector/reaper pair uses, and it is a backstop rather than the mechanism —
-- this function carries the unreachable and wrong-country guards itself, so a
-- tick that overtakes a closer still refuses those rows.
--
-- MEASURED, because the first cut of this shipped at 300/night and would have
-- taken five nights to clear one backlog: the whole at-threshold population is
-- 1,409 rows and drains in 7.5s end to end (5.3 ms/row, triggers included), so
-- a 2,000 cap has ~13x headroom against pg_cron's 2-minute statement timeout
-- and steady state is a few rows per tick. Latency is minutes, not weeks.
SELECT cron.schedule(
  'review_queue_autoapprove',
  '2-59/5 * * * *',
  'SELECT public.run_review_queue_autoapprove(2000, 0.90);'
);

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Comment-stripped (50200101100000): this header quotes every phrase asserted
-- below, and pg_get_functiondef returns the body's comments.
DO $verify$
DECLARE
  v_raw text := pg_get_functiondef('public.run_review_queue_autoapprove(integer,numeric)'::regprocedure);
  v_src text := regexp_replace(v_raw, '--[^' || chr(10) || ']*', '', 'g');
  v_at  int;
  v_unr int;
  v_wrg int;
BEGIN
  IF position('_apply_review_value' IN v_src) = 0
     OR position('_review_write_provenance' IN v_src) = 0
     OR position('_review_clear_needs_attention' IN v_src) = 0 THEN
    RAISE EXCEPTION 'must reuse the shared apply internals, not reimplement the apply rule';
  END IF;
  IF position('''llm''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'machine approvals must be attributed llm, never llm+human';
  END IF;
  IF position('reviewer_id=NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'machine approvals must leave reviewer_id NULL so they stay legible';
  END IF;
  IF position('NOT ILIKE' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the wrong-country guard is missing';
  END IF;
  IF position('ghost' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the unreachable-entity guard is missing';
  END IF;

  -- Live-backlog counts are REPORTED, never asserted. The first draft raised on
  -- each of these being zero, reasoning that a guard with no work is untested
  -- prose. That is a PRECONDITION about the world, not a postcondition about
  -- what this file achieves, and it is self-defeating here: the closer shipped
  -- in 50200101100100 runs every 5 minutes and exists to drain exactly the
  -- unreachable population v_unr counts. It did — 282 rows closed between that
  -- migration applying and this one being reached — so this block aborted the
  -- push BECAUSE its sibling worked. v_at is worse still: zero at the threshold
  -- is the SUCCESS state of this whole change, so that assertion guaranteed a
  -- failure the moment the drain caught up.
  --
  -- What actually protects the guards is structural and stays hard above: the
  -- function body must contain both branches. A migration cannot promise the
  -- queue holds rows to exercise them.
  SELECT count(*) INTO v_at FROM public.entity_review_queue WHERE status='open' AND confidence >= 0.90;

  SELECT count(*) INTO v_unr
    FROM public.entity_review_queue q JOIN public.cities c ON c.id=q.entity_id
   WHERE q.status='open' AND q.confidence >= 0.90 AND q.entity_type='city'
     AND (c.duplicate_of_id IS NOT NULL OR coalesce(c.shell_status::text,'real') IN ('ghost','merged'));

  SELECT count(*) INTO v_wrg
    FROM public.entity_review_queue q
    JOIN public.cities c ON c.id=q.entity_id
    LEFT JOIN public.countries co ON co.id=c.country_id
   WHERE q.status='open' AND q.confidence >= 0.90
     AND q.entity_type='city' AND q.field='safety_notes'
     AND (co.name IS NULL OR coalesce(q.proposed_value #>> '{}','') NOT ILIKE '%'||co.name||'%');

  IF v_at = 0 THEN
    RAISE NOTICE 'autoapprove: nothing at the threshold — already drained, this pass is a no-op';
  END IF;
  IF v_unr = 0 THEN
    RAISE NOTICE 'autoapprove: unreachable guard has no live work right now (closer already drained it)';
  END IF;
  IF v_wrg = 0 THEN
    RAISE NOTICE 'autoapprove: wrong-country guard has no live work right now';
  END IF;

  RAISE NOTICE 'autoapprove: % rows at >=0.90, of which % unreachable and % wrong-country are rejected not published',
    v_at, v_unr, v_wrg;
END
$verify$;
