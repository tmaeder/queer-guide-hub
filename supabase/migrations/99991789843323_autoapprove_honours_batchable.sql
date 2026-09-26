-- ============================================================================
-- run_review_queue_autoapprove honours review_field_registry.batchable
--
-- 50600101100100 made the ≥0.90 threshold apply "across every field", and its
-- header says so deliberately: the operator's decision was to stop waiting on
-- a queue with zero human decisions. That decision was sized against a ONE-OFF
-- backlog of 1,409 rows. The job is scheduled `2-59/5 * * * *`, the backlog is
-- drained (still_open_at_threshold = 0 measured), and what it does now is
-- publish whatever the enrichers emit next, forever, with no human in any loop.
--
-- Measured over the trailing 10 days on prod — 1,725 machine approvals:
--
--   venue.accessibility_attributes   590   batchable=false
--   city.safety_notes                417   batchable=false  (kept, see below)
--   city.lgbt_friendly_rating        285   batchable=true    <- corrected here
--   city.editorial_hook              284   batchable=true    (unchanged)
--   venue.accessibility_notes        133   batchable=false
--   city.best_time_to_visit            7   batchable=false
--   village.description/hook/history   9   batchable=true    (unchanged)
--
-- ── The fix is a column that already exists, not a new list ────────────────
-- `review_field_registry.batchable` already means exactly "may be approved in
-- bulk without a human", and `approve_entity_review_batch()` already honours
-- it. This function was the only consumer that did not — it joined the
-- registry for `active` and ignored the rest of the row. Ten fields are
-- already marked false by data; the autoapprove pass approved four of them
-- anyway. So no hardcoded exclusion list is introduced: the predicate reads
-- the column, and a future field is governed by its registry row rather than
-- by remembering to edit this function.
--
-- Each `batchable=false` row this restores is a measured invariant, not taste:
--   - venue.accessibility_*  a wrong access claim is real-world harm; the
--     amenity engine has ALWAYS review-gated accessibility while auto-applying
--     amenities at ≥0.8. The threshold pass reversed that for 723 rows.
--   - city.best_time_to_visit  gated by 20490210090000 nine days ago, after
--     the voice A/B produced "June or July" for the Busan Queer Culture
--     Festival (a September/October event; June/July is SEOUL's). No avoid
--     phrase, no low confidence — a scanner cannot see it, which is the whole
--     reason that field, and only that field, was gated.
--   - venue.category, personality.social_links.*, personality.wikidata_qid,
--     venue.closure_status  already unreachable in practice (NULL confidence)
--     or risk-gated; the predicate makes that structural instead of incidental.
--
-- ── ONE exception, and it is narrow: city.safety_notes ────────────────────
-- It is batchable=false and it KEEPS auto-approving. `batchable` governs the
-- GENERIC batch approver, which has no field-specific checks. This function is
-- not that: 50600101100100 gave safety_notes two bespoke guards that were
-- measured on this corpus (unreachable entity -> reject, 209 rows; note that
-- does not name its own country -> reject, 3 rows — the live tail of the
-- incident where 86 published notes described a different country's laws).
-- Withdrawing it here would retract a decision the operator made with those
-- guards in hand, which is not what narrowing the blast radius means. The
-- exception is spelled as a pair comparison so a second one cannot be added by
-- widening a regex.
--
-- ── city.lgbt_friendly_rating: the registry row is corrected, not the code ─
-- The City Truth Engine's rule is that lgbt_friendly_rating and editorial_hook
-- ALWAYS route to review and never reach `cities` until an admin approves.
-- editorial_hook is prose and stays batchable. The rating is a 1-5 integer
-- asserting how safe a city is for queer travellers, derived by gpt-4o-mini,
-- and it is proposed only when citation-backed — the same class of claim as a
-- safety note, and unlike safety notes it has no bespoke guard here. One
-- UPDATE reverses this if the operator disagrees; no code change needed, which
-- is the point of putting it in the registry rather than in the predicate.
--
-- Forward effect: ~1,015 of the last 10 days' 1,725 approvals would instead
-- have waited for a human. Nothing already applied is retracted — this changes
-- what happens next, and the rows it stops stay `open` and visible at
-- /admin/quality rather than being rejected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_review_queue_autoapprove(
  p_batch integer DEFAULT 2000,
  p_min_confidence numeric DEFAULT 0.90
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       -- The registry decides what may be approved without a human. The one
       -- exception is the field this function carries its own guards for.
       AND (g.batchable OR (q.entity_type, q.field) = ('city', 'safety_notes'))
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
                                 WHERE status='open' AND confidence >= p_min_confidence),
    -- Reported, never silent: without this the run summary reads identically
    -- whether the predicate is present or has been dropped by a later
    -- CREATE OR REPLACE, and "held for a human" would be indistinguishable
    -- from "there was nothing to do".
    'held_for_human_not_batchable', (
      SELECT count(*) FROM public.entity_review_queue q
        JOIN public.review_field_registry g
          ON g.entity_type = q.entity_type AND g.field = q.field AND g.active
       WHERE q.status = 'open'
         AND q.confidence IS NOT NULL
         AND q.confidence >= p_min_confidence
         AND NOT g.batchable
         AND (q.entity_type, q.field) <> ('city', 'safety_notes'))
  );
END
$function$;

REVOKE ALL ON FUNCTION public.run_review_queue_autoapprove(integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_review_queue_autoapprove(integer, numeric) TO service_role;

-- The rating is a safety claim, not prose. See the header.
UPDATE public.review_field_registry
   SET batchable = false
 WHERE entity_type = 'city' AND field = 'lgbt_friendly_rating';

DO $verify$
DECLARE
  v_bad      int;
  v_rating   boolean;
  v_safety   int;
BEGIN
  -- Postcondition 1: the registry correction landed.
  --
  -- There is deliberately no postcondition on the function's SELECT. A count
  -- of rows it would now hold back is the DESIRED state, not a failure, so
  -- asserting on it either way is meaningless; and the only other form
  -- available is grepping pg_get_functiondef for one phrasing of the
  -- predicate, which aborts `db push` for the whole repo the next time
  -- somebody rewrites the condition while preserving it (20810101100100).
  -- The predicate is asserted in the repo test instead, where a false alarm
  -- costs one PR.
  SELECT batchable INTO v_rating
    FROM public.review_field_registry
   WHERE entity_type = 'city' AND field = 'lgbt_friendly_rating';
  IF v_rating IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'city.lgbt_friendly_rating is still batchable=% — the rating would keep auto-publishing', v_rating;
  END IF;

  -- Postcondition 2: the exception still exists. If safety_notes were ALSO
  -- excluded the change would have silently retracted an operator decision
  -- this migration explicitly keeps.
  SELECT count(*) INTO v_safety
    FROM public.review_field_registry
   WHERE entity_type = 'city' AND field = 'safety_notes' AND active;
  IF v_safety <> 1 THEN
    RAISE EXCEPTION 'city.safety_notes is not an active registry row (%) — the kept exception is unreachable', v_safety;
  END IF;

  -- Postcondition 3: the four fields this change exists for are all non-batchable.
  SELECT count(*) INTO v_bad
    FROM public.review_field_registry
   WHERE active AND batchable
     AND (entity_type, field) IN (
       ('venue','accessibility_attributes'), ('venue','accessibility_notes'),
       ('city','best_time_to_visit'), ('city','lgbt_friendly_rating'));
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '% of the four gated fields are still batchable', v_bad;
  END IF;

  RAISE NOTICE 'autoapprove now honours batchable; rating corrected; safety_notes exception intact';
END
$verify$;
