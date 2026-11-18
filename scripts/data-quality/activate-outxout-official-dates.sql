-- Activate only after successful live contract/model checks and full cohort scan.
begin;
select cron.schedule(slug,schedule,public.admin_automation_effective_command(slug,action->>'command'))
from public.admin_automations where slug in('outxout_official_dates_weekly','outxout_official_dates_continue') and enabled
and exists(select 1 from public.pipeline_runs where pipeline_name='outxout-official-date-review' and status='completed' and items_processed=21 and items_failed=0);
commit;
