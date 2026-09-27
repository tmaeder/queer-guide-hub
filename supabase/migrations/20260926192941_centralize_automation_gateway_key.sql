-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926192941 with no repo file — the signature of
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
-- Scheduled Edge calls inherited 58 copies of the same legacy anon JWT. It is
-- publishable rather than privileged, but copying it into registry rows makes
-- rotation error-prone. Derive it from the existing configuration once, keep
-- it in Vault, and render every Authorization header from that single source.
do $$
declare
  v_key text;
  v_distinct integer;
begin
  select count(distinct substring(action->>'command' from 'Bearer (eyJ[A-Za-z0-9._-]+)')),
         min(substring(action->>'command' from 'Bearer (eyJ[A-Za-z0-9._-]+)'))
  into v_distinct, v_key
  from public.admin_automations
  where coalesce(action->>'command', '') ~ 'Bearer eyJ';

  if v_key is null or v_distinct <> 1 then
    raise exception 'expected exactly one embedded legacy anon key, found %', v_distinct;
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'legacy_anon_key'
  ) then
    perform vault.create_secret(
      v_key,
      'legacy_anon_key',
      'Centralized legacy anon JWT for scheduled Edge gateway authorization'
    );
  end if;
end
$$;

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(
        regexp_replace(
          action->>'command',
          '''Authorization''[[:space:]]*,[[:space:]]*''Bearer eyJ[^'']+''',
          '''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''legacy_anon_key'')',
          'g'
        )
      ),
      true
    ),
    updated_at = now()
where action->>'command' ~ '''Authorization''[[:space:]]*,[[:space:]]*''Bearer eyJ';

-- Two old rows encoded the whole headers object as a JSON string, so replace
-- them explicitly with the same jsonb_build_object contract as other jobs.
update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($command$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'legacy_anon_key')
      ),
      body := '{"batch_size":10}'::jsonb,
      timeout_milliseconds := 120000
    );
  $command$::text),
      true
    ),
    updated_at = now()
where slug = 'personality_refresh';

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($command$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-supabase-advisors',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'legacy_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $command$::text),
      true
    ),
    updated_at = now()
where slug = 'sync_supabase_advisors_hourly';

update public.admin_automations
set capability_reason = case slug
      when 'marketplace_taxonomy_classify'
        then 'Paused before lifecycle auditing; re-enable only with a documented taxonomy fallback rollout'
      else 'Paused before lifecycle auditing; re-enable only with a documented v3 backfill rollout'
    end,
    updated_at = now()
where slug in ('marketplace_taxonomy_classify', 'marketplace_taxonomy_v3_backfill')
  and not enabled;

select public.sync_automations_to_cron(true);

do $$
begin
  if exists (
    select 1 from public.admin_automations
    where coalesce(action->>'command', '') ~ 'Bearer eyJ'
  ) then
    raise exception 'embedded legacy bearer token remains in automation registry';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'legacy_anon_key'
  ) then
    raise exception 'centralized legacy anon key was not created';
  end if;
end
$$;
;
