-- One read-only snapshot across the operational registries, including rows hidden
-- by the public feed policy and scheduled jobs outside the automation registry.
create function api_private.admin_data_operations_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce((select public.has_role_jwt('admin')), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return (
    with cron_schedules as (
      select jobname, count(*) as matches, bool_or(active) as active, min(schedule) as schedule
      from cron.job
      group by jobname
    ), automation_jobs as (
      select a.id, a.name, a.slug, a.enabled, a.schedule, a.last_run_at, a.last_run_status,
        a.consecutive_failures, a.action->>'type' as action_type, a.trigger->>'type' as trigger_type,
        case when j.matches = 1 then j.schedule end as cron_schedule,
        case
          when j.matches > 1 then 'Multiple pg_cron jobs share this registry name'
          when not a.enabled and j.active then 'Disabled in the registry but active in pg_cron'
          when a.enabled and a.schedule is not null and j.matches is null then 'Scheduled job missing from pg_cron'
          when a.enabled and j.active is false then 'Enabled in the registry but inactive in pg_cron'
          when a.enabled and a.schedule <> j.schedule then 'Registry expects ' || a.schedule
        end as schedule_issue
      from public.admin_automations a
      left join cron_schedules j on j.jobname = coalesce(a.action->>'jobname', a.slug)
    ), entries as (
      select 'adapter'::text as kind, id::text as id, name, slug as identifier,
        target_table as target, schedule as cadence, last_run_at as activity_at,
        last_success_at as success_at,
        case
          when not is_enabled then 'inactive'
          when nullif(last_error, '') is not null then 'attention'
          when last_success_at is null then 'unobserved'
          else 'active'
        end as state,
        case when is_enabled and nullif(last_error, '') is not null then 'Last run reported an error' end as note
      from public.ingestion_sources

      union all

      select 'scraper', id::text, name, slug, target_table,
        coalesce(schedule_cron, schedule_interval_hours::text || ' hr interval'),
        last_run_at, last_success_at,
        case
          when not coalesce(is_enabled, false) then 'inactive'
          when coalesce(consecutive_failures, 0) > 0 or nullif(last_error, '') is not null then 'attention'
          when last_success_at is null then 'unobserved'
          else 'active'
        end,
        case
          when is_enabled and consecutive_failures > 0 then consecutive_failures || ' consecutive failure(s)'
          when is_enabled and nullif(last_error, '') is not null then 'Last run reported an error'
        end
      from public.scrape_sources

      union all

      select 'feed', id::text, name, null, feed_type,
        fetch_frequency || ' min interval', last_fetched_at, last_successful_fetch,
        case
          when not is_active then 'inactive'
          when auto_paused then 'paused'
          when consecutive_failures > 0 or status = 'error' or backoff_until > now() then 'attention'
          when last_successful_fetch is null then 'unobserved'
          else 'active'
        end,
        case
          when status = 'retired' then 'Retired feed'
          when is_active and auto_paused then 'Automatically paused'
          when is_active and backoff_until > now() then 'Waiting for retry after backoff'
          when is_active and consecutive_failures > 0 then consecutive_failures || ' consecutive failure(s)'
          when is_active and status = 'error' then 'Feed reported an error'
        end
      from public.news_sources

      union all

      select 'automation', id::text, name, slug, action_type,
        coalesce(cron_schedule, schedule, trigger_type), last_run_at, null,
        case
          when schedule_issue is not null then 'attention'
          when last_run_status = 'auto_paused' then 'paused'
          when not enabled then 'inactive'
          when last_run_status = 'running' then 'running'
          when last_run_status in ('error', 'partial') or consecutive_failures > 0 then 'attention'
          when last_run_status = 'success' then 'active'
          else 'unobserved'
        end,
        coalesce(schedule_issue, case last_run_status
          when 'auto_paused' then 'Automatically paused'
          when 'retired' then 'Retired automation'
          when 'error' then 'Last run failed'
          when 'partial' then 'Last run partially succeeded'
          when 'dry_run' then 'Last recorded activity was a dry run'
        end)
      from automation_jobs

      union all

      select 'cron', j.jobid::text, coalesce(j.jobname, 'Job ' || j.jobid), null,
        'pg_cron', j.schedule, null, null,
        case when j.active then 'attention' else 'inactive' end,
        'No matching automation registry entry'
      from cron.job j
      where not exists (
        select 1 from public.admin_automations a
        where coalesce(a.action->>'jobname', a.slug) = j.jobname
      )
    )
    select jsonb_build_object(
      'observed_at', now(),
      'entries', coalesce(jsonb_agg(to_jsonb(e) order by e.kind, e.name, e.id), '[]'::jsonb)
    )
    from entries e
  );
end;
$$;

revoke all on function api_private.admin_data_operations_overview() from public, anon, authenticated;
grant execute on function api_private.admin_data_operations_overview() to authenticated;

create function public.admin_data_operations_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api_private.admin_data_operations_overview();
$$;

revoke all on function public.admin_data_operations_overview() from public, anon, authenticated;
grant execute on function public.admin_data_operations_overview() to authenticated;
