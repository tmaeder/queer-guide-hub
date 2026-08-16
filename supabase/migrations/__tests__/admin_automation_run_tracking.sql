-- Cron-dispatched automations record their runs, and the record is keyed by
-- pg_net request id.
--
-- Run inside a transaction that is rolled back:
--   psql "$DATABASE_URL" -f supabase/migrations/__tests__/admin_automation_run_tracking.sql
--
-- Four things are proven here. The third is the one that bites.
--
-- 1. FAMILY ROUTING. admin_automation_effective_command() must wrap a command
--    that dispatches HTTP and must leave pure SQL completely alone. Wrapping
--    pure SQL costs a run row nobody can ever finalize; failing to wrap an
--    HTTP dispatcher silently drops it back into the blind spot.
--
-- 2. TOKEN SUBSTITUTION, NOT PARSING. The 74 live http commands include a DO
--    block, a `WITH … WHERE EXISTS`, and two that post twice in one statement.
--    Any wrap that has to understand the argument list breaks on all of them,
--    which is why the transform is a token replacement and why this test feeds
--    it those exact shapes.
--
-- 3. REQUEST-ID KEYING. request_id is the PRIMARY KEY of
--    admin_automation_run_requests. This is not tidiness: net._http_response
--    is shared by every pg_net caller on the instance and has no url column at
--    all, so a reaper that resolves a response by recency picks up a sibling
--    cron's answer. That exact mistake was made once during the #2795
--    verification, where a translate-i18n-batch response was read as the
--    adult-links one. A second run must not be able to claim a request that
--    already belongs to another.
--
-- 4. AUTO-PAUSE ON INSERT. The 20260523340000 trigger was BEFORE UPDATE only.
--    The projector INSERTs already-finished rows, so without an INSERT branch
--    a cron whose SQL raises every night would still never reach the counter —
--    the original bug, reintroduced through the new path.

begin;

-- ---------------------------------------------------------------------------
-- 1 + 2. Family routing over the real command shapes.
-- ---------------------------------------------------------------------------
do $$
declare
  v text;
begin
  -- Pure SQL: returned byte-identical, no prefix.
  v := public.admin_automation_effective_command('t', 'SELECT public.run_event_geo_fill(500)');
  if v <> 'SELECT public.run_event_geo_fill(500)' then
    raise exception 'pure SQL was rewritten: %', v;
  end if;

  -- Direct net.http_post: prefixed, and the call is re-pointed at the shim.
  v := public.admin_automation_effective_command('t',
        $q$select net.http_post(url := 'https://example.test/fn') as request_id;$q$);
  if v not like 'SELECT public.admin_automation_run_begin(''t'');%' then
    raise exception 'http command was not prefixed: %', v;
  end if;
  if v like '%net.http_post%' or v not like '%public.automation_http_post%' then
    raise exception 'http call was not re-pointed at the shim: %', v;
  end if;

  -- A DO block (news_verdict_geo_backfill). An expression-level wrap cannot
  -- express this at all — DO is a statement, not a scalar.
  v := public.admin_automation_effective_command('t',
        $q$DO $inner$ BEGIN PERFORM net.http_post(url := 'https://example.test/a'); END $inner$;$q$);
  if v not like 'SELECT public.admin_automation_run_begin(''t'');%DO %' then
    raise exception 'DO block was not wrapped: %', v;
  end if;

  -- Two posts in one statement (news_orphan_reclaim). Both must be re-pointed;
  -- a scalar-subquery wrap would have captured only one request id.
  v := public.admin_automation_effective_command('t',
        $q$SELECT net.http_post(url := 'https://example.test/a'), net.http_post(url := 'https://example.test/b');$q$);
  if (length(v) - length(replace(v, 'public.automation_http_post', ''))) / length('public.automation_http_post') <> 2 then
    raise exception 'expected both posts re-pointed: %', v;
  end if;

  -- A helper that posts internally, but only when it is registered as patched.
  -- enqueue_workflow is; an arbitrary function is not, and must NOT be wrapped
  -- (see the header note on false greens).
  v := public.admin_automation_effective_command('t',
        $q$SELECT public.enqueue_workflow('news-pipeline', '{}'::jsonb)$q$);
  if v not like 'SELECT public.admin_automation_run_begin(''t'');%' then
    raise exception 'tracked caller was not wrapped: %', v;
  end if;

  v := public.admin_automation_effective_command('t', $q$SELECT public.some_unpatched_helper()$q$);
  if v <> 'SELECT public.some_unpatched_helper()' then
    raise exception 'unregistered helper must not be wrapped: %', v;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. A pg_net request id belongs to exactly one run.
-- ---------------------------------------------------------------------------
do $$
declare
  v_auto uuid;
  v_run_a bigint;
  v_run_b bigint;
  v_claimed boolean := false;
begin
  insert into public.admin_automations (slug, name, managed_by, enabled, trigger, action)
  values ('zz_probe_reqkey', 'zz probe', 'system', true, '{"type":"schedule"}'::jsonb,
          '{"type":"cron"}'::jsonb)
  returning id into v_auto;

  insert into public.admin_automation_runs (automation_id, automation_slug, status)
  values (v_auto, 'zz_probe_reqkey', 'running') returning id into v_run_a;
  insert into public.admin_automation_runs (automation_id, automation_slug, status)
  values (v_auto, 'zz_probe_reqkey', 'running') returning id into v_run_b;

  insert into public.admin_automation_run_requests (request_id, run_id) values (999999901, v_run_a);

  begin
    insert into public.admin_automation_run_requests (request_id, run_id) values (999999901, v_run_b);
    v_claimed := true;
  exception when unique_violation then
    v_claimed := false;
  end;

  if v_claimed then
    raise exception 'two runs were able to claim one pg_net request id — responses can now be mis-attributed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. An INSERTed finished error row moves the counter and trips auto-pause.
-- ---------------------------------------------------------------------------
do $$
declare
  v_auto uuid;
  v_fails int;
  v_enabled boolean;
  i int;
begin
  insert into public.admin_automations
    (slug, name, managed_by, enabled, trigger, action, auto_pause_threshold)
  values ('zz_probe_autopause', 'zz probe', 'system', true, '{"type":"schedule"}'::jsonb,
          '{"type":"cron"}'::jsonb, 3)
  returning id into v_auto;

  for i in 1..3 loop
    insert into public.admin_automation_runs
      (automation_id, automation_slug, status, started_at, finished_at, error)
    values (v_auto, 'zz_probe_autopause', 'error', now(), now(), 'probe failure ' || i);
  end loop;

  select consecutive_failures, enabled into v_fails, v_enabled
  from public.admin_automations where id = v_auto;

  if v_fails <> 3 then
    raise exception 'expected consecutive_failures = 3 after three INSERTed error runs, got %', v_fails;
  end if;
  if v_enabled then
    raise exception 'auto-pause did not fire: enabled is still true at % failures', v_fails;
  end if;

  -- And a subsequent success clears it, so a flapping job does not stay paused
  -- on a stale counter once it recovers.
  update public.admin_automations set enabled = true where id = v_auto;
  insert into public.admin_automation_runs
    (automation_id, automation_slug, status, started_at, finished_at)
  values (v_auto, 'zz_probe_autopause', 'success', now(), now());

  select consecutive_failures into v_fails from public.admin_automations where id = v_auto;
  if v_fails <> 0 then
    raise exception 'a success did not reset consecutive_failures, got %', v_fails;
  end if;
end $$;

rollback;
