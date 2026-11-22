-- Restore mp_drain_relevance_backlog, auto-paused 2026-11-03 by statement timeouts under
-- nightly load.
--
-- It failed three runs in a row at 03:00, 03:15 and 03:30 UTC on 2026-11-03 with HTTP 500
-- "canceling statement due to statement timeout" (8 s), inside the busiest window of the
-- nightly jobs; the run before (02:45) succeeded. Measured 2026-11-22 its two queries are fast:
-- the ingestion_events daily count 2 ms, marketplace_relevance_candidates(40) 75 ms. So the
-- timeouts were contention, not this job.
--
-- Spend stays bounded: marketplace-relevance takes the tighter of the cron's daily_cap (4000)
-- and the central llm_budget row (800/day; 18 spent today), and only 1 backlog candidate is
-- waiting. Same recovery shape as 99991795370640: enable, reset the counter, recreate the cron
-- run-tracked through admin_automation_effective_command() (the nightly sync had unscheduled it).

update public.admin_automations
   set enabled = true, consecutive_failures = 0, last_run_status = 'restored', updated_at = now()
 where slug = 'mp_drain_relevance_backlog';

select cron.schedule(a.action->>'jobname', a.schedule,
                     public.admin_automation_effective_command(a.slug, a.action->>'command'))
from public.admin_automations a
where a.slug = 'mp_drain_relevance_backlog';

do $verify$
begin
  if not exists (select 1 from public.admin_automations
                  where slug = 'mp_drain_relevance_backlog' and enabled and consecutive_failures = 0) then
    raise exception 'P1 failed: mp_drain_relevance_backlog registry row not restored';
  end if;
  if not exists (select 1 from public.admin_automations a join cron.job j on j.jobname = a.action->>'jobname'
                  where a.slug = 'mp_drain_relevance_backlog' and j.active and j.schedule = a.schedule
                    and j.command ilike '%admin_automation_run_begin%'
                    and j.command ilike '%marketplace-relevance%') then
    raise exception 'P2 failed: mp_drain_relevance_backlog cron missing, inactive or untracked';
  end if;
end
$verify$;
