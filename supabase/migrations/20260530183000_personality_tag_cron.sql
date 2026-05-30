-- Daily safe auto-tag sweep for newly-added/edited personalities.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-auto-tag';
  PERFORM cron.schedule('personality-auto-tag', '50 4 * * *', $f$
    SELECT public.assign_personality_profession_tags(2000, false);
  $f$);
END $$;
