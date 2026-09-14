-- ============================================================================
-- Close review proposals whose target entity no longer has any readers
--
-- Measured on prod 2026-09-14: `entity_review_queue` holds 3,997 open rows
-- against 242 human decisions in the queue's entire life — 231 of them in
-- a single burst on 2026-07-26, and FIVE in the last sixty days. At that
-- trailing rate the backlog is not clearable by hand, so every row that
-- cannot be decided at all is displacing one that can. A share of it asks
-- about pages nobody can reach:
--
--   deindexed city shell (shell_status ghost/merged)   253
--   city merged away (duplicate_of_id set)              24
--   venue merged away                                    4
--   venue closed                                         1
--                                                      ---
--                                                      282
--
-- The previous migration stops the city composer MAKING more of these. This
-- one clears what is already queued, and keeps clearing it, because the other
-- producers (amenity, village, marketplace, adult-links) have no such guard
-- and an entity can always be merged or archived AFTER its proposal was
-- queued — which is exactly how the 24 merged-away cities got here, since that
-- composer has excluded `duplicate_of_id` at source all along.
--
-- WHY `status='rejected'` AND NOT A NEW STATUS. This is the rule
-- `run_dedup_close_distinct` established and it is load-bearing, not
-- stylistic. Producer idempotency in this system keys on `status='open'`:
-- `uq_erq_open` is a partial unique index over open rows only, and every
-- producer's skip-if-open pre-check filters `status='open'`. A row parked in
-- any OTHER status is invisible to both, so the next nightly run re-inserts it
-- as open and the work repeats forever. 'rejected' is the only terminal value
-- the existing machinery already understands.
--
-- Machine closes stay distinguishable from human ones by the pair
-- (`reviewer_id IS NULL`, note prefixed `auto-unactionable:`) — the same
-- convention that let us prove, above, that no human has worked this queue.
-- The note carries the REASON, so a closed row says why rather than just
-- vanishing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--
--   * It never approves. Every exit is a rejection, so no content is
--     published by this job under any circumstance. A wrong close costs a
--     re-proposal; a wrong approve costs a published claim.
--   * It never touches a row a human has already decided (`status='open'`
--     only) and never re-opens anything.
--   * 'placeholder' cities are NOT unreachable — they are thin but live in
--     `search_documents` (1,952 of them, measured 2026-09-02). Only the pair
--     `search_documents_index_cities` itself excludes, ghost and merged,
--     counts here.
--   * A ghost that later gains content is re-indexed by the nightly
--     completeness recompute and re-proposed by its composer on the next pass,
--     so closing is reversible by the ordinary machinery. Nothing is stamped
--     terminal.
--
-- VERIFIED ON PROD 2026-09-14 in a rolled-back transaction: the function was
-- created, registered, run, and returned
--   {"closed": 282, "by_reason": {"deindexed_shell": 253, "merged_away": 28, "closed": 1}}
-- which matches the independent measurement taken before it was written. That
-- round trip is also what found the dead `entity_missing` CASE arms above.
--
-- The batch cap is the usual search-trigger discipline: closing a row writes
-- only to `entity_review_queue`, which has no search trigger, but
-- `_review_clear_needs_attention` writes the ENTITY, and on cities that
-- reaches `search_reindex_queue` through the geo spine. 500 at ~2.6 ms/row is
-- well inside the 2-minute pg_cron statement timeout with room to spare.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_review_queue_close_unactionable(p_batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now();
  v_closed int := 0;
  v_by_reason jsonb;
  rec record;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
    FROM public.admin_automations WHERE slug='review_queue_close_unactionable';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'review_queue_close_unactionable',v_started,'success',0,0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused'
     WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  CREATE TEMP TABLE _unactionable ON COMMIT DROP AS
  SELECT q.id, q.entity_type, q.entity_id, r.reason
    FROM public.entity_review_queue q
    JOIN LATERAL (
      SELECT CASE q.entity_type
        -- No `WHEN x.id IS NULL THEN 'entity_missing'` arm in any of these: the
        -- subquery is keyed on that same id, so when no row matches it returns
        -- NULL without ever evaluating the CASE, and such an arm is dead code
        -- that reads as coverage. A missing entity is caught by the NOT EXISTS
        -- arm in the WHERE clause instead, which is the only place it CAN be
        -- caught. `village` has no reachability column at all, so it is NULL
        -- here and relies on that arm entirely.
        WHEN 'city' THEN (
          SELECT CASE WHEN c.duplicate_of_id IS NOT NULL                  THEN 'merged_away'
                      WHEN coalesce(c.shell_status::text,'real')
                             IN ('ghost','merged')                        THEN 'deindexed_shell'
                 END
            FROM public.cities c WHERE c.id = q.entity_id)
        WHEN 'venue' THEN (
          SELECT CASE WHEN v.duplicate_of_id IS NOT NULL                  THEN 'merged_away'
                      WHEN v.closed_at IS NOT NULL                        THEN 'closed'
                 END
            FROM public.venues v WHERE v.id = q.entity_id)
        WHEN 'personality' THEN (
          SELECT CASE WHEN p.duplicate_of_id IS NOT NULL                  THEN 'merged_away'
                      WHEN coalesce(p.review_status,'') = 'archived'      THEN 'archived'
                 END
            FROM public.personalities p WHERE p.id = q.entity_id)
        WHEN 'village' THEN NULL
        WHEN 'marketplace' THEN (
          SELECT CASE WHEN m.status IS DISTINCT FROM 'active' THEN 'inactive' END
            FROM public.marketplace_listings m WHERE m.id = q.entity_id)
      END AS reason
    ) r ON true
   WHERE q.status = 'open'
     -- A row whose entity_id matches nothing at all returns NULL from the
     -- scalar subquery rather than 'entity_missing' (no row, so no CASE is
     -- evaluated). That is caught by the NOT EXISTS arm below instead, which
     -- is why this predicate is an OR and not just `r.reason IS NOT NULL`.
     AND (r.reason IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM public.cities c               WHERE q.entity_type='city'        AND c.id=q.entity_id
            UNION ALL SELECT 1 FROM public.venues v     WHERE q.entity_type='venue'       AND v.id=q.entity_id
            UNION ALL SELECT 1 FROM public.personalities p WHERE q.entity_type='personality' AND p.id=q.entity_id
            UNION ALL SELECT 1 FROM public.queer_villages vl WHERE q.entity_type='village' AND vl.id=q.entity_id
            UNION ALL SELECT 1 FROM public.marketplace_listings m WHERE q.entity_type='marketplace' AND m.id=q.entity_id))
   ORDER BY q.created_at
   LIMIT greatest(1, least(p_batch, 2000));

  UPDATE public.entity_review_queue q
     SET status        = 'rejected',
         reviewer_id   = NULL,
         reviewed_at   = now(),
         reviewer_note = 'auto-unactionable: '
                         || coalesce(u.reason,'entity_missing')
                         || ' — the target entity has no readers, so this proposal'
                         || ' cannot be decided; it is re-proposed automatically if'
                         || ' the entity becomes reachable again'
    FROM _unactionable u
   WHERE q.id = u.id AND q.status = 'open';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Clear the flag where this was the last thing holding it. One call per
  -- distinct entity, not per row, so a city with three closed proposals is
  -- written once.
  FOR rec IN SELECT DISTINCT entity_type, entity_id FROM _unactionable LOOP
    PERFORM public._review_clear_needs_attention(rec.entity_type, rec.entity_id);
  END LOOP;

  SELECT coalesce(jsonb_object_agg(reason, n), '{}'::jsonb) INTO v_by_reason
    FROM (SELECT coalesce(reason,'entity_missing') reason, count(*) n
            FROM _unactionable GROUP BY 1) s;

  UPDATE public.admin_automation_runs
     SET finished_at=now(), items_examined=v_closed, items_changed=v_closed,
         summary=jsonb_build_object('closed', v_closed, 'by_reason', v_by_reason)
   WHERE id=v_run_id;
  UPDATE public.admin_automations
     SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;

  RETURN jsonb_build_object('closed', v_closed, 'by_reason', v_by_reason);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
     SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;

REVOKE ALL ON FUNCTION public.run_review_queue_close_unactionable(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_review_queue_close_unactionable(integer) TO service_role;

COMMENT ON FUNCTION public.run_review_queue_close_unactionable(integer) IS
  'Closes open entity_review_queue rows whose target entity has no readers '
  '(deindexed shell, merged away, archived, closed, missing). Never approves. '
  'Machine closes carry reviewer_id IS NULL and an "auto-unactionable:" note.';

-- ── Registry + cron ─────────────────────────────────────────────────────────
-- An action->>'type'='rpc' row carries no `action.command` path that
-- `sync_automations_to_cron()` branch (d) can reschedule from, so the cron is
-- created here and this migration is its only scheduler — the rule recorded
-- after the `workflow_dispatcher_1min` outage.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, "trigger", conditions, action, schedule, auto_pause_threshold)
VALUES (
  'review_queue_close_unactionable',
  'Review queue: close unactionable proposals',
  'Closes open review proposals whose target entity has no readers — a deindexed city shell, '
  'a merged-away or archived row, a closed venue, an inactive listing. Never approves anything; '
  'only moves open -> rejected with an auto-unactionable note naming the reason.',
  'system', true,
  '{"type":"schedule"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('type','rpc','fn','run_review_queue_close_unactionable',
                     'command','SELECT public.run_review_queue_close_unactionable();',
                     'jobname','review_queue_close_unactionable'),
  '*/5 * * * *', 3)
ON CONFLICT (slug) DO UPDATE
  SET name=EXCLUDED.name, description=EXCLUDED.description,
      action=EXCLUDED.action, schedule=EXCLUDED.schedule;

SELECT cron.unschedule('review_queue_close_unactionable')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='review_queue_close_unactionable');

SELECT cron.schedule('review_queue_close_unactionable', '*/5 * * * *',
                     'SELECT public.run_review_queue_close_unactionable();');

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE v_open_unactionable int; v_cron int; v_reg int;
BEGIN
  SELECT count(*) INTO v_cron FROM cron.job WHERE jobname='review_queue_close_unactionable';
  IF v_cron <> 1 THEN RAISE EXCEPTION 'cron job not scheduled (found %)', v_cron; END IF;

  SELECT count(*) INTO v_reg FROM public.admin_automations
   WHERE slug='review_queue_close_unactionable' AND enabled;
  IF v_reg <> 1 THEN RAISE EXCEPTION 'registry row missing or disabled'; END IF;

  -- Positive control. If nothing matches, the predicate is wrong or the
  -- measurement that motivated this migration has gone stale — either way it
  -- must not ship reading as a success. 282 measured at authoring time.
  SELECT count(*) INTO v_open_unactionable
    FROM public.entity_review_queue q
    JOIN public.cities c ON c.id = q.entity_id
   WHERE q.status='open' AND q.entity_type='city'
     AND (c.duplicate_of_id IS NOT NULL
          OR coalesce(c.shell_status::text,'real') IN ('ghost','merged'));

  IF v_open_unactionable = 0 THEN
    RAISE EXCEPTION 'no unactionable city proposals found — re-measure before shipping';
  END IF;

  RAISE NOTICE 'close_unactionable armed; % unactionable city proposals awaiting first run',
    v_open_unactionable;
END
$verify$;
