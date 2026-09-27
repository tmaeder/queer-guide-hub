-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926191027 with no repo file — the signature of
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
-- Close the gaps found by the full production automation audit: authenticate
-- the watched-URL cron, expose partial streaks, remove a duplicate schedule,
-- repair missing-secret callers, and give pg_net enough bounded time to reach
-- its Edge targets.

alter table public.admin_automations
  add column if not exists consecutive_partials integer not null default 0
  check (consecutive_partials >= 0);

comment on column public.admin_automations.consecutive_partials is
  'Consecutive terminal partial results. Partials require operator attention but do not trip the hard-error circuit breaker.';

-- Seed the new counter from the leading partial run streak so the console is
-- truthful immediately after deployment rather than only after the next fire.
with ranked as (
  select automation_id, status,
         row_number() over (partition by automation_id order by started_at desc, id desc) as rn
  from public.admin_automation_runs
  where finished_at is not null
), leading_partials as (
  select r.automation_id, count(*)::integer as streak
  from ranked r
  where r.status = 'partial'
    and not exists (
      select 1 from ranked newer
      where newer.automation_id = r.automation_id
        and newer.rn < r.rn
        and newer.status <> 'partial'
    )
  group by r.automation_id
)
update public.admin_automations a
set consecutive_partials = coalesce(s.streak, 0)
from (select id from public.admin_automations) present
left join leading_partials s on s.automation_id = present.id
where a.id = present.id;

create or replace function public.admin_automation_runs_after_finish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now_failures integer;
  v_threshold integer;
  v_jobname text;
begin
  if new.finished_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.finished_at is not null then return new; end if;

  if new.status = 'error' then
    perform set_config('app.automation_state_source', 'circuit_breaker', true);
    perform set_config('app.automation_state_reason', coalesce(new.error, 'automation run failed'), true);

    update public.admin_automations
    set consecutive_failures = consecutive_failures + 1,
        consecutive_partials = 0,
        last_run_at = new.finished_at,
        last_run_status = 'error'
    where id = new.automation_id
    returning consecutive_failures, auto_pause_threshold,
              coalesce(action->>'jobname', slug)
    into v_now_failures, v_threshold, v_jobname;

    if v_now_failures is not null and v_now_failures >= v_threshold then
      update public.admin_automations
      set enabled = false,
          lifecycle_state = 'auto_paused',
          last_run_status = 'auto_paused'
      where id = new.automation_id;

      new.summary := coalesce(new.summary, '{}'::jsonb)
        || jsonb_build_object(
          'auto_paused', true,
          'reason', 'consecutive_failures >= ' || v_threshold,
          'consecutive_failures', v_now_failures
        );

      begin
        if exists (select 1 from cron.job where jobname = v_jobname) then
          perform cron.unschedule(v_jobname);
        end if;
      exception when others then
        new.summary := new.summary || jsonb_build_object('unschedule_error', sqlerrm);
      end;
    end if;
  elsif new.status = 'success' then
    update public.admin_automations
    set consecutive_failures = 0,
        consecutive_partials = 0,
        last_run_at = new.finished_at,
        last_run_status = 'success'
    where id = new.automation_id;
  elsif new.status = 'partial' then
    update public.admin_automations
    set consecutive_partials = consecutive_partials + 1,
        last_run_at = new.finished_at,
        last_run_status = 'partial'
    where id = new.automation_id;
  end if;

  return new;
end;
$$;

alter function public.admin_automation_runs_after_finish() owner to postgres;
revoke all on function public.admin_automation_runs_after_finish() from public, anon, authenticated;

-- The Edge Function self-gates with requireInternalOrAdmin. Present the shared
-- internal secret and use an explicit timeout instead of leaving a privileged
-- endpoint public and relying on pg_net's five-second default.
update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($command$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/refresh-watched-urls',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $command$::text),
      true
    ),
    updated_at = now()
where slug = 'refresh_watched_urls';

-- These functions already accept the standard internal secret. The old
-- dedicated secret was never provisioned, so use the established contract.
update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(
        replace(
          replace(action->>'command', 'X-Webhook-Secret', 'x-internal-secret'),
          'existence_webhook_secret', 'internal_invoke_secret'
        )
      ),
      true
    ),
    updated_at = now()
where slug in ('existence_deep_probe', 'existence_external_osm');

-- Add a bounded explicit timeout to every enabled HTTP cron that still relies
-- on pg_net's five-second default. Classification is the one set-returning
-- command whose call is followed by FROM rather than a semicolon.
do $$
declare
  r record;
  v_command text;
  v_timeout integer;
begin
  for r in
    select id, slug, action
    from public.admin_automations
    where enabled and schedule is not null
      and coalesce(action->>'command', '') ilike '%net.http_post%'
      and coalesce(action->>'command', '') not ilike '%timeout_milliseconds%'
  loop
    v_timeout := case
      when r.slug in ('workflow_dispatcher_1min', 'pipeline_dlq_consumer', 'refresh_watched_urls') then 55000
      else 120000
    end;
    v_command := r.action->>'command';

    if r.slug = 'classify_new_content' then
      v_command := regexp_replace(
        v_command,
        E'(body := jsonb_build_object\\([^\\n]+\\)\\n[ \\t]*)(\\)\\n[ \\t]*FROM)',
        E'\\1,\\n        timeout_milliseconds := ' || v_timeout || E'\\n      \\2',
        'i'
      );
    else
      v_command := regexp_replace(
        v_command,
        E'\\)([ \\t]+[Aa][Ss][ \\t]+request_id)?;',
        E',\\n    timeout_milliseconds := ' || v_timeout || E')\\1;',
        'i'
      );
    end if;

    if v_command = r.action->>'command' or v_command not ilike '%timeout_milliseconds%' then
      raise exception 'could not add HTTP timeout to automation %', r.slug;
    end if;

    update public.admin_automations
    set action = jsonb_set(action, '{command}', to_jsonb(v_command), true),
        updated_at = now()
    where id = r.id;
  end loop;
end
$$;

-- Reduce oversized synchronous batches that repeatedly exceed their caller
-- budget. The jobs drain incrementally, so smaller batches preserve throughput
-- while making every invocation observable and retryable.
update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(
        replace(replace(replace(replace(action->>'command',
          '"batch_limit": 200', '"batch_limit": 25'),
          '"batch_limit": 80', '"batch_limit": 25'),
          '"batch_size":25', '"batch_size":10'),
          '"batch_size":20', '"batch_size":10')
      ),
      true
    ),
    updated_at = now()
where slug in (
  'city_corroboration', 'event_liveness_checker', 'news_link_checker',
  'personality_refresh', 'personality_extract_from_bio'
);

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(replace(action->>'command', '''batch_size'', 40', '''batch_size'', 10')),
      true
    ),
    updated_at = now()
where slug = 'classify_new_content';

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(replace(action->>'command', '''limit'', 200', '''limit'', 50')),
      true
    ),
    updated_at = now()
where slug = 'feedback_autotriage_sweep';

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(replace(replace(action->>'command', '''batch_limit'', 40', '''batch_limit'', 15'), '''cat_limit'', 50', '''cat_limit'', 20')),
      true
    ),
    updated_at = now()
where slug = 'tag_enrichment_sweep';

-- Spread the jobs that showed partial/DNS failures away from the busiest minute
-- groups. This is intentionally surgical; healthy lanes keep their cadence.
update public.admin_automations
set schedule = case slug
      when 'tag_enrichment_sweep' then '6 */2 * * *'
      when 'amenity_truth_backfill' then '8 */3 * * *'
      when 'city_agentic_enrich' then '24 * * * *'
      when 'city_corroboration' then '47 3 * * *'
      when 'classify_new_content' then '26 4 * * *'
      when 'event_liveness_checker' then '13 2 * * *'
      when 'news_link_checker' then '18 2 * * *'
      when 'personality_extract_from_bio' then '17 4 * * *'
      when 'feedback_autotriage_sweep' then '53 3 * * *'
      when 'tag_prose_pass' then '33 3 * * *'
      when 'news_orphan_reclaim' then '34 * * * *'
      when 'pipeline_geo_validate' then '12 5 * * *'
      else schedule
    end,
    updated_at = now()
where slug in (
  'tag_enrichment_sweep', 'amenity_truth_backfill', 'city_agentic_enrich',
  'city_corroboration', 'classify_new_content', 'event_liveness_checker',
  'news_link_checker', 'personality_extract_from_bio',
  'feedback_autotriage_sweep', 'tag_prose_pass', 'news_orphan_reclaim',
  'pipeline_geo_validate'
);

-- Keep the canonical, larger resync and retain the former lane as auditable
-- consolidated history rather than deleting it.
select set_config('app.automation_state_source', 'migration', true);
select set_config('app.automation_state_reason', 'duplicate tag category resync consolidated', true);

update public.admin_automations
set enabled = false,
    lifecycle_state = 'consolidated',
    schedule = null,
    can_run_now = false,
    can_dry_run = false,
    capability_reason = 'Consolidated into tag_category_resync',
    description = '[CONSOLIDATED 2026-09-26] Duplicate of tag_category_resync; retained for audit history.',
    updated_at = now()
where slug = 'tag_category_text_resync';

-- These were described as shadow/manual backfills but misleadingly enabled
-- without any executable path. Pause them until a dedicated runner is added.
select set_config('app.automation_state_reason', 'enabled entry had no schedule or supported runner', true);

update public.admin_automations
set enabled = false,
    lifecycle_state = 'paused',
    capability_reason = case slug
      when 'event_quality_repairs' then 'Shadow rollout; add an approved parameterized runner before enabling'
      else 'Manual backfill; add a supported Edge runner before enabling'
    end,
    updated_at = now()
where slug in ('event_quality_repairs', 'news_resanitize_backfill');

update public.admin_automations
set capability_reason = 'Feature flag consumed by the local feedback runner; no cron or manual action is expected',
    updated_at = now()
where slug = 'feedback_auto_merge';

-- Normalize RPC metadata so the registry does not rely on implicit slug and
-- legacy `function` fallbacks.
update public.admin_automations
set action = jsonb_set(
      jsonb_set(
        action,
        '{fn}',
        to_jsonb(coalesce(action->>'fn', action->>'function')),
        true
      ),
      '{jobname}',
      to_jsonb(slug),
      true
    ),
    updated_at = now()
where action->>'type' = 'rpc'
  and (not action ? 'jobname' or not action ? 'fn');

-- Re-render cron once after all registry changes. This also removes the
-- consolidated schedule and publishes the new headers/timeouts/staggering.
select public.sync_automations_to_cron(true);

do $$
begin
  if exists (
    select 1 from public.admin_automations
    where enabled and schedule is not null
      and coalesce(action->>'command', '') ilike '%net.http_post%'
      and coalesce(action->>'command', '') not ilike '%timeout_milliseconds%'
  ) then
    raise exception 'enabled HTTP schedules remain without explicit timeout';
  end if;

  if exists (
    select 1 from cron.job where jobname = 'tag_category_text_resync' and active
  ) then
    raise exception 'duplicate tag category resync is still scheduled';
  end if;

  if exists (
    select 1 from public.admin_automations
    where slug in ('event_quality_repairs', 'news_resanitize_backfill') and enabled
  ) then
    raise exception 'unreachable backfill remained enabled';
  end if;
end
$$;
;
