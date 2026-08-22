-- search_reindex_drain: 1000 -> 400 rows per claim, and un-pause the row.
--
-- The drain auto-paused itself TWICE in twelve hours (2026-08-21 17:19:40 and
-- 2026-08-22 04:24:40), both times with `summary.auto_paused = true,
-- reason = 'consecutive_failures >= 3'` after three runs died on
--   ERROR: canceling statement due to statement timeout
--   CONTEXT: SQL function "search_documents_index_venues"/"..._marketplace"
-- Each of those runs lasted exactly 110s — the `statement_timeout` the cron
-- command sets — so the batch, not any single row, is what overran.
--
-- Measured on prod 2026-08-22 while clearing the resulting 9,565-row backlog:
-- 65-96 ms per row (500 rows = 32-47 s). A 1000-row claim is therefore 65-95 s
-- against a 110 s ceiling — under a couple of minutes of import write load it
-- crosses, and a timeout is a FULL ROLLBACK: the DELETE...RETURNING claim rolls
-- back with it, so the same batch is re-attempted next minute and times out
-- again. Three minutes later the job is paused. 400 rows is 26-38 s, ~3x
-- headroom, and still 24,000 rows/hour — well above the ~150 rows/min this
-- corpus enqueues on its heaviest import day.
--
-- Why the pause read as deliberate maintenance: auto-pause sets enabled=false
-- and nothing ever sets it back, but the cron job itself survives until the
-- nightly reconciler pass, so the job kept running (and succeeding) for another
-- 45 minutes. Those successes reset consecutive_failures to 0 and
-- last_run_status to 'success' while enabled stayed false. The registry row
-- then reads "switched off while perfectly healthy", which is indistinguishable
-- from someone using the documented kill switch. `admin_automation_runs.summary`
-- is the only place the auto-pause is still recorded — check it before
-- concluding a disabled row was a human decision.
--
-- The registry is canonical: sync_automations_to_cron() drives pg_cron from
-- action->>'command', so updating it here is the durable half. The explicit
-- reschedule below only makes it immediate.

UPDATE public.admin_automations
   SET action  = action || jsonb_build_object(
         'command', 'SET statement_timeout = ''110s''; SELECT public.search_reindex_drain(400);'
       ),
       enabled = true,
       consecutive_failures = 0
 WHERE slug = 'search_reindex_drain';

DO $$
BEGIN
  PERFORM cron.unschedule('search_reindex_drain');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled (e.g. already unscheduled by a reconciler pass)
END $$;

SELECT cron.schedule(
  'search_reindex_drain',
  '* * * * *',
  'SET statement_timeout = ''110s''; SELECT public.search_reindex_drain(400);'
);
