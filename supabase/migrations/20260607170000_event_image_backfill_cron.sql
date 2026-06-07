-- Schedule the og:image harvest (P1) and retire the dead enrich-event-images cron.
--
-- event-image-backfill pulls each event's OWN og:image/twitter:image from its
-- per-event source page (complements fetch-images stock art). Weekly is enough
-- to keep new ingests covered; the historical backlog was drained on rollout.
--
-- enrich-event-images called fetch-event-images, which was consolidated into the
-- unified fetch-images function — so it was firing at a 404. Remove it.

do $$
begin
  -- cron.unschedule throws if the job is absent (e.g. fresh DB) — guard on existence.
  if exists (select 1 from cron.job where jobname = 'enrich-event-images') then
    perform cron.unschedule('enrich-event-images');
  end if;
  if exists (select 1 from cron.job where jobname = 'event_image_backfill') then
    perform cron.unschedule('event_image_backfill');
  end if;
end $$;

select cron.schedule('event_image_backfill', '15 2 * * 1',
$cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/event-image-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='event_quality_webhook_secret')
    ),
    body := '{"batch_size": 40}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
$cron$
);
