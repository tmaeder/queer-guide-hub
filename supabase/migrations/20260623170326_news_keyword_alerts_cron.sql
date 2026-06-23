-- Register news-keyword-alerts edge function in admin_automations (daily + weekly crons).

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('news_keyword_alerts_daily',
   'News keyword alerts — daily',
   'Sends daily email digests for saved news search alerts where alert_frequency=daily.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"edge","fn":"news-keyword-alerts","body":{"frequency":"daily"}}'::jsonb,
   '0 7 * * *'),
  ('news_keyword_alerts_weekly',
   'News keyword alerts — weekly',
   'Sends weekly email digests for saved news search alerts where alert_frequency=weekly.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"edge","fn":"news-keyword-alerts","body":{"frequency":"weekly"}}'::jsonb,
   '0 8 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action,
      schedule=EXCLUDED.schedule, enabled=EXCLUDED.enabled;

-- Register pg_cron jobs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_keyword_alerts_daily') THEN
    PERFORM cron.unschedule('news_keyword_alerts_daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_keyword_alerts_weekly') THEN
    PERFORM cron.unschedule('news_keyword_alerts_weekly');
  END IF;
END $$;

SELECT cron.schedule('news_keyword_alerts_daily', '0 7 * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-keyword-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'news_alerts_webhook_secret')
    ),
    body := '{"frequency":"daily"}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);

SELECT cron.schedule('news_keyword_alerts_weekly', '0 8 * * 1', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-keyword-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'news_alerts_webhook_secret')
    ),
    body := '{"frequency":"weekly"}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
;
