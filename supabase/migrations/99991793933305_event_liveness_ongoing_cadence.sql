-- Give the seven-day freshness sweep enough capacity to include ongoing
-- series as well as upcoming events. Keep the existing request and pause state.
do $cadence$
declare
  v_jobid bigint;
  v_schedule text;
  v_old constant text := '13 2 * * *';
  v_new constant text := '13 */2 * * *';
begin
  select j.jobid, j.schedule into v_jobid, v_schedule
  from cron.job j where j.jobname = 'event_liveness_checker';
  if not found or v_schedule is distinct from v_old then return; end if;
  perform 1 from public.admin_automations
  where slug = 'event_liveness_checker' and managed_by = 'system' and schedule = v_old
  for update;
  if not found then return; end if;
  perform cron.alter_job(v_jobid, schedule := v_new);
  update public.admin_automations set schedule = v_new, updated_at = now()
  where slug = 'event_liveness_checker';
end
$cadence$;
