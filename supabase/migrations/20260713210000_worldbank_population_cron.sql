-- Weekly countries.population refresh from the World Bank (SP.POP.TOTL, keyless).
-- source-rest-countries switched to the static mledoze dataset (2026-07-13) which
-- carries no population; timezones/driving_side are effectively immutable and stay
-- as-is, but population drifts ~1%/yr — this cron keeps it current. The edge
-- function self-gates via requireInternalOrAdmin (verify_jwt=false).

DO $$ BEGIN
  PERFORM cron.unschedule('worldbank_population_refresh')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'worldbank_population_refresh');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'worldbank_population_refresh',
  '45 5 * * 2',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-worldbank-population',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $cron$
);

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'worldbank_population_refresh',
  'World Bank population refresh',
  'Weekly (Tue 05:45), refresh countries.population from the World Bank API (SP.POP.TOTL, keyless). Only rows whose value changed are written; matched by ISO2 code.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "enrich-worldbank-population", "type": "edge"}'::jsonb,
  '45 5 * * 2'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      managed_by  = EXCLUDED.managed_by,
      trigger     = EXCLUDED.trigger,
      action      = EXCLUDED.action,
      schedule    = EXCLUDED.schedule,
      updated_at  = now();
