-- Register before scheduling so the admin kill switch and run ledger work.
do $$
declare stage text; job_slug text; command text; cadence text;
begin
  foreach stage in array array['pending','editorial'] loop
    job_slug:='event_description_'||stage;
    cadence:=case when stage='pending' then '* * * * *' else '*/2 * * * *' end;
    command:=format($cmd$
      select net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/event-description-cleanup',
        headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
        body:=jsonb_build_object('stage',%L,'batch_size',%s),timeout_milliseconds:=60000
      ) where exists(select 1 from public.admin_automations where slug=%L and enabled);
    $cmd$,stage,case when stage='pending' then 500 else 1 end,job_slug);
    insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
      values(job_slug,'Event description '||stage,
        'Clean imported/edited event descriptions, preserve originals, and route uncertain English edits to the event-quality inbox. Bounded queue with retries and daily model budget.',
        'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
        jsonb_build_object('type','cron','jobname',job_slug,'command',command),cadence)
      on conflict(slug) do update set action=excluded.action,schedule=excluded.schedule,updated_at=now();
    perform cron.schedule(job_slug,cadence,public.admin_automation_effective_command(job_slug,command));
  end loop;
end $$;
