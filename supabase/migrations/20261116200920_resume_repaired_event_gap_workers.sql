-- Both workers auto-paused on 2026-11-07 after HTTP 500 responses. The newer
-- deployed worker has now completed authenticated dry and real requests, including
-- a historical original-artwork repair. Restore only auto-pauses, never manual,
-- terminal or consolidated states. The ordinary failure auto-pause remains active.
do $migration$
declare a public.admin_automations; command text; cadence text;
begin
 perform set_config('app.automation_state_source','migration',true);
 perform set_config('app.automation_state_reason',
  'Machine repair: current worker passed authenticated production requests; restore auto-paused event gap processing. No human verification asserted.',true);
 for a in select * from public.admin_automations
  where slug in('event_image_backfill','event_agentic_enrich')
   and not enabled and lifecycle_state='auto_paused' and last_run_status='auto_paused'
  for update
 loop
  command:=a.action->>'command';
  if a.action->>'type'<>'cron' or nullif(command,'') is null
   or position('/functions/v1/'||replace(a.slug,'_','-') in command)=0 then
   raise exception 'Unexpected stored event gap command: %',a.slug;end if;
  if exists(select from cron.job where jobname=a.slug) then
   raise exception 'Auto-paused event gap worker still has a cron job: %',a.slug;end if;
  -- Image recovery spends no AI budget. Twelve every five minutes stays below
  -- the existing image auditor's 25/5min capacity, with 5min event leases and
  -- retry backoff unchanged. Content retains its 60/day ledger and cadence.
  cadence:=case when a.slug='event_image_backfill' then '3-59/5 * * * *' else a.schedule end;
  perform cron.schedule(a.slug,cadence,command);
  update public.admin_automations set enabled=true,lifecycle_state='active',
   consecutive_failures=0,consecutive_partials=0,schedule=cadence,updated_at=now(),
   description=case when a.slug='event_image_backfill'
    then 'Every five minutes: up to 12 source-owned artwork repairs, upcoming events first, eligible historical thumbnails afterward; no AI spend, bounded requests, leases and retry backoff.'
    else description end where id=a.id;
 end loop;
end $migration$;
