-- One-time DML transition for verification runs made before private-ledger deployment.
begin;
with moved as (
 insert into public.admin_automation_runs(automation_id,automation_slug,started_at,finished_at,status,items_examined,items_changed,summary)
 select a.id,a.slug,r.started_at,r.completed_at,case when r.status='completed' then 'success' else 'running' end,r.items_processed,coalesce((r.context->>'approved')::integer,0),r.context||jsonb_build_object('pipeline_run_id',r.id)
 from public.pipeline_runs r cross join public.admin_automations a
 where r.pipeline_name='outxout-official-date-review' and a.slug='outxout_official_dates_weekly' and r.context?'source_cache'
 returning id,summary
)
update public.pipeline_runs r set context=jsonb_build_object('policy',m.summary->'policy','review_ledger_id',m.id,'examined',r.items_processed,'approved',0,'errors',r.items_failed),
 node_states=jsonb_build_object('official-dates',jsonb_build_object('status',r.status,'items_in',r.items_total,'items_out',r.items_processed,'completed_at',r.completed_at))
from moved m where r.id=(m.summary->>'pipeline_run_id')::uuid;
update public.admin_automation_runs set summary=summary||jsonb_build_object('ledger_id',id) where automation_slug='outxout_official_dates_weekly' and summary?'pipeline_run_id' and not summary?'ledger_id';
commit;
