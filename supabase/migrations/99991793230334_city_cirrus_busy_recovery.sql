-- The first native v325 run exposed CirrusSearch's HTTP200 busy code and
-- preserved a genuine failure receipt, automatically pausing the identity job.
-- Its worker now applies bounded backoff to this documented transient error.
-- Resume only that exact recorded automatic cause; never reset failure history,
-- override a human disable or recover a different/unknown provider failure.
do $resume$
declare r public.admin_automations%rowtype;v_status text;v_summary jsonb;
begin
  select * into r from public.admin_automations where slug='city_qid_gap_link' for update;
  if not found then raise exception 'Native city identity automation missing';end if;
  if r.enabled or r.last_run_status is distinct from 'auto_paused' then return;end if;
  select status,summary into v_status,v_summary from public.admin_automation_runs
  where automation_slug=r.slug and finished_at is not null
  order by started_at desc,id desc limit 1;
  if v_status is distinct from 'error' or jsonb_typeof(v_summary->'requests') is distinct from 'array' then return;end if;
  if not exists(select 1 from jsonb_array_elements(v_summary->'requests') req
    where req->>'status_code'='503'
      and coalesce(req->>'body','') ~ '"source_error"[[:space:]]*:[[:space:]]*"cirrussearch-too-busy-error"') then return;end if;
  if position('/functions/v1/city-factual-backfill' in coalesce(r.action->>'command',''))=0
    or position('qid_gap' in coalesce(r.action->>'command',''))=0 then
    raise exception 'City identity recovery refuses an unexpected native command';
  end if;
  update public.admin_automations set enabled=true where id=r.id;
  perform cron.schedule(r.slug,r.schedule,
    public.admin_automation_effective_command(r.slug,r.action->>'command'));
end;
$resume$;
