-- ============================================================================
-- Tell the operator what the machine will clear tonight, and what is theirs
--
-- /admin/inbox's header reads "Everything that needs you, across queues." That
-- was false in a way that made the whole surface feel stuck: measured on prod,
-- of 1,319 staging rows at pending_review, 575 were already dispositioned by
-- the pipeline (428 committed and PUBLISHED, 147 already rejected) and only the
-- status column lagged; of 3,997 open review rows, 1,409 sit at or above the
-- auto-approval threshold. A reviewer opening either page met one large number
-- with no way to tell decidable work from work already done or about to be done
-- by a cron.
--
-- This returns the split, so the UI can say "1,192 auto-approve at 06:50, 575
-- reconcile at 06:25, N are yours" instead of one number that only ever grows.
--
-- ── Aggregates ONLY, and that is a security property, not a style choice ────
-- This is granted to admin/moderator, so it must never return a row: a queue
-- row carries a personality's adult-platform links and a city's safety posture.
-- The role check is in the WHERE clause rather than a RAISE so an unauthorised
-- caller gets empty aggregates rather than an error that confirms the shape.
-- (review_queue_signals stays service_role-only for the same family of reasons:
-- a SECURITY DEFINER aggregate granted to `authenticated` is granted to every
-- member.)
--
-- ── Set-based, never per-row ───────────────────────────────────────────────
-- The obvious implementation calls _review_risk_blocked() per candidate, which
-- is a function call per row on a page-load path. Everything here is one pass
-- of set arithmetic: the counts the UI needs do not depend on the risk gate,
-- because under the operator's policy a risk-gated row is approved too (with
-- confirmation) — it is not a separate bucket.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_automation_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  WITH allowed AS (
    SELECT public.has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) AS ok
  ),
  -- Review queue: at-threshold rows split into what applies and what closes.
  rq AS (
    SELECT
      count(*) FILTER (WHERE q.status='open') AS open_total,
      count(*) FILTER (WHERE q.status='open' AND q.confidence >= 0.90) AS at_threshold,
      count(*) FILTER (
        WHERE q.status='open' AND q.confidence >= 0.90 AND (
          EXISTS (SELECT 1 FROM public.cities c WHERE c.id=q.entity_id AND q.entity_type='city'
                    AND (c.duplicate_of_id IS NOT NULL
                         OR coalesce(c.shell_status::text,'real') IN ('ghost','merged')))
       OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id=q.entity_id AND q.entity_type='venue'
                    AND (v.duplicate_of_id IS NOT NULL OR v.closed_at IS NOT NULL))
       OR EXISTS (SELECT 1 FROM public.queer_villages w WHERE w.id=q.entity_id AND q.entity_type='village'
                    AND w.duplicate_of_id IS NOT NULL))
      ) AS closable_unreachable,
      -- The wrong-country safety notes the approver rejects rather than
      -- publishes. Counted here too, or the card would promise to apply 3 rows
      -- it will actually close — a small number, but this surface exists to
      -- stop the operator being told something untrue about the queue.
      count(*) FILTER (
        WHERE q.status='open' AND q.confidence >= 0.90
          AND q.entity_type='city' AND q.field='safety_notes'
          AND NOT EXISTS (
            SELECT 1 FROM public.cities c JOIN public.countries co ON co.id=c.country_id
             WHERE c.id=q.entity_id
               AND coalesce(q.proposed_value #>> '{}','') ILIKE '%'||co.name||'%')
      ) AS closable_wrong_country
    FROM public.entity_review_queue q
    JOIN public.review_field_registry g
      ON g.entity_type=q.entity_type AND g.field=q.field AND g.active
  ),
  -- Staging: the phantom split that makes the inbox look stuck.
  st AS (
    SELECT
      count(*) AS pending_total,
      count(*) FILTER (WHERE target_record_id IS NOT NULL) AS phantom_committed,
      count(*) FILTER (WHERE target_record_id IS NULL AND disposition='rejected') AS phantom_rejected
    FROM public.ingestion_staging WHERE review_status='pending_review'
  ),
  dq AS (
    SELECT count(*) AS open_total FROM public.dedup_review_queue WHERE status='open'
  ),
  -- A job the operator is relying on must be shown as ON or OFF, never assumed.
  jobs AS (
    SELECT jsonb_object_agg(a.slug, jsonb_build_object('enabled', a.enabled, 'schedule', a.schedule)) AS j
      FROM public.admin_automations a
     WHERE a.slug IN ('review_queue_autoapprove','staging_reconcile_committed',
                      'review_queue_close_unactionable','dedup_close_distinct')
  )
  SELECT CASE WHEN (SELECT ok FROM allowed) IS NOT TRUE THEN '{}'::jsonb ELSE
    jsonb_build_object(
      'review_queue', jsonb_build_object(
        'open', rq.open_total,
        'auto_applies', greatest(rq.at_threshold - rq.closable_unreachable - rq.closable_wrong_country, 0),
        'auto_closes', rq.closable_unreachable + rq.closable_wrong_country,
        'needs_human', greatest(rq.open_total - rq.at_threshold, 0)),
      'staging', jsonb_build_object(
        'pending', st.pending_total,
        'auto_reconciles', st.phantom_committed + st.phantom_rejected,
        'needs_human', greatest(st.pending_total - st.phantom_committed - st.phantom_rejected, 0)),
      'dedup', jsonb_build_object('open', dq.open_total),
      'jobs', coalesce(jobs.j, '{}'::jsonb),
      'generated_at', now()
    ) END
  FROM rq, st, dq, jobs;
$fn$;

REVOKE ALL ON FUNCTION public.review_automation_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_automation_status() TO authenticated, service_role;

DO $verify$
DECLARE
  v_raw text := pg_get_functiondef('public.review_automation_status()'::regprocedure);
  v_src text := regexp_replace(v_raw, '--[^' || chr(10) || ']*', '', 'g');
  v_res jsonb;
BEGIN
  IF position('has_any_role_jwt' IN v_src) = 0 THEN
    RAISE EXCEPTION 'role gate missing — this reads the whole review queue';
  END IF;
  IF position('_review_risk_blocked' IN v_src) > 0 THEN
    RAISE EXCEPTION 'per-row risk calls do not belong on a page-load path';
  END IF;

  -- Runs as the migration's own role (no JWT), so the gate must return {} here.
  -- That IS the negative control: if an unauthorised caller got real numbers
  -- this assertion fails.
  v_res := public.review_automation_status();
  IF v_res <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unauthorised caller received data: %', v_res;
  END IF;

  RAISE NOTICE 'review_automation_status: role-gated, returns {} without an admin JWT';
END
$verify$;
