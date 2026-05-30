-- Rebuild auto relationship edges daily (after geo + tag sweeps at 04:40/04:50).
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-relationship-build';
  PERFORM cron.schedule('personality-relationship-build', '0 5 * * *', $f$
    SELECT public.build_personality_relationships(20000, false);
  $f$);
END $$;
