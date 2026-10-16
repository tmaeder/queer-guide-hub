-- Slow the admin review counts refresher from */2 to */10.
--
-- WHAT THIS IS AND IS NOT. This reclaims DB time on a contended instance. It
-- does NOT fix the `get_admin_review_queue` latency tail, and the measurement
-- below is recorded precisely so nobody re-derives that hope. It was changed
-- while chasing that tail; the data said the refresher was not the cause.
--
-- THE NUMBERS THAT JUSTIFY IT (pg_stat_statements, ~23h since the 2026-10-15
-- 19:20 restart):
--
--   SELECT public.refresh_admin_review_queue_counts()
--     calls 704   mean 4,113ms   max 43,231ms   total 2,896s
--
-- 2,896 seconds is ~48 minutes of cumulative backend time per day spent
-- re-scanning the same 41-view, ~326k-row corpus the user-facing query scans,
-- to produce counters that lag by design and are already rendered beside a
-- `counts_as_of` timestamp. At */10 that is 144 runs instead of 720 — roughly
-- 38 minutes/day returned, for up to 10 minutes of staleness instead of 2 on a
-- 326k-item backlog that moves slowly.
--
-- WHY IT IS NOT THE LATENCY FIX, MEASURED RATHER THAN ASSUMED. 45 consecutive
-- timed calls to get_admin_review_queue(scope=>'decisions'), each bucketed by
-- whether a refresher run overlapped it (joined against cron.job_run_details):
--
--   refresher NOT overlapping   n=43   p50 2,060ms   max 6,967ms   2 over 5s
--   refresher overlapping       n=2    p50 4,143ms   max 6,804ms   1 over 5s
--
-- The tail is present with no refresher running at all, and overlap is only
-- 4.4% of samples — matching the 3.4% duty cycle the totals above imply. The
-- overlapped samples ARE slower, in two independent windows, so the contention
-- is real; it is simply too rare to explain the tail. What does explain it was
-- read straight off pg_stat_activity during a slow window: 35 active backends,
-- 10 of them running over 5 seconds, including `autovacuum: VACUUM
-- public.search_embeddings` (a 902 MB table), `run_staging_reconcile_committed`
-- and `search_reindex_drain`. The tail is instance-wide contention from other
-- scheduled work.
--
-- A BEFORE/AFTER ON WALL CLOCK WOULD BE DISHONEST HERE AND IS DELIBERATELY NOT
-- QUOTED. The obvious framing — sample before, change, sample after — was run
-- and produced an apparent win (max 6,967ms -> 4,731ms, 3 over-5s -> 0). It
-- does not survive inspection, for two separate reasons, both worth recording:
--   1. The improvement also appeared in the NOT-overlapping bucket, whose
--      samples by definition had no refresher running, so it cannot be this
--      change. The baseline ran during a CI storm; the later window did not.
--   2. The first "after" sample was not even measuring the new cadence. The
--      alter_job landed between 19:20 and 19:22, and that window ran 19:18-
--      19:21 with */2 still firing — visible as 4 overlaps where */10 should
--      give nearly none. Confirmed by the ABSENCE of a 19:22 run.
-- On an instance whose load varies by an order of magnitude within the hour, a
-- two-window wall-clock comparison measures the hour, not the change.
--
-- ROLLBACK: set both back to '*/2 * * * *'. Prior state was registry
-- schedule '*/2 * * * *' and cron.job 2681 schedule '*/2 * * * *', both active.
--
-- BOTH LAYERS ARE WRITTEN ON PURPOSE. `admin_automations` is the registry of
-- record and carries its own `schedule` column, but this row is
-- action->>'type' = 'rpc', and per the house rule rpc automations are scheduled
-- by their own migration rather than reconciled from the registry by
-- sync_automations_to_cron(). Writing only the registry would leave pg_cron on
-- the old cadence with the registry claiming otherwise, which is the drift
-- shape this repo keeps paying for.

-- Soft on preconditions: both statements are no-ops if the value is already
-- there (this was applied live while measuring), and neither invents a job.
update public.admin_automations
   set schedule = '*/10 * * * *'
 where slug = 'admin_review_counts_refresh'
   and schedule is distinct from '*/10 * * * *';

do $apply$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'admin_review_counts_refresh';
  if v_jobid is null then
    raise notice 'admin_review_counts_refresh has no cron.job row; registry updated only';
  else
    perform cron.alter_job(v_jobid, schedule := '*/10 * * * *');
  end if;
end $apply$;

-- Hard on postconditions: the state this file exists to reach.
do $verify$
declare v_reg text; v_cron text; v_active boolean;
begin
  select schedule into v_reg from public.admin_automations
   where slug = 'admin_review_counts_refresh';
  select schedule, active into v_cron, v_active from cron.job
   where jobname = 'admin_review_counts_refresh';

  if v_reg is distinct from '*/10 * * * *' then
    raise exception 'registry schedule is %, expected */10 * * * *', coalesce(v_reg,'<no row>');
  end if;

  -- A missing cron row is tolerated above (registry-only environments) but a
  -- PRESENT row disagreeing with the registry is the drift this migration
  -- exists to prevent, so it fails rather than being left to a reconciler.
  if v_cron is not null and v_cron is distinct from '*/10 * * * *' then
    raise exception 'cron schedule is %, expected */10 * * * * (registry says %)', v_cron, v_reg;
  end if;

  if v_cron is not null and not coalesce(v_active, false) then
    raise exception 'admin_review_counts_refresh is scheduled but inactive — the counts cache would go stale silently';
  end if;
end $verify$;
