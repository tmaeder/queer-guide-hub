-- The guarded qid job honestly surfaced partial source-read failures, rather
-- than booking HTTP200 success, and auto-paused after three failing runs.
-- Its worker now handles MediaWiki's HTTP200 API errors with bounded backoff.
-- Restore only that automatic pause. Keep the failure history until a real
-- successful run resets it; never override a human disable or alter its cadence.
do $resume$
declare r public.admin_automations%rowtype;
begin
  select * into r from public.admin_automations where slug='city_qid_gap_link' for update;
  if not found then raise exception 'Native city identity automation missing';end if;
  if r.enabled or r.last_run_status is distinct from 'auto_paused' then return;end if;
  if position('/functions/v1/city-factual-backfill' in coalesce(r.action->>'command',''))=0
    or position('qid_gap' in coalesce(r.action->>'command',''))=0 then
    raise exception 'City identity resume refuses an unexpected native command';
  end if;
  update public.admin_automations set enabled=true where id=r.id;
  perform cron.schedule(r.slug,r.schedule,
    public.admin_automation_effective_command(r.slug,r.action->>'command'));
end;
$resume$;
