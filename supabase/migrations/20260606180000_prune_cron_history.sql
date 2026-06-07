-- pg_cron never prunes cron.job_run_details. It had grown to 359k rows / 311 MB
-- (back to 2025-07) and was a material chunk of a disk-constrained DB nearing the
-- read-only threshold. One-time cleanup reclaimed it to ~39 MB; this daily job
-- keeps it bounded (7-day retention) so it can't bloat the disk again.
--
-- The command runs as the scheduling role (postgres), which owns the cron schema.
select cron.unschedule('prune_cron_history')
where exists (select 1 from cron.job where jobname = 'prune_cron_history');

select cron.schedule(
  'prune_cron_history',
  '15 2 * * *',
  $cron$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $cron$
);
