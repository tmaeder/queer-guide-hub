-- ============================================================================
-- Two projectors were recording the same failure twice.
-- ----------------------------------------------------------------------------
-- run_cron_failure_sweep (hourly, pre-existing since ~2026-07-31) already
-- projected cron.job_run_details failures into admin_automation_runs. #2817
-- added admin_automation_project_cron_runs, which does the same thing for
-- registered automations plus a cursor, family-aware success handling and a
-- PK-backed dedupe. I did not find the older one before shipping the newer.
--
-- The two dedupe against DIFFERENT keys — the sweep against
-- summary->>'runid', the projector against the cron_runid column — so neither
-- can see the other's rows. Measured on prod before this migration: 9 cron
-- runids carried two error rows each, across 2 automations.
--
-- Duplicate audit rows would be cosmetic on their own. What makes this a real
-- fault is that #2817 also widened the auto-pause trigger from BEFORE UPDATE
-- to BEFORE INSERT OR UPDATE, so an already-finished row now increments
-- consecutive_failures. Two writers therefore increment TWICE per failure, and
-- auto_pause_threshold = 3 trips after two real failures instead of three.
-- That already happened: admin_automation_reap — the reaper the whole response
-- half depends on — was auto-paused on a doubled count.
--
-- FIX. Make the two disjoint BY CONSTRUCTION rather than by cross-dedupe: the
-- projector owns every automation that has a registry row, the sweep keeps
-- only what the projector cannot see — an active cron job with no registry row
-- at all. No shared key to keep in sync, and no way for a future edit to
-- reintroduce the overlap.
--
-- The sweep is deliberately NOT retired. Its rows for unregistered jobs land
-- with automation_id IS NULL, so they never reach the counter and cannot pause
-- anything, but they are the only audit trail an unregistered cron leaves.
-- (pipeline_hygiene_stats().unregistered_cron_jobs reports that such a job
-- EXISTS; this reports that it FAILED.)
--
-- Its second statement — the last_run_status = 'error' stamp — is scoped the
-- same way and so becomes unreachable for registered rows, which is the point:
-- last_run_at/last_run_status are now written by the auto-pause trigger from
-- the run row itself, and a second writer stamping them out of band is how the
-- admin column starts disagreeing with the audit log.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_cron_failure_sweep(p_window interval DEFAULT '25:00:00'::interval)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_inserted int := 0;
begin
  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status,
     items_examined, items_changed, error, summary)
  select null::uuid,
         replace(j.jobname, '-', '_'),
         d.start_time, d.end_time, 'error', 0, 0,
         left(coalesce(d.return_message, 'cron job failed'), 2000),
         jsonb_build_object('source', 'cron', 'jobname', j.jobname, 'runid', d.runid,
                            'unregistered', true)
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where d.status = 'failed'
     and d.start_time > now() - p_window
     -- Unregistered only. admin_automation_project_cron_runs owns every job
     -- that HAS a registry row; matching the reconciler's own resolution
     -- (jobname stored in action->>'jobname', else the snake_cased slug) so
     -- the two agree on what "registered" means.
     and not exists (
       select 1 from public.admin_automations a
        where coalesce(a.action->>'jobname', a.slug) = j.jobname
           or a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g')))
     and not exists (
       select 1 from public.admin_automation_runs r
        where r.summary ->> 'source' = 'cron'
          and r.summary ->> 'runid' = d.runid::text);
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('recorded', v_inserted);
end;
$function$;

COMMENT ON FUNCTION public.run_cron_failure_sweep(interval) IS
  'Records failures of cron jobs that have NO admin_automations row. Registered jobs belong to admin_automation_project_cron_runs — the two are disjoint by construction so a failure cannot be counted twice against auto_pause_threshold.';

-- ── Repair the already-doubled counters ─────────────────────────────────────
-- Delete only the sweep-authored duplicates of runids the projector also
-- recorded. Keyed on the runid, never on recency. The projector's row is kept:
-- it carries cron_runid, so it is the one the dedupe index protects.
DELETE FROM public.admin_automation_runs s
WHERE s.summary->>'source' = 'cron'
  AND s.summary->>'runid' ~ '^[0-9]+$'
  AND EXISTS (
    SELECT 1 FROM public.admin_automation_runs p
    WHERE p.cron_runid = (s.summary->>'runid')::bigint);

-- consecutive_failures is a running count that both writers inflated, so it
-- cannot be repaired by arithmetic — only recomputed from the surviving audit
-- log. Definition, stated once: the number of terminal error runs NEWER than
-- the most recent terminal non-error run. That is exactly what the trigger
-- maintains incrementally (+1 on error, 0 on success/partial), so this is the
-- same quantity derived instead of accumulated.
WITH want AS (
  SELECT a.id,
         (SELECT count(*)
            FROM public.admin_automation_runs r
           WHERE r.automation_id = a.id
             AND r.finished_at IS NOT NULL
             AND r.status = 'error'
             AND r.started_at > COALESCE((
                   SELECT max(r2.started_at)
                     FROM public.admin_automation_runs r2
                    WHERE r2.automation_id = a.id
                      AND r2.finished_at IS NOT NULL
                      AND r2.status <> 'error'), '-infinity'::timestamptz)
         ) AS n
    FROM public.admin_automations a
)
UPDATE public.admin_automations a
SET consecutive_failures = want.n
FROM want
WHERE want.id = a.id
  AND a.consecutive_failures IS DISTINCT FROM want.n;
