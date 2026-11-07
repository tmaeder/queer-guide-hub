-- Adopt existing jobs in place. A snapshot or environment without these jobs
-- must not start dispatching mail, webhooks or cleanup as a result of adoption.
-- Custom-domain provisioning and DNS instruction mail are excluded until the
-- production provider, CNAME target and instruction sender are configured.
do $migration$
declare
  job record;
  last_terminal record;
  effective_command text;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  for job in
    select j.jobid, j.jobname, j.schedule, j.command, manifest.*
    from cron.job j
    join (values
      -- Fingerprints are of the reviewed commands from the source migrations.
      -- Verify before copying a command from pg_cron into a staff-visible row.
      ('event_series_source_recovery', 'Recover event series sources',
       'Restore reviewed series identity sources for matching event editions. Edition dates still require separate evidence.',
       'cebd94b605013eff17f525ec704eb0c3', false), -- 99991792964395
      ('event_source_schedule_recovery', 'Recover event source schedules',
       'Restore missing or expiring event schedules from the canonical AgendaQ calendar and flag unsupported evidence for review.',
       '1e44a14503a3192d6e0693437c5c43e0', false), -- 20261016182239
      ('guide-editorial-review-due', 'Return overdue guides to editorial review',
       'Move published non-quest guides to review once their evidence is due for rechecking.',
       '0b5885fc74ff356a2ab77a36be8394e9', false), -- 20261030223104
      ('redirect-access-notifications', 'Send redirect access notifications',
       'Deliver queued folder access request and decision emails.',
       '4dcb78af602d8a335ad03e15d3cf4499', true), -- 99991792014491
      ('redirect-native-handoff-expiry', 'Expire redirect native handoffs',
       'Delete expired native-app handoff receipts in bounded batches.',
       'f2123cd758fde55c467a303f1a997d47', false), -- 99991792095965
      ('redirect-qr-assets-cleanup', 'Clean up redirect QR assets',
       'Remove expired or replaced QR artwork through the existing storage cleanup queue.',
       '4007275a17b8d6758f02ec8ee7d8cac9', true), -- 99991792014576
      ('redirect-webhooks-dispatch', 'Dispatch redirect webhooks',
       'Deliver queued redirect events and retry eligible webhook deliveries.',
       '5fce57dec88a1bc202f919b85c404232', true) -- 99991792014604
    ) as manifest(cron_name, display_name, description, command_fingerprint, tracks_http)
      on j.jobname = manifest.cron_name
    where j.active and j.database = current_database() and j.username = current_user
      and not exists (
        select 1 from public.admin_automations a
        where a.slug = replace(j.jobname, '-', '_') or a.action->>'jobname' = j.jobname
      )
    order by j.jobname
  loop
    if md5(btrim(job.command)) is distinct from job.command_fingerprint then
      raise exception 'Reviewed command for cron job % has changed', job.jobname;
    end if;

    select r.runid, r.status, coalesce(r.end_time, r.start_time) as finished_at
      into last_terminal
    from cron.job_run_details r
    where r.jobid = job.jobid and r.status in ('succeeded', 'failed')
    order by r.runid desc limit 1;

    insert into public.admin_automations
      (slug, name, description, managed_by, enabled, trigger, schedule, action,
       last_cron_runid, last_run_at, last_run_status)
    values
      (replace(job.jobname, '-', '_'), job.display_name, job.description, 'system', true,
       jsonb_build_object('type', 'schedule'), job.schedule,
       jsonb_build_object('type', 'cron', 'jobname', job.jobname, 'command', job.command),
       coalesce(last_terminal.runid, 0),
       case when not job.tracks_http then last_terminal.finished_at end,
       case when not job.tracks_http then
         case last_terminal.status when 'succeeded' then 'success' when 'failed' then 'error' end
       end)
    on conflict (slug) do nothing;

    -- An HTTP enqueue alone is not a successful execution. Track future
    -- responses through the existing reaper. SQL jobs keep their exact command.
    if found and job.tracks_http then
      effective_command := public.admin_automation_effective_command(replace(job.jobname, '-', '_'), job.command);
      if effective_command is null
        or effective_command not like 'SELECT public.admin_automation_run_begin(%'
        or strpos(effective_command, 'public.automation_http_post(') = 0 then
        raise exception 'Could not add HTTP tracking for cron job %', job.jobname;
      end if;
      perform cron.alter_job(job.jobid, command := effective_command);
    end if;
  end loop;
end;
$migration$;
