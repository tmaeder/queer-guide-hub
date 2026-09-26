-- Transactional regression test for the automation operator safety contract.
-- Usage:
--   psql "$DATABASE_URL" -v admin_user_id=<uuid of an admin user> \
--     -f supabase/migrations/__tests__/automation_operations_safety.sql

\set ON_ERROR_STOP on

begin;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'user_role', 'admin')::text,
  true
);

do $$
declare
  v_prefix text := 'zz_test_automation_safety_';
  v_state jsonb;
begin
  if (public.admin_automation_maintenance_state()->>'active')::boolean then
    raise exception 'precondition failed: maintenance mode is already active';
  end if;

  insert into public.admin_automations(
    slug, name, description, managed_by, enabled, trigger, conditions, action,
    lifecycle_state, can_run_now, can_dry_run, capability_reason
  ) values
    (v_prefix || 'restore', 'Test restore', null, 'system', true,
      '{"type":"schedule"}'::jsonb, '[]'::jsonb, '{"type":"test"}'::jsonb,
      'active', false, false, 'test fixture'),
    (v_prefix || 'active', 'Test active', null, 'system', true,
      '{"type":"schedule"}'::jsonb, '[]'::jsonb, '{"type":"test"}'::jsonb,
      'active', false, false, 'test fixture'),
    (v_prefix || 'paused', 'Test paused', null, 'system', false,
      '{"type":"schedule"}'::jsonb, '[]'::jsonb, '{"type":"test"}'::jsonb,
      'paused', false, false, 'test fixture'),
    (v_prefix || 'retired', 'Test retired', '[RETIRED] test', 'system', false,
      '{"type":"schedule"}'::jsonb, '[]'::jsonb, '{"type":"test"}'::jsonb,
      'retired', false, false, 'Terminal lifecycle: retired');

  v_state := public.admin_automation_set_maintenance(true);
  if not (v_state->>'active')::boolean then
    raise exception 'enter maintenance did not return active=true';
  end if;
  if (select enabled from public.admin_automations where slug = v_prefix || 'active') then
    raise exception 'active fixture was not paused';
  end if;
  if (select enabled from public.admin_automations where slug = v_prefix || 'restore') then
    raise exception 'restore fixture was not paused';
  end if;

  begin
    perform public.admin_automation_set_enabled(v_prefix || 'retired', true);
    raise exception 'terminal lifecycle was incorrectly enabled';
  exception when sqlstate '22023' then
    null;
  end;

  -- A job deliberately paused while maintenance is active must not be restored.
  update public.admin_automations
  set lifecycle_state = 'paused'
  where slug = v_prefix || 'active';

  v_state := public.admin_automation_set_maintenance(false);
  if (v_state->>'active')::boolean then
    raise exception 'exit maintenance did not return active=false';
  end if;
  if (select enabled from public.admin_automations where slug = v_prefix || 'active') then
    raise exception 'job changed to paused during maintenance was incorrectly restored';
  end if;
  if not (select enabled from public.admin_automations where slug = v_prefix || 'restore') then
    raise exception 'captured active fixture was not restored';
  end if;
  if (select enabled from public.admin_automations where slug = v_prefix || 'paused') then
    raise exception 'pre-existing paused fixture was incorrectly restored';
  end if;
  if (select enabled from public.admin_automations where slug = v_prefix || 'retired') then
    raise exception 'retired fixture was incorrectly restored';
  end if;

  begin
    perform public.admin_automation_run(v_prefix || 'paused');
    raise exception 'unsupported paused automation was incorrectly dispatched';
  exception when sqlstate '22023' then
    null;
  end;

  raise notice 'automation-operations-safety-tests-passed';
end
$$;

rollback;
