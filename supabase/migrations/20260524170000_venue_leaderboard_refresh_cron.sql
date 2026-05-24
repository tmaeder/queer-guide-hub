-- Hourly cron to refresh the venue leaderboard materialized views.
-- Calls public.refresh_venue_leaderboards() at minute :07 every hour,
-- offset from other crons. Each refresh is CONCURRENT so it never blocks
-- readers. The function is SECURITY DEFINER so pg_cron's runner has the
-- right privileges.

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='refresh-venue-leaderboards';
  PERFORM cron.schedule(
    'refresh-venue-leaderboards',
    '7 * * * *',
    $f$ SELECT public.refresh_venue_leaderboards(); $f$
  );
END $$;
