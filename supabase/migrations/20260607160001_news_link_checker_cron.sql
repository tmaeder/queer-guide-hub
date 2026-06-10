-- Daily news dead-link sweep (news-link-checker edge function).
--
-- Completes the Phase 4 truth-loop liveness arm. Internal-secret auth
-- (x-internal-secret header = INTERNAL_INVOKE_SECRET env / vault
-- internal_invoke_secret). 80/day rotates the corpus by last_verified_at and
-- feeds a `link_health` signal into run_news_trust_recompute. Conservative:
-- only 404/410 demote (needs_attention=true); 401/403/405/429 and network
-- errors are treated as alive (see _shared/link-health.ts).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_link_checker') THEN
    PERFORM cron.unschedule('news_link_checker');
  END IF;
END $$;
SELECT cron.schedule(
  'news_link_checker', '15 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-link-checker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_limit": 80}'::jsonb
  );
  $cron$
);
