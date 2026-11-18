-- DML only. Run after deployment and a real, successful full source scan.
-- Reconcile only the two Pride Places jobs through the native command wrapper.
begin;
do $$
declare
  r public.prideplaces_scan_runs;
  a public.admin_automations;
  job_command text;
  run_count bigint;
  period_day date;
begin
  perform pg_advisory_xact_lock(hashtextextended('prideplaces-scan-start', 0));
  if exists (select 1 from public.prideplaces_scan_runs where status = 'running') then
    raise exception 'Finish the active Pride Places scan before activation';
  end if;
  period_day := ((now() at time zone 'UTC') - interval '3 hours')::date;
  period_day := period_day - extract(dow from period_day)::integer;
  select * into r from public.prideplaces_scan_runs
    where period = period_day order by created_at desc limit 1;
  if r.id is null or r.status <> 'completed' or r.expected_businesses is null
    or r.expected_businesses <= 0 then
    raise exception 'A real full scan must pass in the current weekly period';
  end if;
  if exists (select 1 from public.prideplaces_scan_work
    where run_id = r.id and (status <> 'done' or error is not null))
    or (select count(*) from public.prideplaces_scan_work
      where run_id = r.id and kind = 'business') <> r.expected_businesses
    or not exists (select 1 from public.prideplaces_scan_work
      where run_id = r.id and kind = 'event_index' and status = 'done') then
    raise exception 'Pride Places source coverage is incomplete';
  end if;
  select count(*) into run_count from public.prideplaces_scan_runs;
  if public.prideplaces_start_scan(false) is distinct from r.id
    or (select count(*) from public.prideplaces_scan_runs) <> run_count then
    raise exception 'Weekly source scan reuse did not preserve the completed run';
  end if;

  if (select count(*) from public.ingestion_sources where slug = 'prideplaces') <> 1
    or (select count(*) from public.pipeline_definitions where name = 'prideplaces-weekly-sync') <> 1
    or (select count(*) from public.admin_automations
      where slug in ('prideplaces_weekly_sync', 'prideplaces_scan_continue')) <> 2 then
    raise exception 'Pride Places release registration is incomplete';
  end if;
  update public.ingestion_sources set is_enabled = true, schedule = '0 3 * * 0', updated_at = now()
    where slug = 'prideplaces';
  update public.pipeline_definitions set is_enabled = true, schedule = '0 3 * * 0', updated_at = now()
    where name = 'prideplaces-weekly-sync';
  update public.admin_automations set enabled = true, lifecycle_state = 'active', updated_at = now()
    where slug in ('prideplaces_weekly_sync', 'prideplaces_scan_continue');

  for a in select * from public.admin_automations
    where slug in ('prideplaces_weekly_sync', 'prideplaces_scan_continue') loop
    if a.action->>'type' <> 'cron' or a.action->>'jobname' is distinct from a.slug
      or a.schedule is distinct from (case when a.slug = 'prideplaces_weekly_sync'
        then '0 3 * * 0' else '* * * * *' end) then
      raise exception 'Unexpected Pride Places automation configuration: %', a.slug;
    end if;
    job_command := public.admin_automation_effective_command(a.slug, a.action->>'command');
    if nullif(btrim(job_command), '') is null then
      raise exception 'Missing guarded automation command: %', a.slug;
    end if;
    perform cron.schedule(a.slug, a.schedule, job_command);
    if not exists (select 1 from cron.job j where j.jobname = a.slug
      and j.active and j.schedule = a.schedule and j.command = job_command) then
      raise exception 'Pride Places cron readback failed: %', a.slug;
    end if;
  end loop;
end $$;
commit;
