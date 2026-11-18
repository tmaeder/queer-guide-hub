-- Repeatable scheduler configuration (DML only). Apply after deploying the
-- source-gayout, pipeline-executor and pipeline-commit functions and schema.
-- start_gayout_weekly_sync atomically reuses any active run and queues its first
-- step; no credentials are stored in this cron command.
begin;
update public.pipeline_definitions p set nodes=(
  select jsonb_agg(case when n->>'type'='pipeline-deduplicate'
    then jsonb_set(n,'{data,config,batch_size}','5'::jsonb)
    when n->>'type'='pipeline-commit' then jsonb_set(n,'{data,config,batch_size}','10'::jsonb) else n end order by i)
  from jsonb_array_elements(p.nodes) with ordinality a(n,i)
) where p.name='gayout-weekly-sync';
update public.pipeline_definitions set is_enabled=true
 where name='gayout-weekly-sync';
select cron.schedule('gayout-weekly-sync','0 3 * * 1',
  $job$select public.start_gayout_weekly_sync('{"dry_run":false,"triggered_by":"cron"}'::jsonb);$job$);
commit;
