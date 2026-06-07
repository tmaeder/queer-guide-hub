-- ============================================================================
-- Tag Content-Quality: Phase 4 — i18n at scale (parked cron)
-- ----------------------------------------------------------------------------
-- Wires the already-built translate-i18n-batch edge function to a daily cron for
-- unified_tags, one job per locale (field=description), quality-gated so LLM
-- budget is spent on good tags first (min_quality=40) in small batches.
--
-- PARKED by design: each job POSTs with X-Webhook-Secret read from Vault
-- (name='translate_i18n_webhook_secret'). Until BOTH of these exist the POSTs
-- return 401 and rotate harmlessly (effectively paused):
--   1) supabase functions deploy translate-i18n-batch   (ships the min_quality gate)
--   2) select vault.create_secret('<secret>', 'translate_i18n_webhook_secret', 'tag i18n cron auth');
--   3) supabase secrets set TRANSLATE_I18N_WEBHOOK_SECRET=<secret>   (on the function)
-- To also localize tag NAMES, add field=name jobs the same way.
-- ============================================================================

DO $$
DECLARE
  v_locales text[] := ARRAY['de','fr','es','it','pt','nl','pl','ru','tr','uk','sv'];
  loc text;
  i int := 0;
  v_jobname text;
BEGIN
  FOREACH loc IN ARRAY v_locales LOOP
    v_jobname := 'tag_i18n_' || loc;
    IF EXISTS (SELECT 1 FROM cron.job WHERE cron.job.jobname = v_jobname) THEN
      PERFORM cron.unschedule(v_jobname);
    END IF;
    -- stagger across the 05:00 hour to avoid an LLM burst
    PERFORM cron.schedule(
      v_jobname,
      format('%s 5 * * *', (i * 5) % 60),
      format(
        $cron$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='translate_i18n_webhook_secret')
          ),
          body := jsonb_build_object('table','unified_tags','locale',%L,'field','description','min_quality',40,'batch_limit',15)
        ) as request_id;
        $cron$, loc
      )
    );
    i := i + 1;
  END LOOP;
END $$;
