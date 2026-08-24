-- Re-tune the upscale sweep against measured behaviour, not the guess it shipped with.
--
-- It shipped at batch 40 / 2500ms per host on the theory that misterb was rate
-- limiting. That theory was wrong, and so was every other one tried: not per-IP
-- rate limiting (this egress 200s), not TLS fingerprinting, not datacenter
-- blocking. Measured in a single call with identical pacing, two known URLs
-- returned 906x906 and 900x900 while four fresh ones 403'd in between — it is
-- PER FILE. Magento answers a deleted asset with 403, and roughly 99% of
-- misterb's originals are deleted (1 live in 141 requests).
--
-- Two consequences, both of which the old settings got wrong:
--
-- 1. The gap can drop to 500ms. There is no limiter to respect, and a 2500ms
--    gap bought nothing while capping a run at ~44 requests.
--
-- 2. The batch MUST be large. The dead/blocked discriminator only stamps a
--    403 as "file gone" once that host has answered something in the same run,
--    and at a ~1% survival rate a batch of 5-15 usually contains no live file
--    at all — so nothing gets stamped and the sweep spins. At batch 60 the
--    first live hit corroborates the host and the rest of the batch drains:
--    measured, that run stamped 31 dead rows and recovered 1 real image.
UPDATE public.admin_automations
SET action = jsonb_set(action, '{command}', to_jsonb($cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-upscale',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":60,"host_gap_ms":500,"max_ms":110000}'::jsonb,
    timeout_milliseconds := 150000
  );
$cmd$::text))
WHERE slug = 'marketplace_image_upscale';

SELECT cron.unschedule('marketplace-image-upscale');

SELECT cron.schedule(
  a.action->>'jobname',
  a.schedule,
  public.admin_automation_effective_command(a.slug, a.action->>'command')
)
FROM public.admin_automations a
WHERE a.slug = 'marketplace_image_upscale';
