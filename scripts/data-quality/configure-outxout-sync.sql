-- Operator activation, after deploying source-outxout and verifying a canary.
-- DML only. Schedule truth remains in admin_automations; do not automatically
-- replay this configuration step on every deploy.
begin;
do $$ begin
 if not exists(select 1 from public.outxout_sync_runs where scope='canary' and phase='completed' and observed>0) then
  raise exception 'verify a completed Out x Out canary before enabling schedules';
 end if;
end $$;
insert into public.ingestion_sources(name,slug,source_type,target_table,edge_function,config,schedule,is_enabled,rate_limit_per_day)
values('Out x Out','outxout','api','events','source-outxout',jsonb_build_object(
 'source_url','https://outxout.com/','target_tables',jsonb_build_array('events','venues','organizations'),
 'pipeline_name','outxout-catalogue-sync','execution_mode','durable_child_pipeline',
 'schedule_owner','admin_automations:outxout_weekly_sync','timezone','Europe/Zurich',
 'adapter_contract',jsonb_build_object('start_body','{}'::jsonb,'resume_parameter','run_id','resume_response_field','run_id','pending_response_field','continuation_pending','owns_processing',true,'dry_run',true)),null,true,5000)
on conflict(slug) do nothing;
update public.admin_automations set enabled=true,updated_at=now() where slug in('outxout_weekly_sync','outxout_sync_continue');
select cron.schedule(slug,schedule,public.admin_automation_effective_command(slug,action->>'command'))
from public.admin_automations where slug in('outxout_weekly_sync','outxout_sync_continue');
commit;
