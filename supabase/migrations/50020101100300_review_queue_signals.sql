-- ============================================================================
-- review_queue_signals(): the alarm that did not exist
--
-- `entity_review_queue` reached 3,997 open rows while taking five human
-- decisions in sixty days, and NOTHING anywhere said so. Not
-- `pipeline_hygiene_stats`
-- (which watches staging, not review), not `get_admin_counts` (which reports
-- the depth as a number on a card, where growth and starvation look the same),
-- not any automation run row — the producers were all succeeding, because
-- filling a queue IS their job.
--
-- That is the shape of every incident this repo has already paid for: a
-- depth-only number cannot distinguish a queue being worked from a queue being
-- abandoned, exactly as a near-empty `venue_consensus_audit` cannot
-- distinguish a broken engine from a correctly-quiet one. What separates them
-- is a RATE, so that is what this reports.
--
-- WHAT HARD-FAILS vs WHAT WARNS
--
-- Hard fail is reserved for things the automation in this PR GUARANTEES, so a
-- failure means the machinery is broken rather than that the corpus is
-- awkward:
--
--   * `probe_ok=false` — the function could not read the queue at all. An
--     absent or erroring probe must never be reported as a clean queue; this
--     is the `accessibility_contradictions` rule, where a missing key and a
--     zero count had to be told apart.
--   * the closer automation is missing, or auto-paused-then-recovered
--     (`consecutive_failures=0 AND last_run_status='success' AND NOT enabled`),
--     which is the one-way-door failure that took the ingest engine down for
--     40 hours and is invisible from the row itself.
--   * unactionable rows above a small allowance. The closer runs nightly and
--     caps at 500, so a steady state above that means it is not running or its
--     predicate stopped matching.
--
-- Warnings are for the corpus, where a human decides what is acceptable:
-- depth, the oldest cohort, and the decision rate. `human_decisions_30d = 0`
-- is the headline, and it is a WARNING rather than an error on purpose — a
-- genuinely quiet fortnight is legitimate, and a check that fails on every run
-- is one people learn to scroll past. It is paired with `open_total` so the
-- two are read together: zero decisions against 40 open rows is a quiet week,
-- zero against 3,997 is an abandoned queue.
--
-- `risk_blocked_open` is reported because it is the one number that measures a
-- reviewer's ability to finish the work at all: those rows raise 42501 from
-- `approve_entity_review` unless the caller passes `p_confirm`, so before the
-- UI change in this PR they could not be approved from the inbox by anyone.
-- It is advisory here — the invariant that the UI sends the flag is asserted
-- in the frontend tests, which is where it can actually be observed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_queue_signals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'probe_ok', true,

    'open_total', (SELECT count(*) FROM public.entity_review_queue WHERE status='open'),

    'open_by_cohort', coalesce((
      SELECT jsonb_object_agg(k, n) FROM (
        SELECT entity_type || '.' || field AS k, count(*) AS n
          FROM public.entity_review_queue WHERE status='open'
         GROUP BY 1 ORDER BY 2 DESC LIMIT 25) c), '{}'::jsonb),

    -- The rate. `reviewer_id IS NOT NULL` is the only reliable mark of a human
    -- decision: every machine path in this schema leaves it NULL, which is how
    -- the marketplace queue's "613 approved / 818 rejected" was shown to be a
    -- machine-to-machine treadmill with no human in it.
    'human_decisions_30d', (
      SELECT count(*) FROM public.entity_review_queue
       WHERE reviewer_id IS NOT NULL AND reviewed_at > now() - interval '30 days'),
    'machine_decisions_30d', (
      SELECT count(*) FROM public.entity_review_queue
       WHERE reviewer_id IS NULL AND status <> 'open'
         AND reviewed_at > now() - interval '30 days'),
    'last_human_decision_at', (
      SELECT max(reviewed_at) FROM public.entity_review_queue WHERE reviewer_id IS NOT NULL),

    -- Median, not max: a handful of deliberately-parked rows must not make a
    -- healthy queue read as rotten. `percentile_disc`, not `_cont`, because
    -- the latter cannot interpolate a timestamptz (42883).
    'open_age_days_median', coalesce((
      SELECT round(EXTRACT(EPOCH FROM (now() - percentile_disc(0.5)
               WITHIN GROUP (ORDER BY created_at))) / 86400.0)
        FROM public.entity_review_queue WHERE status='open'), 0),

    -- Rows whose approval raises 42501 unless the caller confirms.
    'risk_blocked_open', (
      SELECT count(*) FROM public.entity_review_queue q
       WHERE q.status='open'
         AND public._review_risk_blocked(q.entity_type, q.field, q.entity_id)),

    -- Proposals on entities with no readers. The closer drives this to 0.
    'unactionable_open', (
      SELECT count(*) FROM public.entity_review_queue q
       WHERE q.status='open' AND (
         (q.entity_type='city' AND EXISTS (SELECT 1 FROM public.cities c
            WHERE c.id=q.entity_id AND (c.duplicate_of_id IS NOT NULL
              OR coalesce(c.shell_status::text,'real') IN ('ghost','merged'))))
         OR (q.entity_type='venue' AND EXISTS (SELECT 1 FROM public.venues v
            WHERE v.id=q.entity_id AND (v.duplicate_of_id IS NOT NULL OR v.closed_at IS NOT NULL)))
         OR (q.entity_type='personality' AND EXISTS (SELECT 1 FROM public.personalities p
            WHERE p.id=q.entity_id AND (p.duplicate_of_id IS NOT NULL
              OR coalesce(p.review_status,'')='archived'))))),

    -- Rows nothing can ever apply, because no active registry row describes
    -- the field. `approve_entity_review` raises 'unsupported review field' on
    -- these, so they are un-approvable no matter who is looking.
    'unregistered_field_open', (
      SELECT count(*) FROM public.entity_review_queue q
       WHERE q.status='open'
         AND NOT EXISTS (SELECT 1 FROM public.review_field_registry g
                          WHERE g.entity_type=q.entity_type AND g.field=q.field AND g.active)),

    -- The closer's own health. Auto-paused-then-recovered is the state that
    -- reads exactly like a deliberate retirement from the row alone.
    'closer', coalesce((
      SELECT jsonb_build_object('registered', true, 'enabled', a.enabled,
               'last_run_status', a.last_run_status,
               'consecutive_failures', a.consecutive_failures,
               'last_run_at', a.last_run_at,
               'falsely_paused', (a.enabled IS NOT TRUE
                                  AND a.consecutive_failures = 0
                                  AND a.last_run_status = 'success'))
        FROM public.admin_automations a
       WHERE a.slug='review_queue_close_unactionable'),
      jsonb_build_object('registered', false))
  ) INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  -- Absence of evidence is never evidence of absence: say the probe broke
  -- rather than returning a reassuring set of zeroes.
  RETURN jsonb_build_object('probe_ok', false, 'error', SQLERRM);
END; $function$;

-- SERVICE_ROLE ONLY. This is a SECURITY DEFINER aggregate over the whole
-- review queue, so granting it to `authenticated` would let any signed-in
-- member count the platform's pending moderation work — and `authenticated`
-- is ONE role shared by every member, which no `has_role_jwt` check inside a
-- grant can narrow. `venue_dup_signals` was shipped service_role-only for this
-- reason after its event twin had to be narrowed afterwards by 20280301104412,
-- and its sibling `_dedup_event_cluster_side` leaked safety-gated events in the
-- UAE and Malaysia to anon by being DEFINER by reflex. The admin UI does not
-- call this; it calls `review_queue_cohorts()` below, which is role-gated and
-- returns only the counts a reviewer needs to pick a cohort.
REVOKE ALL ON FUNCTION public.review_queue_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_queue_signals() TO service_role;

COMMENT ON FUNCTION public.review_queue_signals() IS
  'Health of entity_review_queue for check-pipeline-health.mjs. Reports the '
  'human decision RATE, not just depth — a depth number cannot tell a queue '
  'being worked from one being abandoned, which is how 3,997 rows sat behind '
  'five human decisions in sixty days with nothing alarmed.';


-- ── The reviewer-facing cohort list ─────────────────────────────────────────
--
-- The inbox shows a flat list of 3,997 rows with a single "Quality" chip, so a
-- reviewer cannot see that the queue is really a dozen separate campaigns of
-- very different tractability — 1,735 adult-link identity riddles at 0.40-0.60
-- next to 749 accessibility proposals at 0.80-1.00. This returns the campaigns
-- so the UI can offer them.
--
-- Role-gated rather than DEFINER-open, and it returns counts and aggregates
-- only — never a row, a title or an entity id — so the narrowest thing that
-- answers "what work is there" is also the only thing exposed.
--
-- `decidable` is the count of rows a reviewer can actually finish right now:
-- an active registry row exists for the field, the target entity is reachable,
-- and — the half that is easy to forget — approving it does not require the
-- confirm flag. It is deliberately a SEPARATE number from `n`, because a
-- cohort of 692 where 346 cannot be approved without confirmation is not the
-- same piece of work as a cohort of 692 where all of them can.
CREATE OR REPLACE FUNCTION public.review_queue_cohorts()
RETURNS TABLE(
  entity_type text,
  field       text,
  queue_key   text,
  n           bigint,
  decidable   bigint,
  risk_gated  bigint,
  batchable   boolean,
  avg_confidence numeric,
  oldest_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT q.entity_type,
         q.field,
         'quality-' || q.entity_type              AS queue_key,
         count(*)                                  AS n,
         count(*) FILTER (
           WHERE g.entity_type IS NOT NULL
             AND NOT public._review_risk_blocked(q.entity_type, q.field, q.entity_id)
         )                                         AS decidable,
         count(*) FILTER (
           WHERE public._review_risk_blocked(q.entity_type, q.field, q.entity_id)
         )                                         AS risk_gated,
         bool_or(coalesce(g.batchable, false))     AS batchable,
         round(avg(q.confidence), 2)               AS avg_confidence,
         min(q.created_at)                         AS oldest_at
    FROM public.entity_review_queue q
    LEFT JOIN public.review_field_registry g
           ON g.entity_type = q.entity_type AND g.field = q.field AND g.active
   WHERE q.status = 'open'
     AND public.has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
   GROUP BY q.entity_type, q.field
   ORDER BY count(*) DESC;
$function$;

-- The role check lives in the WHERE clause rather than a plpgsql RAISE because
-- this is a plain SQL function; a caller without the role gets an empty set,
-- which is the same answer RLS would give and leaks nothing. It is NOT a
-- substitute for the grant below — both are required, since a grant alone
-- would expose it to every signed-in member.
REVOKE ALL ON FUNCTION public.review_queue_cohorts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_queue_cohorts() TO authenticated, service_role;

COMMENT ON FUNCTION public.review_queue_cohorts() IS
  'Open quality-review work grouped into campaigns (entity_type + field), with '
  'the count a reviewer can actually finish now (registered field, reachable '
  'entity, no confirm required) reported separately from the raw depth. '
  'Admin/moderator only; returns aggregates, never rows.';

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE s jsonb; v_cohort_total bigint;
BEGIN
  s := public.review_queue_signals();

  IF (s->>'probe_ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'review_queue_signals probe failed: %', s->>'error';
  END IF;

  -- Every key the health script reads must be present AND non-null. A typo in
  -- a key name yields NULL, which a numeric threshold silently passes.
  IF (s ? 'open_total') IS NOT TRUE
     OR (s ? 'human_decisions_30d') IS NOT TRUE
     OR (s ? 'risk_blocked_open') IS NOT TRUE
     OR (s ? 'unactionable_open') IS NOT TRUE
     OR (s ? 'unregistered_field_open') IS NOT TRUE
     OR (s ? 'open_age_days_median') IS NOT TRUE
     OR (s ? 'closer') IS NOT TRUE THEN
    RAISE EXCEPTION 'review_queue_signals is missing a key the health script reads: %', s;
  END IF;

  -- Positive control: this queue is known non-empty, so a zero here means the
  -- probe is reading the wrong place rather than that all is well.
  IF (s->>'open_total')::int = 0 THEN
    RAISE EXCEPTION 'open_total is 0 — probe is not reading entity_review_queue';
  END IF;

  -- The cohort RPC must agree with the signal probe on the total. They are
  -- computed by different queries, so a disagreement means one of them has a
  -- predicate the other does not and the UI would show a different queue than
  -- the alarm watches.
  SELECT coalesce(sum(n), 0) INTO v_cohort_total FROM public.review_queue_cohorts();
  IF v_cohort_total <> 0 AND v_cohort_total <> (s->>'open_total')::bigint THEN
    RAISE EXCEPTION 'review_queue_cohorts total (%) disagrees with signals open_total (%)',
      v_cohort_total, s->>'open_total';
  END IF;

  RAISE NOTICE 'review_queue_signals: % open, % human decisions in 30d, % risk-blocked, % unactionable',
    s->>'open_total', s->>'human_decisions_30d', s->>'risk_blocked_open', s->>'unactionable_open';
END
$verify$;
