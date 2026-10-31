-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261031110558 with no repo file — the signature of
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
update public.admin_automations
set action = jsonb_build_object(
      'type', 'cron',
      'jobname', 'enrich-logos-brands-mirror',
      'command', $cmd$
  SELECT public.automation_http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-brand-logo-mirror',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"batch_size": 40}'::jsonb,
    timeout_milliseconds := 250000
  ) AS request_id;
$cmd$),
    updated_at = now()
where slug = 'enrich_logos_brands_mirror'
  and action->>'command' like '%/functions/v1/enrich-logos''%';

do $verify$
declare v_cmd text; v_plan jsonb;
begin
  select action->>'command' into v_cmd from public.admin_automations where slug = 'enrich_logos_brands_mirror';
  if v_cmd is null or v_cmd not like '%/functions/v1/marketplace-brand-logo-mirror%' then
    raise exception 'enrich_logos_brands_mirror does not point at marketplace-brand-logo-mirror: %', v_cmd;
  end if;
  if not exists (select 1 from cron.job where jobname = 'enrich-logos-brands-mirror') then
    select public.sync_automations_to_cron(false) into v_plan;
    if not (v_plan -> 'recreated') ? 'enrich-logos-brands-mirror' then
      raise exception 'sync_automations_to_cron would NOT create enrich-logos-brands-mirror; plan was %', v_plan;
    end if;
  end if;
end
$verify$;;
