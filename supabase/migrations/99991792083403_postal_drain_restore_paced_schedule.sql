-- The bounded postal worker has processed full 20-record batches at a one-minute
-- cadence in production. Keep the cron and admin registry aligned while
-- preserving any incident pause; a release must never restart a paused geocoder.
do $$
declare
  v_job record;
  v_command text;
begin
  select jobid, schedule, command, active
    into v_job
    from cron.job
   where jobname = 'geo_address_drain';

  if not found then
    raise exception 'geo_address_drain cron is missing';
  end if;

  if v_job.schedule = '* * * * *'
     and v_job.command like '%''batch_size'', 20%' then
    v_command := v_job.command;
  elsif not v_job.active and v_job.schedule = '*/15 * * * *'
     and v_job.command like '%''batch_size'', 5%' then
    v_command := replace(v_job.command, '''batch_size'', 5', '''batch_size'', 20');
    perform cron.alter_job(
      job_id := v_job.jobid,
      schedule := '* * * * *',
      command := v_command,
      active := false
    );
  else
    raise exception 'Unexpected geo_address_drain cron state; refusing schedule change';
  end if;

  update public.admin_automations
     set enabled = v_job.active,
         lifecycle_state = case when v_job.active then 'active' else 'paused' end,
         schedule = '* * * * *',
         action = jsonb_set(action, '{command}', to_jsonb(v_command), true),
         updated_at = now()
   where slug = 'geo_address_drain'
     and action->>'jobname' = 'geo_address_drain'
     and enabled = v_job.active
     and lifecycle_state = case when v_job.active then 'active' else 'paused' end;
  if not found then
    raise exception 'geo_address_drain admin automation is missing';
  end if;
end;
$$;
