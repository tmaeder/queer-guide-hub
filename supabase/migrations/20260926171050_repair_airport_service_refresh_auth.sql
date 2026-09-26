-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926171050 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Standardize the monthly airport refresh on the internal invocation secret.
-- Its previous CITY_QUALITY_WEBHOOK_SECRET pairing drifted between Vault and
-- the Edge environment, so the function correctly rejected cron with 401.

UPDATE public.admin_automations
SET action = jsonb_set(
      action,
      '{command}',
      to_jsonb($command$
  select public.automation_http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/airport-service-refresh',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$command$::text),
      true
    ),
    updated_at = now()
WHERE slug = 'airport_service_refresh';

DO $$
DECLARE
  v_schedule text;
  v_command text;
BEGIN
  SELECT schedule, public.admin_automation_effective_command(slug, action->>'command')
    INTO v_schedule, v_command
  FROM public.admin_automations
  WHERE slug = 'airport_service_refresh';

  IF v_schedule IS NULL OR v_command IS NULL THEN
    RAISE EXCEPTION 'airport_service_refresh registry row is missing';
  END IF;

  BEGIN
    PERFORM cron.unschedule('airport_service_refresh');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('airport_service_refresh', v_schedule, v_command);
END;
$$;;
