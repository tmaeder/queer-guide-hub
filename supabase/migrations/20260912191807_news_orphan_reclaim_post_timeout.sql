-- Follow-up to 20260912174631. Fixing the 401 revealed a second defect in the
-- same command that the 401 had been masking.
--
-- First real run after the header fix (cron runid 1960671, 2026-08-19 17:12):
--
--   pipeline-enrich-news     -> 200 {"success":true,"items":0,"message":"nothing to enrich"}
--   pipeline-quality-enhance -> timed_out, "Timeout of 5000 ms reached.
--                               Total time: 5010ms (DNS time: 5010ms)"
--
-- The command sets no `timeout_milliseconds`, so both posts inherit pg_net's
-- 5s default — and 5s is a connection budget, not an invocation budget. The
-- whole 5,010 ms here went to DNS on a cold pool; the function itself never
-- got a chance to answer. It very likely ran to completion server-side, which
-- is exactly why this is scored 'partial' and not 'error': pg_net gave up
-- client-side, the work was not necessarily lost, and `consecutive_failures`
-- is deliberately left untouched so an unverifiable job cannot auto-pause.
--
-- But 'partial' forever is its own failure mode — the run is recorded and
-- permanently unverifiable, which is the state this project keeps rediscovering
-- the hard way. `admin_automation_reap_runs` says so in the error text it
-- generated here: "outcome unknown, raise timeout_milliseconds". Raising it
-- converts a genuine hang into a countable failure instead of an unknown.
--
-- 60s matches the shortest explicit budget already in the registry (26 other
-- http-posting crons set one; the range is 55s-150s).
--
-- SCOPE: this fixes ONE command. Nineteen other ENABLED http-posting crons also
-- omit `timeout_milliseconds` and inherit the same 5s default, `workflow_
-- dispatcher_1min` among them — the reaper's own source comment already records
-- that job losing 2 of 41 requests this way. That sweep is deliberately NOT
-- bundled here: it touches a core every-minute job and deserves its own change.

do $$
declare
  v_old text;
  v_new text;
begin
  select action->>'command' into v_old
  from public.admin_automations where slug = 'news_orphan_reclaim';

  if v_old is null then
    raise exception 'news_orphan_reclaim has no registry command — refusing to guess';
  end if;

  if v_old like '%timeout_milliseconds%' then
    return;   -- already budgeted; nothing to do
  end if;

  -- Both posts end `body := '...'::jsonb)`. Append the budget to each.
  v_new := replace(v_old, '}''::jsonb)', '}''::jsonb, timeout_milliseconds := 60000)');

  if v_new = v_old then
    raise exception 'news_orphan_reclaim command did not match the expected post shape — inspect it by hand';
  end if;

  update public.admin_automations
  set action = jsonb_set(action, '{command}', to_jsonb(v_new))
  where slug = 'news_orphan_reclaim';
end $$;

-- Re-schedule from the registry through the same wrapper the reconciler uses,
-- so the live job picks the new budget up now rather than on the next drift pass.
do $$
declare
  v_jobname text;
  v_cmd     text;
  v_sched   text;
begin
  select coalesce(a.action->>'jobname', a.slug),
         public.admin_automation_effective_command(a.slug, a.action->>'command'),
         a.schedule
  into v_jobname, v_cmd, v_sched
  from public.admin_automations a where a.slug = 'news_orphan_reclaim';

  if exists (select 1 from cron.job where jobname = v_jobname) then
    perform cron.unschedule(v_jobname);
  end if;
  perform cron.schedule(v_jobname, v_sched, v_cmd);
end $$;
