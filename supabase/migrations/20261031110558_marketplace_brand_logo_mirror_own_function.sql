-- Repoint the brand-logo mirror automation at its own edge function.
--
-- 20261031102733 registered `enrich_logos_brands_mirror` against
-- `enrich-logos {mode:'mirror_external'}`. The mirror moved into a dedicated
-- function, `marketplace-brand-logo-mirror`, before the cron was ever created
-- (the nightly automation_cron_sync creates it), so this only rewrites the
-- registry command. Reasons for the split: the mirror fetches URLs a human or
-- an earlier run already chose, so it needs neither logo.dev nor the
-- platform/denied-mark vocabularies, and keeping it out of enrich-logos means
-- it shares no failure mode with the three live enrich-logos crons.
--
-- Applied live via MCP apply_migration on 2026-10-31 (which stamped this
-- version), so `db push` skips it. Guarded on the old URL so a re-run is a no-op.

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
$verify$;
