-- Operator-only DML registration. Deploy and run the rollback/model probes first.
-- No new tables, SQL functions or migrations. Schedules activated separately.
begin;
insert into public.pipeline_node_types(slug,category,display_name,description,icon,color,edge_function,config_schema,input_ports,output_ports)
values('outxout-official-dates','validator','Official Out x Out dates','Fixed-cohort official evidence and guarded date approval.','CalendarCheck','#8b5cf6','outxout-official-dates','{"type":"object","properties":{}}','[]','[]')
on conflict(slug) do nothing;
insert into public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,timeout_seconds,is_enabled)
values('outxout-official-date-review','Out x Out official date review','Weekly fixed-cohort official-source checks. Durable evidence, guarded date-only corrections and approval.',
 '[{"id":"official-dates","type":"outxout-official-dates","position":{"x":0,"y":0},"data":{"label":"Official date verification","config":{}}}]','[]','{}',86400,true)
on conflict(name) do nothing;
update public.pipeline_definitions set nodes='[{"id":"official-dates","type":"outxout-official-dates","position":{"x":0,"y":0},"data":{"label":"Official date verification","config":{}}}]'::jsonb
where name='outxout-official-date-review' and nodes->0->'data' is null;
insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,action,schedule,can_run_now,can_dry_run)
select slug,name,description,'system',true,jsonb_build_object('type','schedule','timezone','Europe/Zurich'),
 jsonb_build_object('type','cron','jobname',slug,'command',format($command$
select net.http_post(
 url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/outxout-official-dates',
 headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret' limit 1)),
 body:='{"mode":"%s"}'::jsonb,timeout_milliseconds:=120000)
;
$command$,mode)),schedule,true,true
from(values
 ('outxout_official_dates_weekly','Out x Out weekly official dates','Wednesday 09:00 Europe/Zurich; DST and same-week guards in worker.','weekly','true','0 7,8 * * 3'),
 ('outxout_official_dates_continue','Out x Out official-date continuation','Resume bounded official-date checks; never starts a new weekly run.','resume',$predicate$exists(select 1 from public.pipeline_runs where pipeline_name='outxout-official-date-review' and status in('running','queued') and coalesce((context->>'lease_until')::timestamptz,'-infinity')<now() and coalesce((context->>'retry_at')::timestamptz,'-infinity')<now())$predicate$,'*/5 * * * *')
)x(slug,name,description,mode,predicate,schedule)
on conflict(slug) do update set action=excluded.action,schedule=excluded.schedule;
commit;
