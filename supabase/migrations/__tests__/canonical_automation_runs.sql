-- Transactional regression coverage for canonical run finalization.
-- Usage: psql "$DATABASE_URL" -f supabase/migrations/__tests__/canonical_automation_runs.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_slug text := 'zz_test_canonical_run';
  v_auto uuid;
  v_run bigint;
  v_result jsonb;
  v_failures integer;
  v_enabled boolean;
  v_lifecycle text;
  v_events integer;
begin
  insert into public.admin_automations (
    slug, name, managed_by, enabled, trigger, conditions, action,
    lifecycle_state, auto_pause_threshold
  ) values (
    v_slug, 'Canonical run fixture', 'system', true,
    '{"type":"schedule"}'::jsonb, '[]'::jsonb,
    '{"type":"test","jobname":"zz_test_canonical_run"}'::jsonb,
    'active', 2
  ) returning id into v_auto;

  insert into public.admin_automation_runs (
    automation_id, automation_slug, status, started_at
  ) values (v_auto, v_slug, 'running', now())
  returning id into v_run;

  v_result := public.admin_automation_finalize_run(
    v_slug, 'error', v_run, null, 4, 0,
    '{"probe":"first"}'::jsonb, 'first failure'
  );
  if not (v_result->>'finalized')::boolean then
    raise exception 'first finalization did not win: %', v_result;
  end if;

  v_result := public.admin_automation_finalize_run(
    v_slug, 'success', v_run, null, 4, 4,
    '{"probe":"retry"}'::jsonb, null
  );
  if not (v_result->>'already_finalized')::boolean then
    raise exception 'retry was not idempotent: %', v_result;
  end if;

  select consecutive_failures into v_failures
  from public.admin_automations where id = v_auto;
  if v_failures <> 1 then
    raise exception 'one error transition counted % failures', v_failures;
  end if;

  -- Partial is observable but not evidence of recovery, so it preserves the
  -- preceding failure streak.
  v_result := public.admin_automation_finalize_run(
    v_slug, 'partial', null, now(), 0, 0,
    '{"unverifiable":true}'::jsonb, null
  );
  select consecutive_failures into v_failures
  from public.admin_automations where id = v_auto;
  if v_failures <> 1 then
    raise exception 'partial reset the failure streak to %', v_failures;
  end if;

  -- The second distinct failed execution trips the lifecycle and produces one
  -- append-only state event.
  v_result := public.admin_automation_finalize_run(
    v_slug, 'error', null, now(), 1, 0,
    '{"probe":"second"}'::jsonb, 'second failure'
  );

  select enabled, lifecycle_state, consecutive_failures
  into v_enabled, v_lifecycle, v_failures
  from public.admin_automations where id = v_auto;

  if v_enabled or v_lifecycle <> 'auto_paused' or v_failures <> 2 then
    raise exception 'auto-pause state is wrong: enabled %, lifecycle %, failures %',
      v_enabled, v_lifecycle, v_failures;
  end if;

  select count(*) into v_events
  from public.admin_automation_state_events
  where automation_id = v_auto
    and source = 'circuit_breaker'
    and lifecycle_after = 'auto_paused';
  if v_events <> 1 then
    raise exception 'expected one circuit-breaker state event, got %', v_events;
  end if;

  raise notice 'canonical-automation-run-tests-passed';
end
$$;

rollback;

