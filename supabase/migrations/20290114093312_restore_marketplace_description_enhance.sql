-- Re-enable `marketplace_description_enhance`, auto-paused by a transient blip
-- and then left off after it had already recovered.
--
-- WHY THIS IS A RESTORE AND NOT A RE-LITIGATION OF A RETIREMENT.
-- Auto-pause is a one-way door and it erases its own evidence: the success
-- branch of `admin_automation_runs_after_finish()` resets `consecutive_failures`
-- to 0 and `last_run_status` to 'success' but never re-enables, so a falsely
-- paused row ends up reading exactly like a deliberate human retirement. The
-- only durable record is `summary.auto_paused` on the historical run row.
-- Measured on prod 2026-09-05:
--
--   2026-09-04 22:30  error  auto_paused null   "1 of 1 request(s) failed"
--   2026-09-04 22:35  error  auto_paused null   "1 of 1 request(s) failed"
--   2026-09-04 22:40  error  auto_paused TRUE   <- auto_pause_threshold 3 reached
--   2026-09-04 22:45  error  auto_paused TRUE
--   2026-09-05 04:15 .. 05:10   twelve consecutive SUCCESSES, five minutes apart
--
-- So it failed four times, tripped the threshold, and then recovered completely
-- — pg_cron kept firing because auto-pause does not unschedule. It ran healthily
-- until 05:10, which is `automation_cron_sync` (`10 5 * * *`); that pass
-- unscheduled it, because branch (b) unschedules any job whose registry row is
-- disabled. Hence `cron.job` held 0 rows for it when this was written.
--
-- NOT a retirement: no migration has ever disabled this row. The only three that
-- mention the slug are 20260619142124 (creates the cron), 20260817090000
-- (llm_budget) and 20260822141226 (marketplace_quality_ops). The disable came
-- solely from the auto-pause trigger.
--
-- COST IS ALREADY BOUNDED, which is what makes re-enabling safe. CLAUDE.md
-- records that this function once ran the 70B model on a */5 cron uncapped; it
-- is now 8B behind `llm_budget`, and prod reads
--   caller_key='marketplace-description-enhance', daily_cap=500, spent_today=480
-- so the cap is live and enforcing. Re-enabling cannot reopen that hole.
--
-- WHY sync_automations_to_cron RATHER THAN A HAND-WRITTEN cron.schedule:
-- `action.command` deliberately holds the plain, readable SQL, and the
-- run-tracking wrapper (`admin_automation_run_begin` + `automation_http_post`)
-- is DERIVED by `admin_automation_effective_command()` and applied by the sync.
-- Scheduling the raw command here would produce a job with no run bookkeeping —
-- which is the very mechanism that makes auto-pause work at all. The assertion
-- below checks the scheduled command is the WRAPPED form for exactly that
-- reason.
--
-- This row is `action->>'type' = 'cron'` and carries `action.command`, so
-- branch (d) can genuinely recreate it. An `rpc`-type row carries no command and
-- structurally CANNOT be rescheduled this way — re-enabling one leaves it
-- on-but-unscheduled. That is asserted rather than assumed, because "read the
-- `recreated` list instead of assuming it worked" is the documented lesson from
-- the 40-hour outage.
--
-- Rehearsed on prod in a rolled-back transaction before committing: the UPDATE
-- plus the sync produced enabled=true and exactly 1 wrapped cron job, and a
-- re-read after ROLLBACK confirmed enabled=false / 0 jobs again, with the
-- sibling `marketplace_image_mirror` job untouched.

update public.admin_automations
set enabled = true,
    consecutive_failures = 0,
    updated_at = now()
where slug = 'marketplace_description_enhance'
  and not enabled;

-- Reconciles the registry into pg_cron. This is the same operation the nightly
-- 05:10 job performs, run now.
select public.sync_automations_to_cron(true);

do $$
declare
  v_enabled boolean;
  v_type    text;
  v_jobs    int;
  v_cmd     text;
begin
  select enabled, action->>'type' into v_enabled, v_type
    from public.admin_automations where slug = 'marketplace_description_enhance';

  if v_enabled is null then
    raise exception 'admin_automations row marketplace_description_enhance is missing';
  end if;
  if not v_enabled then
    raise exception 'marketplace_description_enhance is still disabled after the update';
  end if;
  if v_type is distinct from 'cron' then
    raise exception 'action.type is % — an rpc row cannot be rescheduled by the reconciler '
                    'and needs its original migration replayed instead', v_type;
  end if;

  select count(*), max(command) into v_jobs, v_cmd
    from cron.job where jobname = 'marketplace_description_enhance';

  if v_jobs <> 1 then
    raise exception 'expected exactly 1 cron job named marketplace_description_enhance, found % '
                    '— the reconciler did not recreate it; check sync_automations_to_cron''s '
                    'recreated list', v_jobs;
  end if;

  -- An unwrapped job runs but records nothing, so consecutive_failures never
  -- moves and auto-pause silently stops protecting this automation.
  if position('admin_automation_run_begin' in coalesce(v_cmd, '')) = 0 then
    raise exception 'cron job marketplace_description_enhance is scheduled UNWRAPPED — it would '
                    'run without run tracking, leaving auto-pause blind';
  end if;
end $$;
