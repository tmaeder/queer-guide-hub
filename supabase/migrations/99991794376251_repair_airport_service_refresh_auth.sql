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
$$;
