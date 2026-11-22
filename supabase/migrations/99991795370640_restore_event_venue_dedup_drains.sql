-- Restore the hourly events and venues dedup drains, auto-paused by a platform outage.
--
-- Measured 2026-11-22: ev_drain_dedup (:22) and vn_drain_dedup (:24) both auto-paused on
-- 2026-11-20 at 09:22/09:24 after three consecutive HTTP 500s. Those 500s were not theirs:
-- from ~07:20 to 09:22 UTC every edge function logged "Could not query the database for the
-- schema cache" (PostgREST outage). The nightly automation_cron_sync then unscheduled both
-- disabled rows, so the drains vanished from pg_cron. These are the ONLY two automations the
-- outage paused (checked: enabled=false, last_run_status='auto_paused', paused inside that
-- window).
--
-- Effect while paused: approved staging rows sat at dedup_status='pending', which
-- commit_*_staging_batch never takes. 49 venue rows had waited since 2026-11-20 07:39; the
-- may17 IDAHOBIT backfill (267 approved events) had to be deduplicated by hand.
-- pipeline-deduplicate itself is healthy: it ran cleanly by hand three times on 2026-11-22.
--
-- Recovery is not just enabled=true (CLAUDE.md, the 2026-08-25 outage): the cron row is gone,
-- so it is recreated here from the registry command through
-- admin_automation_effective_command(), i.e. already run-tracked. consecutive_failures is
-- reset because the three failures were the outage, not this job.

update public.admin_automations
   set enabled = true, consecutive_failures = 0, last_run_status = 'restored', updated_at = now()
 where slug in ('ev_drain_dedup', 'vn_drain_dedup');

select cron.schedule(a.action->>'jobname', a.schedule,
                     public.admin_automation_effective_command(a.slug, a.action->>'command'))
from public.admin_automations a
where a.slug in ('ev_drain_dedup', 'vn_drain_dedup');

do $verify$
declare v_bad int;
begin
  -- P1 both registry rows enabled with a counter that can trip again on a REAL failure
  select count(*) into v_bad from public.admin_automations
   where slug in ('ev_drain_dedup', 'vn_drain_dedup') and (not enabled or consecutive_failures <> 0);
  if v_bad <> 0 then
    raise exception 'P1 failed: % dedup drain registry row(s) not restored', v_bad;
  end if;
  -- P2 both crons exist, active, run-tracked, on their registered schedules
  select count(*) into v_bad
    from public.admin_automations a
   where a.slug in ('ev_drain_dedup', 'vn_drain_dedup')
     and not exists (select 1 from cron.job j
                      where j.jobname = a.action->>'jobname' and j.active and j.schedule = a.schedule
                        and j.command ilike '%admin_automation_run_begin%'
                        and j.command ilike '%pipeline-deduplicate%');
  if v_bad <> 0 then
    raise exception 'P2 failed: % dedup drain cron(s) missing, inactive or untracked', v_bad;
  end if;
end
$verify$;
