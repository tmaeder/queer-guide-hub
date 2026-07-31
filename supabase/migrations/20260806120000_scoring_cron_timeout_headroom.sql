-- Give the two heavy scoring crons a statement_timeout they can actually finish
-- inside. Follow-up to 20260806100000, which revived them but sized the budget
-- from a rate that turned out to be optimistic for these two jobs.
--
-- 20260806100000 set every job to `SET statement_timeout = '540s'` with a 7,000
-- row batch, justified as "540s at the measured ~55 ms/row covers a 7,000-row
-- batch with margin". The ~55 ms/row figure came from an EXPLAIN ANALYZE of the
-- search_documents trigger alone. Measured end-to-end on prod 2026-07-31, the
-- two marketplace-side jobs are meaningfully slower than that, because each row
-- also pays for its scoring function on top of the trigger:
--
--   run_marketplace_quality_recompute   300 rows -> 24.6 s  |  500 rows -> 34.5 s
--   run_content_completeness_recompute  300 rows -> 21.9 s
--
-- Fitting fixed + per-row cost gives roughly 10 s fixed (the CTE scores every
-- active listing before LIMIT picks the batch) plus ~60 ms/row of write. At
-- 7,000 rows that is ~430 s against a 540 s ceiling — about 1.25x headroom, on
-- an idle database. These jobs run inside the 03:00 cron herd, where they will
-- be slower, not faster.
--
-- That margin is not survivable, because the failure is a cliff rather than a
-- slowdown: statement_timeout aborts the transaction, so a run that gets 95% of
-- the way through persists NOTHING and the backlog never converges. That is
-- exactly how these four jobs stayed 8/8 failed with zero successes for their
-- entire lifetime before 20260806100000.
--
-- Fix: raise the ceiling to 900 s for the two marginal jobs. This is a ceiling,
-- not a target — a run that finishes in 430 s still exits at 430 s, so the cost
-- of the extra headroom is zero on the happy path. Batch stays at 7,000 so the
-- backlogs (26.6k marketplace listings, 53.2k products) still drain in ~8 nights
-- rather than ~18 at a reduced batch.
--
-- Deliberately NOT changed:
--   * event_trust_recompute  — measured 300 rows -> 11.9 s (~40 ms/row) once
--     20260806100000 added idx_event_sources(event_id); 7,000 rows is ~276 s,
--     roughly 2x headroom inside 540 s.
--   * detect-stale-venues    — 0 rows pending at the 180d threshold; 1.9 s.
--
-- Schedule safety: the jobs are staggered 02:55 / 03:40 / 03:50 / 04:30. Even if
-- both raised jobs ran the full 900 s they would end 03:10 and 04:05, so no pair
-- can overlap.
--
-- VERIFIED ON PROD, and the measurement is the whole argument. The real
-- registered `marketplace_quality_recompute` job was fired once with this exact
-- command (batch 7,000, 900 s ceiling) and recorded in cron.job_run_details as:
--
--   start 2026-07-31 21:18:00Z   end 21:27:09Z   status succeeded   549.4 s
--
-- 549.4 s is **9 seconds past the previous 540 s ceiling**. This is not an
-- extrapolation: under the setting shipped in 20260806100000, that run would
-- have been cancelled with zero rows persisted. Under 900 s it committed.
-- (For contrast: before 20260806100000 the same job died at exactly 120.0 s.)
--
-- NOTE — a concurrent session is separately moving these jobs toward small
-- batches run more often (`event_trust_recompute` is live at `10 * * * *`,
-- batch 1500, 240 s; `detect-stale-venues` at batch 1500, 240 s). That is
-- arguably the better shape, because a 549 s write transaction on a
-- disk-constrained database holds locks and bloats for nine minutes. This
-- migration deliberately does NOT adopt it: it repairs the configuration that
-- is actually committed to git (daily, batch 7,000) with the one change that is
-- verified to make it work. If the small-batch/frequent design is the intended
-- end state, it needs `admin_automations.schedule` updated too — otherwise
-- `automation_cron_sync` (`10 5 * * *`, registry is source of truth) reverts
-- those schedules to daily and leaves them draining at 1,500/night.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'marketplace_quality_recompute'),
  command => $cmd$SET statement_timeout = '900s'; SELECT public.run_marketplace_quality_recompute(7000);$cmd$
);

-- Deconflict 03:50. content_completeness_recompute was moved to hourly `50 * * * *`
-- (registry updated to match), which puts it on the SAME minute as
-- marketplace_quality_recompute's `50 3 * * *`. Those are the two heaviest jobs
-- here — both batch 7,000, both with a 900 s ceiling — and marketplace alone
-- measured 549 s on an idle database. Run concurrently they contend for the same
-- search_documents index maintenance, so both could plausibly exceed 900 s and
-- BOTH roll back, which is the exact all-or-nothing failure this migration exists
-- to prevent.
--
-- Move marketplace to 03:20. Hourly traffic already occupies :10
-- (event_trust_recompute, 240 s) and :50 (content_completeness, up to 900 s), so
-- :20 is clear: 03:10→03:14, 03:20→~03:29, 03:50→~03:59, 04:30 detect-stale-venues.
-- The registry is the source of truth for schedules (`automation_cron_sync`,
-- `10 5 * * *`), so it has to be updated too or this reverts within a day.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'marketplace_quality_recompute'),
  schedule => '20 3 * * *'
);

update public.admin_automations
   set schedule = '20 3 * * *', updated_at = now()
 where coalesce(action->>'jobname', slug) = 'marketplace_quality_recompute'
   and schedule is distinct from '20 3 * * *';

select cron.alter_job(
  (select jobid from cron.job where jobname = 'content_completeness_recompute'),
  command => $cmd$SET statement_timeout = '900s'; SELECT public.run_content_completeness_recompute(false, 7000);$cmd$
);
