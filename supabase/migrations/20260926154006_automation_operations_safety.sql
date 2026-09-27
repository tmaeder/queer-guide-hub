-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926154006 with no repo file — the signature of
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
-- Make the admin automation console a truthful, auditable control surface.
-- Capabilities are explicit, terminal lifecycle states cannot be revived, and
-- emergency maintenance restores exactly the jobs that were active beforehand.

alter table public.admin_automations
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists can_run_now boolean not null default false,
  add column if not exists can_dry_run boolean not null default false,
  add column if not exists capability_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_automations'::regclass
      and conname = 'admin_automations_lifecycle_state_check'
  ) then
    alter table public.admin_automations
      add constraint admin_automations_lifecycle_state_check
      check (lifecycle_state in (
        'active', 'paused', 'auto_paused', 'completed', 'retired', 'consolidated'
      ));
  end if;
end
$$;

comment on column public.admin_automations.lifecycle_state is
  'Operational lifecycle. Terminal states completed/retired/consolidated cannot be re-enabled.';
comment on column public.admin_automations.can_run_now is
  'True only when admin_automation_run can prove and invoke a registered zero-argument runner.';
comment on column public.admin_automations.can_dry_run is
  'True only when admin_automation_dry_run returns a truthful, non-mutating preview.';
comment on column public.admin_automations.capability_reason is
  'Operator-facing explanation when one or more manual capabilities are unavailable.';

update public.admin_automations
set lifecycle_state = case
  when description ~* '^\s*\[CONSOLIDATED([[:space:]]|\])' then 'consolidated'
  when description ~* '^\s*\[RETIRED([[:space:]]|\])' then 'retired'
  when description ~* '^\s*\[COMPLETED([[:space:]]|\])' then 'completed'
  when last_run_status = 'auto_paused' then 'auto_paused'
  when enabled then 'active'
  else 'paused'
end;

update public.admin_automations
set enabled = false
where lifecycle_state in ('completed', 'retired', 'consolidated');

-- Preserve the last truthful dry-run implementation behind a stable adapter.
-- It supports the seventeen slugs listed below. Later features can declare a
-- dedicated action.dry_run_fn and set can_dry_run=true without editing the
-- dispatcher.
drop function if exists public.admin_automation_dry_run_legacy(text);
alter function public.admin_automation_dry_run(text)
  rename to admin_automation_dry_run_legacy;

update public.admin_automations a
set can_run_now = case
      when a.lifecycle_state in ('completed', 'retired', 'consolidated') then false
      when coalesce(a.action->>'fn', '') ~ '^run_[a-z0-9_]+$'
        then to_regprocedure(format('public.%I()', a.action->>'fn')) is not null
      when a.slug ~ '^[a-z0-9_]+$'
        then to_regprocedure(format('public.%I()', 'run_' || a.slug)) is not null
      else false
    end,
    can_dry_run = (
      a.lifecycle_state not in ('completed', 'retired', 'consolidated')
      and (
        (
          coalesce(a.action->>'dry_run_fn', '') ~ '^[a-z0-9_]+$'
          and to_regprocedure(format('public.%I()', a.action->>'dry_run_fn')) is not null
        )
        or a.slug in (
          'event_auto_archive',
          'staging_auto_reject_stale',
          'workflow_runs_purge',
          'enrichment_log_purge',
          'event_trust_recompute',
          'event_coverage_radar',
          'venue_coord_snap',
          'city_trust_recompute',
          'city_coverage_radar',
          'city_safety_backfill',
          'hotel_safety_backfill',
          'personality_trust_recompute',
          'personality_coverage_radar',
          'personality_auto_promote',
          'village_completeness_recompute',
          'village_trust_recompute',
          'village_coverage_radar'
        )
      )
    );

update public.admin_automations
set capability_reason = case
  when lifecycle_state in ('completed', 'retired', 'consolidated')
    then 'Terminal lifecycle: ' || replace(lifecycle_state, '_', ' ')
  when not can_run_now and not can_dry_run
    then 'No supported manual runner or truthful dry-run is registered'
  when not can_run_now then 'Manual run is not supported for this action type'
  when not can_dry_run then 'A truthful dry-run is not registered'
  else null
end;

create or replace function public.admin_automation_lifecycle_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('app.automation_maintenance', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not new.enabled and new.lifecycle_state = 'active' then
      new.lifecycle_state := case
        when new.last_run_status = 'auto_paused' then 'auto_paused'
        else 'paused'
      end;
    end if;
    return new;
  end if;

  if new.enabled and old.lifecycle_state in ('completed', 'retired', 'consolidated') then
    raise exception 'terminal automation % cannot be enabled', old.slug using errcode = '22023';
  end if;

  if new.enabled then
    new.lifecycle_state := 'active';
  elsif old.enabled and new.lifecycle_state not in ('completed', 'retired', 'consolidated') then
    new.lifecycle_state := case
      when new.last_run_status = 'auto_paused' then 'auto_paused'
      else 'paused'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_automation_lifecycle_guard_trg on public.admin_automations;
create trigger admin_automation_lifecycle_guard_trg
before update of enabled, last_run_status on public.admin_automations
for each row execute function public.admin_automation_lifecycle_guard();

drop trigger if exists admin_automation_lifecycle_insert_guard_trg on public.admin_automations;
create trigger admin_automation_lifecycle_insert_guard_trg
before insert on public.admin_automations
for each row execute function public.admin_automation_lifecycle_guard();

create table if not exists public.admin_automation_maintenance (
  singleton boolean primary key default true check (singleton),
  active boolean not null default false,
  generation uuid,
  entered_at timestamptz,
  entered_by uuid,
  exited_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_automation_maintenance_snapshot (
  generation uuid not null,
  automation_id uuid not null references public.admin_automations(id) on delete cascade,
  automation_slug text not null,
  captured_at timestamptz not null default now(),
  primary key (generation, automation_id)
);

alter table public.admin_automation_maintenance enable row level security;
alter table public.admin_automation_maintenance_snapshot enable row level security;
revoke all on table public.admin_automation_maintenance from public, anon, authenticated;
revoke all on table public.admin_automation_maintenance_snapshot from public, anon, authenticated;

insert into public.admin_automation_maintenance(singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.admin_automation_maintenance_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.admin_automation_maintenance%rowtype;
  v_snapshot_count integer := 0;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_state
  from public.admin_automation_maintenance
  where singleton = true;

  if v_state.generation is not null then
    select count(*) into v_snapshot_count
    from public.admin_automation_maintenance_snapshot
    where generation = v_state.generation;
  end if;

  return jsonb_build_object(
    'active', coalesce(v_state.active, false),
    'generation', v_state.generation,
    'entered_at', v_state.entered_at,
    'entered_by', v_state.entered_by,
    'snapshot_count', v_snapshot_count
  );
end;
$$;

create or replace function public.admin_automation_set_maintenance(p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.admin_automation_maintenance%rowtype;
  v_generation uuid;
  v_changed integer := 0;
  v_snapshot_count integer := 0;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_state
  from public.admin_automation_maintenance
  where singleton = true
  for update;

  if coalesce(v_state.active, false) = p_active then
    return public.admin_automation_maintenance_state()
      || jsonb_build_object('changed', 0, 'idempotent', true);
  end if;

  perform set_config('app.automation_maintenance', 'on', true);

  if p_active then
    v_generation := gen_random_uuid();

    insert into public.admin_automation_maintenance_snapshot(
      generation, automation_id, automation_slug
    )
    select v_generation, id, slug
    from public.admin_automations
    where enabled = true
      and lifecycle_state = 'active';

    get diagnostics v_snapshot_count = row_count;

    update public.admin_automations a
    set enabled = false,
        updated_at = now()
    where exists (
      select 1
      from public.admin_automation_maintenance_snapshot s
      where s.generation = v_generation
        and s.automation_id = a.id
    );

    get diagnostics v_changed = row_count;

    update public.admin_automation_maintenance
    set active = true,
        generation = v_generation,
        entered_at = now(),
        entered_by = auth.uid(),
        exited_at = null,
        updated_at = now()
    where singleton = true;
  else
    v_generation := v_state.generation;

    update public.admin_automations a
    set enabled = true,
        consecutive_failures = 0,
        updated_at = now()
    where a.lifecycle_state = 'active'
      and exists (
        select 1
        from public.admin_automation_maintenance_snapshot s
        where s.generation = v_generation
          and s.automation_id = a.id
      );

    get diagnostics v_changed = row_count;

    select count(*) into v_snapshot_count
    from public.admin_automation_maintenance_snapshot
    where generation = v_generation;

    update public.admin_automation_maintenance
    set active = false,
        exited_at = now(),
        updated_at = now()
    where singleton = true;
  end if;

  return jsonb_build_object(
    'active', p_active,
    'generation', v_generation,
    'changed', v_changed,
    'snapshot_count', v_snapshot_count,
    'idempotent', false
  );
end;
$$;

-- Backwards-compatible kill-switch wrapper. p_enabled=false enters maintenance;
-- p_enabled=true restores the captured snapshot.
create or replace function public.admin_automation_pause_all(p_enabled boolean)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.admin_automation_set_maintenance(not p_enabled);
$$;

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

  select * into v_row
  from public.admin_automations
  where slug = p_slug
  for update;

  if not found then
    raise exception 'unknown automation slug: %', p_slug using errcode = '22023';
  end if;

  if p_enabled and v_row.lifecycle_state in ('completed', 'retired', 'consolidated') then
    raise exception 'terminal automation % cannot be enabled', p_slug using errcode = '22023';
  end if;

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

create or replace function public.admin_automation_run(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_automations%rowtype;
  v_fn text;
  v_result jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_row
  from public.admin_automations
  where slug = p_slug;

  if not found then
    raise exception 'unknown automation slug: %', p_slug using errcode = '22023';
  end if;
  if not v_row.enabled or v_row.lifecycle_state <> 'active' then
    raise exception 'automation % is not active', p_slug using errcode = '22023';
  end if;
  if not v_row.can_run_now then
    raise exception 'manual run unsupported for %: %', p_slug,
      coalesce(v_row.capability_reason, 'no registered runner') using errcode = '22023';
  end if;

  v_fn := case
    when coalesce(v_row.action->>'fn', '') ~ '^run_[a-z0-9_]+$'
      then v_row.action->>'fn'
    else 'run_' || p_slug
  end;

  if v_fn !~ '^run_[a-z0-9_]+$'
     or to_regprocedure(format('public.%I()', v_fn)) is null then
    raise exception 'registered runner unavailable for %', p_slug using errcode = '22023';
  end if;

  execute format('select to_jsonb(public.%I())', v_fn) into v_result;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.admin_automation_dry_run(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_automations%rowtype;
  v_fn text;
  v_result jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_row
  from public.admin_automations
  where slug = p_slug;

  if not found then
    raise exception 'unknown automation slug: %', p_slug using errcode = '22023';
  end if;
  if v_row.lifecycle_state in ('completed', 'retired', 'consolidated') then
    raise exception 'terminal automation % cannot be previewed', p_slug using errcode = '22023';
  end if;
  if not v_row.can_dry_run then
    raise exception 'dry-run unsupported for %: %', p_slug,
      coalesce(v_row.capability_reason, 'no truthful preview registered') using errcode = '22023';
  end if;

  v_fn := v_row.action->>'dry_run_fn';
  if coalesce(v_fn, '') ~ '^[a-z0-9_]+$'
     and to_regprocedure(format('public.%I()', v_fn)) is not null then
    execute format('select to_jsonb(public.%I())', v_fn) into v_result;
    return coalesce(v_result, '{}'::jsonb);
  end if;

  return public.admin_automation_dry_run_legacy(p_slug);
end;
$$;

create or replace function public.admin_automation_dry_run_all()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_result jsonb;
  v_total integer := 0;
  v_eligible integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_per_slug jsonb := '{}'::jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select count(*) into v_skipped
  from public.admin_automations
  where enabled = true
    and lifecycle_state = 'active'
    and not can_dry_run;

  for v_rec in
    select slug
    from public.admin_automations
    where enabled = true
      and lifecycle_state = 'active'
      and can_dry_run
    order by slug
  loop
    v_eligible := v_eligible + 1;
    begin
      v_result := public.admin_automation_dry_run(v_rec.slug);
      v_per_slug := v_per_slug || jsonb_build_object(v_rec.slug, v_result);
      v_total := v_total + coalesce((v_result->>'would_change')::integer, 0);
      v_succeeded := v_succeeded + 1;
    exception when others then
      v_per_slug := v_per_slug || jsonb_build_object(
        v_rec.slug, jsonb_build_object('error', sqlerrm)
      );
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'eligible', v_eligible,
    'skipped', v_skipped,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'total_would_change', v_total,
    'per_slug', v_per_slug
  );
end;
$$;

alter function public.admin_automation_lifecycle_guard() owner to postgres;
alter function public.admin_automation_maintenance_state() owner to postgres;
alter function public.admin_automation_set_maintenance(boolean) owner to postgres;
alter function public.admin_automation_pause_all(boolean) owner to postgres;
alter function public.admin_automation_set_enabled(text, boolean) owner to postgres;
alter function public.admin_automation_run(text) owner to postgres;
alter function public.admin_automation_dry_run(text) owner to postgres;
alter function public.admin_automation_dry_run_all() owner to postgres;

revoke all on function public.admin_automation_maintenance_state() from public, anon;
revoke all on function public.admin_automation_lifecycle_guard() from public, anon, authenticated;
revoke all on function public.admin_automation_set_maintenance(boolean) from public, anon;
revoke all on function public.admin_automation_pause_all(boolean) from public, anon;
revoke all on function public.admin_automation_set_enabled(text, boolean) from public, anon;
revoke all on function public.admin_automation_run(text) from public, anon;
revoke all on function public.admin_automation_dry_run(text) from public, anon;
revoke all on function public.admin_automation_dry_run_all() from public, anon;
revoke all on function public.admin_automation_dry_run_legacy(text) from public, anon, authenticated;

grant execute on function public.admin_automation_maintenance_state() to authenticated, service_role;
grant execute on function public.admin_automation_set_maintenance(boolean) to authenticated, service_role;
grant execute on function public.admin_automation_pause_all(boolean) to authenticated, service_role;
grant execute on function public.admin_automation_set_enabled(text, boolean) to authenticated, service_role;
grant execute on function public.admin_automation_run(text) to authenticated, service_role;
grant execute on function public.admin_automation_dry_run(text) to authenticated, service_role;
grant execute on function public.admin_automation_dry_run_all() to authenticated, service_role;

comment on function public.admin_automation_set_maintenance(boolean) is
  'Admin-only maintenance gate. Pauses active jobs and restores only the captured snapshot.';
comment on function public.admin_automation_pause_all(boolean) is
  'Compatibility wrapper for the maintenance gate; true restores the snapshot and false enters maintenance.';
;
