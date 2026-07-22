-- Queer-imagery backfill: switch to rate-safe HOURLY crons for all three entity
-- types, and register the country/event automations in admin_automations.
--
-- Why: the original 20260721150000 migration scheduled one DAILY city cron. In
-- practice Pexels/Unsplash cap at ~200 req/hour, so a daily 40-city batch is
-- rate-safe but glacial, and countries/events had no cron at all. Bursting the
-- full set at once exhausts the API quota and logs rate-limited entities as
-- permanent misses. The fix: three staggered HOURLY crons sized so the combined
-- draw (~60 entities/hr × ≤3 lookups) stays under the hourly API cap, converting
-- the whole ranked backlog over a few days without throttling.
--
-- Idempotent: unschedule-then-schedule + ON CONFLICT upsert. Already applied live
-- via the operator session; this file makes the repo reproduce that state.

-- City: 30/hr at :25
DO $$ BEGIN
  PERFORM cron.unschedule('queer_image_backfill')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queer_image_backfill');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('queer_image_backfill', '25 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/queer-imagery-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='image_quality_webhook_secret')),
    body := '{"entity_type":"city","batch_size":30}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

-- Country: 15/hr at :40
DO $$ BEGIN
  PERFORM cron.unschedule('queer_image_backfill_country')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queer_image_backfill_country');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('queer_image_backfill_country', '40 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/queer-imagery-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='image_quality_webhook_secret')),
    body := '{"entity_type":"country","batch_size":15}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

-- Event (fill-empty only): 15/hr at :55
DO $$ BEGIN
  PERFORM cron.unschedule('queer_image_backfill_event')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queer_image_backfill_event');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('queer_image_backfill_event', '55 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/queer-imagery-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Webhook-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='image_quality_webhook_secret')),
    body := '{"entity_type":"event","batch_size":15}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

-- admin_automations rows (city updated to hourly; country + event added).
INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('queer_image_backfill', 'Queer imagery backfill (cities)',
   'Hourly (:25, 30/batch). Re-image cities with queer + place-connected photos (Pexels/Unsplash/Wikimedia). Overwrites only on a qualifying hit; misses keep the existing image.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"fn":"queer-imagery-backfill","type":"edge"}'::jsonb, '25 * * * *'),
  ('queer_image_backfill_country', 'Queer imagery backfill (countries)',
   'Hourly (:40, 15/batch). Re-image countries with queer + place-connected photos. Overwrites only on a qualifying hit.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"fn":"queer-imagery-backfill","type":"edge"}'::jsonb, '40 * * * *'),
  ('queer_image_backfill_event', 'Queer imagery backfill (events)',
   'Hourly (:55, 15/batch). Fill-empty only: images for events that have none. Never touches existing event photos.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"fn":"queer-imagery-backfill","type":"edge"}'::jsonb, '55 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, managed_by = EXCLUDED.managed_by,
      trigger = EXCLUDED.trigger, action = EXCLUDED.action, schedule = EXCLUDED.schedule, updated_at = now();
