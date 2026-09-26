-- The registry row added by 99991790194100 is action.type=rpc. This project’s
-- automation reconciler cannot synthesize pg_cron commands for RPC actions, so
-- the job must be scheduled explicitly. Use a corpus-sized bound: limiting the
-- upsert to 1,000 repeatedly refreshes the same pending conflicts and can leave
-- later issues permanently unqueued.

do $schedule$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'city_quality_issue_sync';

  perform cron.schedule(
    'city_quality_issue_sync',
    '20 4 * * *',
    $cron$select public.run_city_quality_issue_sync(10000);$cron$
  );
end
$schedule$;

update public.admin_automations
set schedule = '20 4 * * *',
    action = '{"type":"rpc","fn":"run_city_quality_issue_sync","args":{"p_limit":10000}}'::jsonb,
    enabled = true,
    updated_at = now()
where slug = 'city_quality_issue_sync';

do $verify$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'city_quality_issue_sync'
      and schedule = '20 4 * * *'
      and command like '%run_city_quality_issue_sync(10000)%'
  ) then
    raise exception 'city_quality_issue_sync cron was not installed with the full-drain bound';
  end if;

  if not exists (
    select 1
    from public.admin_automations
    where slug = 'city_quality_issue_sync'
      and enabled
      and action #>> '{args,p_limit}' = '10000'
  ) then
    raise exception 'city_quality_issue_sync registry metadata is incomplete';
  end if;
end
$verify$;
