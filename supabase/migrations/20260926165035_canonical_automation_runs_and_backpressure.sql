-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926165035 with no repo file — the signature of
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
-- One execution, one run row. Scheduled HTTP work opens the row before pg_net
-- dispatch, semantic reporters finalize that row, and the response reaper is a
-- fallback only. The terminal transition trigger is the sole circuit-breaker
-- writer.

-- ---------------------------------------------------------------------------
-- State changes are durable and attributable.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_automation_state_events (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.admin_automations(id) on delete cascade,
  automation_slug text not null,
  happened_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'database',
  reason text,
  enabled_before boolean not null,
  enabled_after boolean not null,
  lifecycle_before text not null,
  lifecycle_after text not null
);

create index if not exists admin_automation_state_events_automation_idx
  on public.admin_automation_state_events (automation_id, happened_at desc);
create index if not exists admin_automation_state_events_actor_idx
  on public.admin_automation_state_events (actor_id)
  where actor_id is not null;

alter table public.admin_automation_state_events enable row level security;

drop policy if exists admin_automation_state_events_select
  on public.admin_automation_state_events;
create policy admin_automation_state_events_select
  on public.admin_automation_state_events for select
  to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role]));

revoke all on public.admin_automation_state_events from public, anon, authenticated;
grant select on public.admin_automation_state_events to authenticated;
grant all on public.admin_automation_state_events to service_role;

create or replace function public.admin_automation_log_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled is not distinct from new.enabled
     and old.lifecycle_state is not distinct from new.lifecycle_state then
    return new;
  end if;

  insert into public.admin_automation_state_events (
    automation_id, automation_slug, actor_id, source, reason,
    enabled_before, enabled_after, lifecycle_before, lifecycle_after
  ) values (
    new.id,
    new.slug,
    auth.uid(),
    coalesce(nullif(current_setting('app.automation_state_source', true), ''), 'database'),
    nullif(current_setting('app.automation_state_reason', true), ''),
    old.enabled,
    new.enabled,
    old.lifecycle_state,
    new.lifecycle_state
  );
  return new;
end;
$$;

drop trigger if exists admin_automation_log_state_change_trg
  on public.admin_automations;
create trigger admin_automation_log_state_change_trg
  after update of enabled, lifecycle_state on public.admin_automations
  for each row execute function public.admin_automation_log_state_change();

revoke all on function public.admin_automation_log_state_change()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Propagate the canonical run id to Edge Functions.
-- ---------------------------------------------------------------------------
create or replace function public.automation_http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_run_id text;
  v_headers jsonb;
begin
  v_run_id := nullif(current_setting('app.automation_run_id', true), '');
  v_headers := coalesce(headers, '{}'::jsonb)
    || case when v_run_id is null then '{}'::jsonb
            else jsonb_build_object('X-Automation-Run-Id', v_run_id) end;

  v_request_id := net.http_post(
    url := url,
    body := body,
    params := params,
    headers := v_headers,
    timeout_milliseconds := timeout_milliseconds
  );

  if v_run_id is not null then
    insert into public.admin_automation_run_requests (request_id, run_id, url, timeout_ms)
    values (v_request_id, v_run_id::bigint, url, coalesce(timeout_milliseconds, 5000))
    on conflict (request_id) do nothing;
  end if;

  return v_request_id;
end;
$$;

alter function public.automation_http_post(text, jsonb, jsonb, jsonb, integer) owner to postgres;
revoke all on function public.automation_http_post(text, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.automation_http_post(text, jsonb, jsonb, jsonb, integer)
  to service_role;

-- Finalize an existing scheduled run, or create one row for a direct/manual
-- internal invocation. The row lock makes retries and reaper races idempotent.
create or replace function public.admin_automation_finalize_run(
  p_slug text,
  p_status text,
  p_run_id bigint default null,
  p_started_at timestamptz default null,
  p_items_examined integer default 0,
  p_items_changed integer default 0,
  p_summary jsonb default '{}'::jsonb,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_automation_id uuid;
  v_run public.admin_automation_runs%rowtype;
  v_run_id bigint := p_run_id;
begin
  if p_status not in ('success', 'partial', 'error') then
    raise exception 'invalid automation terminal status: %', p_status using errcode = '22023';
  end if;

  select id into v_automation_id
  from public.admin_automations
  where slug = p_slug;
  if v_automation_id is null then
    raise exception 'unknown automation slug: %', p_slug using errcode = '22023';
  end if;

  if v_run_id is null then
    insert into public.admin_automation_runs (
      automation_id, automation_slug, status, started_at
    ) values (
      v_automation_id, p_slug, 'running', coalesce(p_started_at, now())
    ) returning id into v_run_id;
  end if;

  select * into v_run
  from public.admin_automation_runs
  where id = v_run_id
  for update;

  if not found then
    raise exception 'unknown automation run id: %', v_run_id using errcode = '22023';
  end if;
  if v_run.automation_slug <> p_slug or v_run.automation_id is distinct from v_automation_id then
    raise exception 'run % does not belong to automation %', v_run_id, p_slug using errcode = '22023';
  end if;
  if v_run.finished_at is not null or v_run.status <> 'running' then
    return jsonb_build_object(
      'run_id', v_run_id,
      'finalized', false,
      'already_finalized', true,
      'status', v_run.status
    );
  end if;

  update public.admin_automation_runs
  set status = p_status,
      finished_at = now(),
      items_examined = greatest(coalesce(p_items_examined, 0), 0),
      items_changed = greatest(coalesce(p_items_changed, 0), 0),
      summary = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('source', 'semantic'),
      error = case when p_status = 'error' then p_error else null end
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'finalized', true,
    'already_finalized', false,
    'status', p_status
  );
end;
$$;

alter function public.admin_automation_finalize_run(text, text, bigint, timestamptz, integer, integer, jsonb, text)
  owner to postgres;
revoke all on function public.admin_automation_finalize_run(text, text, bigint, timestamptz, integer, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_automation_finalize_run(text, text, bigint, timestamptz, integer, integer, jsonb, text)
  to service_role;

-- Compatibility helpers no longer touch the registry. The terminal transition
-- trigger below owns every counter and lifecycle change.
create or replace function public.admin_automation_record_success(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id bigint;
begin
  select id into v_run_id
  from public.admin_automation_runs
  where automation_id = p_id and status = 'running' and finished_at is null
  order by started_at desc
  limit 1;

  if v_run_id is not null then
    update public.admin_automation_runs
    set status = 'success', finished_at = now()
    where id = v_run_id and status = 'running' and finished_at is null;
  end if;
end;
$$;

create or replace function public.admin_automation_record_failure(
  p_id uuid,
  p_run_id bigint,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tripped boolean := false;
begin
  update public.admin_automation_runs
  set status = 'error', finished_at = now(), error = p_error
  where id = p_run_id
    and automation_id = p_id
    and status = 'running'
    and finished_at is null;

  select not enabled and lifecycle_state = 'auto_paused'
  into v_tripped
  from public.admin_automations
  where id = p_id;

  return coalesce(v_tripped, false);
end;
$$;

alter function public.admin_automation_record_success(uuid) owner to postgres;
alter function public.admin_automation_record_failure(uuid, bigint, text) owner to postgres;
revoke all on function public.admin_automation_record_success(uuid) from public, anon, authenticated;
revoke all on function public.admin_automation_record_failure(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.admin_automation_record_success(uuid) to service_role;
grant execute on function public.admin_automation_record_failure(uuid, bigint, text) to service_role;

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
  if new.finished_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.finished_at is not null then
    return new;
  end if;

  if new.status = 'error' then
    perform set_config('app.automation_state_source', 'circuit_breaker', true);
    perform set_config('app.automation_state_reason', coalesce(new.error, 'automation run failed'), true);

    update public.admin_automations
    set consecutive_failures = consecutive_failures + 1,
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
        last_run_at = new.finished_at,
        last_run_status = 'success'
    where id = new.automation_id;
  elsif new.status = 'partial' then
    update public.admin_automations
    set last_run_at = new.finished_at,
        last_run_status = 'partial'
    where id = new.automation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_automation_runs_after_finish_trg
  on public.admin_automation_runs;
create trigger admin_automation_runs_after_finish_trg
  before insert or update on public.admin_automation_runs
  for each row execute function public.admin_automation_runs_after_finish();

-- Attribute operator changes without relying on every future caller to write
-- a bespoke audit row.
create or replace function public.admin_automation_set_enabled(
  p_slug text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_automations%rowtype;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_row from public.admin_automations where slug = p_slug for update;
  if not found then
    raise exception 'unknown automation slug: %', p_slug using errcode = '22023';
  end if;
  if p_enabled and v_row.lifecycle_state in ('completed', 'retired', 'consolidated') then
    raise exception 'terminal automation % cannot be enabled', p_slug using errcode = '22023';
  end if;

  perform set_config('app.automation_state_source', 'admin_rpc', true);
  perform set_config(
    'app.automation_state_reason',
    case when p_enabled then 'enabled by administrator' else 'paused by administrator' end,
    true
  );

  update public.admin_automations
  set enabled = p_enabled,
      lifecycle_state = case when p_enabled then 'active' else 'paused' end,
      consecutive_failures = case when p_enabled then 0 else consecutive_failures end,
      updated_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'slug', p_slug,
    'enabled', p_enabled,
    'lifecycle_state', case when p_enabled then 'active' else 'paused' end
  );
end;
$$;

alter function public.admin_automation_set_enabled(text, boolean) owner to postgres;
revoke all on function public.admin_automation_set_enabled(text, boolean) from public, anon;
grant execute on function public.admin_automation_set_enabled(text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Search drain: claim one logical entity at a time and stop with timeout
-- headroom. No unprocessed work is deleted merely because it shared a batch.
-- ---------------------------------------------------------------------------
alter table public.search_reindex_drain_stats
  add column if not exists elapsed_ms integer not null default 0,
  add column if not exists stopped_for_budget boolean not null default false,
  add column if not exists oldest_pending_seconds integer,
  add column if not exists total_budget_stops bigint not null default 0;

create or replace function public.search_reindex_drain(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  v_started_at timestamptz := clock_timestamp();
  v_claimed integer := 0;
  v_done integer := 0;
  v_failed integer := 0;
  v_gc integer := 0;
  v_remaining integer := 0;
  v_elapsed_ms integer := 0;
  v_oldest_pending_seconds integer;
  v_stopped_for_budget boolean := false;
begin
  if not pg_try_advisory_xact_lock(hashtext('search_reindex_drain')) then
    return jsonb_build_object('skipped', true, 'reason', 'already_running');
  end if;

  loop
    exit when v_claimed >= least(greatest(coalesce(p_limit, 1), 1), 400);

    v_elapsed_ms := floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer;
    if v_elapsed_ms >= 75000 then
      v_stopped_for_budget := true;
      exit;
    end if;

    with target as (
      select entity_type, entity_id
      from public.search_reindex_queue
      order by id
      limit 1
      for update skip locked
    ), claimed as (
      delete from public.search_reindex_queue q
      using target t
      where q.entity_type = t.entity_type and q.entity_id = t.entity_id
      returning q.entity_type, q.entity_id
    )
    select entity_type, entity_id into r
    from claimed
    limit 1;

    exit when not found;
    v_claimed := v_claimed + 1;

    begin
      delete from public.search_documents
      where entity_type = r.entity_type and entity_id = r.entity_id;

      case r.entity_type
        when 'venue' then perform public.search_documents_index_venues(r.entity_id);
        when 'event' then perform public.search_documents_index_events(r.entity_id);
        when 'city' then perform public.search_documents_index_cities(r.entity_id);
        when 'country' then perform public.search_documents_index_countries(r.entity_id);
        when 'news' then perform public.search_documents_index_news(r.entity_id);
        when 'marketplace' then perform public.search_documents_index_marketplace(r.entity_id);
        when 'personality' then perform public.search_documents_index_personalities(r.entity_id);
        when 'tag' then perform public.search_documents_index_tags(r.entity_id);
        when 'queer_village' then perform public.search_documents_index_villages(r.entity_id);
        when 'group' then perform public.search_documents_index_groups(r.entity_id);
        when 'organization' then perform public.search_documents_index_organizations(r.entity_id);
        when 'milestone' then perform public.search_documents_index_milestones(r.entity_id);
        when 'guide' then perform public.search_documents_index_guides(r.entity_id);
        else null;
      end case;
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      insert into public.search_reindex_queue (entity_type, entity_id)
      values (r.entity_type, r.entity_id);
    end;
  end loop;

  delete from public.search_reindex_queue where created_at < now() - interval '7 days';
  get diagnostics v_gc = row_count;

  select count(*),
         extract(epoch from (now() - min(created_at)))::integer
  into v_remaining, v_oldest_pending_seconds
  from public.search_reindex_queue;

  v_elapsed_ms := floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer;

  insert into public.search_reindex_drain_stats as s (
    singleton, ran_at, claimed, reindexed, failed, gc, remaining,
    total_claimed, total_failed, elapsed_ms, stopped_for_budget,
    oldest_pending_seconds, total_budget_stops
  ) values (
    true, now(), v_claimed, v_done, v_failed, v_gc, v_remaining,
    v_claimed, v_failed, v_elapsed_ms, v_stopped_for_budget,
    v_oldest_pending_seconds, case when v_stopped_for_budget then 1 else 0 end
  )
  on conflict (singleton) do update
  set ran_at = excluded.ran_at,
      claimed = excluded.claimed,
      reindexed = excluded.reindexed,
      failed = excluded.failed,
      gc = excluded.gc,
      remaining = excluded.remaining,
      total_claimed = s.total_claimed + excluded.claimed,
      total_failed = s.total_failed + excluded.failed,
      elapsed_ms = excluded.elapsed_ms,
      stopped_for_budget = excluded.stopped_for_budget,
      oldest_pending_seconds = excluded.oldest_pending_seconds,
      total_budget_stops = s.total_budget_stops + excluded.total_budget_stops;

  return jsonb_build_object(
    'claimed', v_claimed,
    'reindexed', v_done,
    'failed', v_failed,
    'gc', v_gc,
    'remaining', v_remaining,
    'elapsed_ms', v_elapsed_ms,
    'stopped_for_budget', v_stopped_for_budget,
    'oldest_pending_seconds', v_oldest_pending_seconds
  );
end;
$$;

revoke execute on function public.search_reindex_drain(integer) from public, anon, authenticated;
grant execute on function public.search_reindex_drain(integer) to service_role;

comment on function public.search_reindex_drain(integer) is
  'Reindexes one logical queued entity at a time, deduplicates its queue rows, and exits after 75s so unprocessed work remains queued instead of rolling back a monolithic claim.';

-- ---------------------------------------------------------------------------
-- Projector: attach cron evidence to a self-reported SQL run before considering
-- a sampled transport row. This removes the second success row for SQL runners
-- that already own their semantic audit record.
-- ---------------------------------------------------------------------------
create or replace function public.admin_automation_project_cron_runs(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  d record;
  v_jobid bigint;
  v_is_tracked boolean;
  v_cursor bigint;
  v_errors integer := 0;
  v_successes integer := 0;
  v_linked integer := 0;
  v_rows integer := 0;
begin
  for a in
    select au.id, au.slug, au.last_cron_runid,
           coalesce(au.action->>'jobname', au.slug) as jobname
    from public.admin_automations au
    where exists (
      select 1 from cron.job j
      where j.jobname = coalesce(au.action->>'jobname', au.slug)
    )
  loop
    select jobid, command ilike '%admin\_automation\_run\_begin%'
    into v_jobid, v_is_tracked
    from cron.job where jobname = a.jobname;

    continue when v_jobid is null;
    v_cursor := a.last_cron_runid;

    for d in
      select runid, status, return_message, start_time, end_time
      from cron.job_run_details
      where jobid = v_jobid and runid > a.last_cron_runid
      order by runid
      limit p_limit
    loop
      exit when d.status not in ('succeeded', 'failed');

      if d.status = 'failed' then
        insert into public.admin_automation_runs (
          automation_id, automation_slug, status, started_at, finished_at,
          error, cron_runid, summary
        ) values (
          a.id, a.slug, 'error', coalesce(d.start_time, now()),
          coalesce(d.end_time, now()),
          left(coalesce(d.return_message, 'cron execution failed'), 4000),
          d.runid,
          jsonb_build_object('source', 'cron.job_run_details')
        )
        on conflict (cron_runid) where cron_runid is not null do nothing;
        v_errors := v_errors + 1;

      elsif not v_is_tracked then
        -- A SQL runner may already have written the semantic row. Link the
        -- cron run id to the nearest unlinked row for this execution rather
        -- than manufacturing a second success.
        with candidate as (
          select id
          from public.admin_automation_runs
          where automation_id = a.id
            and cron_runid is null
            and started_at >= coalesce(d.start_time, now()) - interval '5 seconds'
            and started_at <= coalesce(d.end_time, d.start_time, now()) + interval '5 seconds'
          order by abs(extract(epoch from (started_at - coalesce(d.start_time, now()))))
          limit 1
        )
        update public.admin_automation_runs r
        set cron_runid = d.runid,
            summary = coalesce(r.summary, '{}'::jsonb)
              || jsonb_build_object('cron_source', 'cron.job_run_details')
        from candidate c
        where r.id = c.id;

        if found then
          v_linked := v_linked + 1;
        else
          update public.admin_automations
          set last_run_at = coalesce(d.end_time, d.start_time, now()),
              last_run_status = 'success',
              consecutive_failures = 0
          where id = a.id;

          if not exists (
            select 1 from public.admin_automation_runs
            where automation_slug = a.slug
              and status = 'success'
              and started_at > coalesce(d.start_time, now()) - interval '1 hour'
              and started_at <= coalesce(d.end_time, d.start_time, now()) + interval '5 seconds'
          ) then
            insert into public.admin_automation_runs (
              automation_id, automation_slug, status, started_at, finished_at,
              cron_runid, summary
            ) values (
              a.id, a.slug, 'success', coalesce(d.start_time, now()),
              coalesce(d.end_time, now()), d.runid,
              jsonb_build_object('source', 'cron.job_run_details', 'sampled', true)
            )
            on conflict (cron_runid) where cron_runid is not null do nothing;
          end if;
          v_successes := v_successes + 1;
        end if;
      end if;

      v_cursor := d.runid;
      v_rows := v_rows + 1;
    end loop;

    if v_cursor > a.last_cron_runid then
      update public.admin_automations set last_cron_runid = v_cursor where id = a.id;
    end if;
  end loop;

  return jsonb_build_object(
    'projected', v_rows,
    'errors', v_errors,
    'successes', v_successes,
    'linked_semantic_runs', v_linked
  );
end;
$$;

alter function public.admin_automation_project_cron_runs(integer) owner to postgres;
revoke all on function public.admin_automation_project_cron_runs(integer)
  from public, anon, authenticated;
grant execute on function public.admin_automation_project_cron_runs(integer)
  to service_role;
;
