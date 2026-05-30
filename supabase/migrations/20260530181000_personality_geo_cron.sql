-- Daily geo-link sweep for any newly-added personalities the trigger missed
-- (e.g. rows where birth_place was set after insert via a path that bypassed
-- the UPDATE OF trigger). Cheap SQL-only RPC; small batch.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-geo-backfill';
  PERFORM cron.schedule('personality-geo-backfill', '40 4 * * *', $f$
    SELECT public.backfill_personality_geo(500, false);
  $f$);
END $$;
