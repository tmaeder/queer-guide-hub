-- The postal drain now shares the entity-location worker's Photon lease.
-- Process a paced 20-record batch each minute instead of five every five
-- minutes. The worker still waits at least 1.1 seconds between requests, and
-- a busy lease skips a run rather than starting an overlapping batch.
do $$
declare
  v_command text;
begin
  select command into v_command from cron.job where jobname = 'geo_address_drain';
  if v_command is null or position('''batch_size'', 5' in v_command) = 0 then
    raise exception 'geo_address_drain command is missing or has an unexpected batch size';
  end if;

  v_command := replace(v_command, '''batch_size'', 5', '''batch_size'', 20');
  perform cron.schedule('geo_address_drain', '* * * * *', v_command);

  update public.admin_automations
     set schedule = '* * * * *',
         action = jsonb_set(action, '{command}', to_jsonb(v_command), true)
   where slug = 'geo_address_drain';
  if not found then
    raise exception 'geo_address_drain automation is missing';
  end if;
end;
$$;
