-- ============================================================================
-- Latency, not throughput: the closers were already fast and still took a day
--
-- Every drain in this family ran once a night, which means a row queued at
-- 06:21 waits until 06:20 tomorrow. Measured, the work itself is nothing like
-- that slow:
--
--   staging reconcile       575 rows   1.7 s   (entire backlog, one pass)
--   review auto-approve   1,409 rows   7.5 s   (5.3 ms/row, triggers included)
--   dedup close-distinct        0 rows  <1 s   (already drained by 06:20 today)
--
-- So the nightly cadence was never sized against the cost; it was just the
-- default. The other three jobs move to */5 in their own migrations. This one
-- retunes the PRE-EXISTING dedup closer, which is why it is a separate file:
-- it is an UPDATE to a registry row this change does not own.
--
-- ── What this does NOT fix, stated plainly ─────────────────────────────────
-- The 1,378 open dedup pairs do not move. run_dedup_close_distinct ran at
-- 06:20 today and closed nothing, because it only closes pairs it can PROVE
-- distinct (different city >25 km apart, different street key, contradicting
-- domain or phone) and that population is already drained. The rest need an
-- auto-merge arm or a human. Raising the cadence buys latency for pairs queued
-- from now on — minutes instead of up to a day — and nothing else. A cadence
-- change that claimed to clear a backlog it cannot touch would be the kind of
-- false green this codebase keeps writing sentinels against.
--
-- ── The registry is canonical ──────────────────────────────────────────────
-- action.command keeps the plain readable SQL; admin_automation_effective_
-- command() derives the wrapped form and sync_automations_to_cron()'s
-- command-drift branch applies it. cron.schedule is called here too because a
-- registry edit alone does not move a job that already exists — branch (d)
-- only CREATES a missing cron, it does not correct the schedule of a live one.
-- That is the detect_stale_venues failure: a threshold "fixed" in a migration
-- that the live cron never picked up, for months.
-- ============================================================================

UPDATE public.admin_automations
   SET schedule = '*/5 * * * *',
       description = 'Closes dedup pairs the ladder has already judged distinct. Every 5 minutes: the work is sub-second, and a nightly cadence made a newly-queued distinct pair wait up to a day.'
 WHERE slug = 'dedup_close_distinct';

SELECT cron.schedule(
  'dedup_close_distinct',
  '*/5 * * * *',
  'SELECT public.run_dedup_close_distinct();'
);

DO $verify$
DECLARE
  v_reg  text;
  v_cron text;
BEGIN
  SELECT schedule INTO v_reg  FROM public.admin_automations WHERE slug = 'dedup_close_distinct';
  SELECT schedule INTO v_cron FROM cron.job             WHERE jobname = 'dedup_close_distinct';

  -- BOTH halves, because the whole point of the detect_stale_venues incident is
  -- that they can disagree and the live one is what runs.
  IF v_reg IS DISTINCT FROM '*/5 * * * *' THEN
    RAISE EXCEPTION 'registry schedule not retuned: %', coalesce(v_reg,'(no row)');
  END IF;
  IF v_cron IS DISTINCT FROM '*/5 * * * *' THEN
    RAISE EXCEPTION 'live cron schedule not retuned: %', coalesce(v_cron,'(no job)');
  END IF;

  RAISE NOTICE 'dedup_close_distinct: registry and cron both at */5';
END
$verify$;
