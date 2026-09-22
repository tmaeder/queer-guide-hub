-- Resume perceptual hashing with a memory-safe one-image invocation. The edge
-- worker rejects oversized pixel dimensions before ImageScript decodes them.
update public.admin_automations
set enabled = true,
    consecutive_failures = 0,
    last_run_status = 'pending',
    action = jsonb_set(action, '{command}', to_jsonb($command$
      select net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/image-phash-backfill',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
          'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
        ),
        body := '{"limit":1}'::jsonb,
        timeout_milliseconds := 55000
      );
    $command$::text)),
    updated_at = now()
where slug = 'image_phash_backfill';

do $phash$
declare v_command text;
begin
  select action->>'command' into v_command
  from public.admin_automations where slug = 'image_phash_backfill';
  if v_command is null then
    raise exception 'image_phash_backfill registry row or command is missing';
  end if;
  if exists (select 1 from cron.job where jobname = 'image_phash_backfill') then
    perform cron.unschedule('image_phash_backfill');
  end if;
  perform cron.schedule('image_phash_backfill', '* * * * *', v_command);
end;
$phash$;
