-- prune_ingestion_staging returns a jsonb summary and pg_cron throws it away. cron.job_run_details
-- records only 'succeeded'; admin_automation_runs gets a SAMPLED success row from the projector
-- with summary {'source','sampled'} and no counts. So "how many rows did the run actually delete"
-- was only answerable by diffing table counts against a baseline someone remembered to take --
-- and on a live pipeline that diff is contaminated by concurrent ingest.
--
-- THE OBVIOUS FIX IS WRONG AND WOULD BREAK TRACKING. Wrapping the cron command in
-- admin_automation_run_begin() -- the pattern the HTTP families use -- reclassifies this job as
-- TRACKED: admin_automation_project_cron_runs keys on `command ILIKE '%admin_automation_run_begin%'`
-- and its success branch is `ELSIF NOT v_is_tracked`. The projector would stand down and defer the
-- verdict to admin_automation_reap_runs, which resolves runs by joining net._http_response BY
-- REQUEST ID. This job makes no HTTP request, so no request would ever resolve it: the run row
-- would sit 'running' forever, last_run_status would stop updating and consecutive_failures would
-- never move. Tracking would get worse, not better.
--
-- Writing a second admin_automation_runs row directly is the other trap: the projector already
-- writes one per execution, and two writers on that table is exactly what double-counted failures
-- and auto-paused admin_automation_reap (see 20260816113024). The projector's insert dedupes on
-- cron_runid, which a caller cannot know from inside the job.
--
-- So the log stays OUT of the automation tables entirely. One append-only row per run, ~1/day.
-- The projector keeps owning liveness (did it run, did it fail); this owns the payload (what did
-- it do). Neither can corrupt the other.

create table if not exists public.ingestion_staging_retention_log (
  id              bigserial primary key,
  ran_at          timestamptz not null default now(),
  older_than_days integer     not null,
  cutoff          timestamptz not null,
  deleted         integer     not null,
  events_cascaded integer     not null,
  audit_cascaded  integer     not null,
  remaining       integer     not null,
  duration_ms     integer     not null
);

alter table public.ingestion_staging_retention_log enable row level security;
revoke all on public.ingestion_staging_retention_log from anon, authenticated;
revoke all on sequence public.ingestion_staging_retention_log_id_seq from anon, authenticated;

comment on table public.ingestion_staging_retention_log is
  'One row per prune_ingestion_staging run. Deliberately NOT admin_automation_runs: adding a second '
  'writer there double-counts failures (20260816113024), and using admin_automation_run_begin would '
  'mark this job "tracked", making the projector defer to the pg_net reaper which can never resolve '
  'a job that sends no HTTP request.';

create or replace function public.prune_ingestion_staging(
  p_older_than_days integer,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids       uuid[];
  v_deleted   integer;
  v_events    integer;
  v_audit     integer;
  v_remaining integer;
  v_cutoff    timestamptz;
  v_t0        timestamptz := clock_timestamp();
begin
  if p_older_than_days is null or p_older_than_days < 30 then
    raise exception 'p_older_than_days must be >= 30 (got %) -- the delete cascades and cannot be undone', p_older_than_days;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50000 then
    raise exception 'p_limit must be between 1 and 50000, got %', p_limit;
  end if;

  v_cutoff := now() - (p_older_than_days || ' days')::interval;

  -- Victims are captured as ids FIRST so the cascade can be counted against exactly the set that
  -- is about to be deleted. Re-running the predicate after the delete would measure a different
  -- set (ingest is concurrent), and counting after the fact is impossible -- the rows are gone.
  select array_agg(id) into v_ids
  from (
    select id from public.ingestion_staging
     where disposition is distinct from 'pending'
       and created_at < v_cutoff
     order by created_at
     limit p_limit
  ) t;

  if v_ids is null then
    v_ids := '{}'::uuid[];
  end if;

  select count(*) into v_events from public.ingestion_events where staging_id = any(v_ids);
  select count(*) into v_audit  from public.enrichment_audit  where staging_id = any(v_ids);

  delete from public.ingestion_staging where id = any(v_ids);
  get diagnostics v_deleted = row_count;

  select count(*) into v_remaining
  from public.ingestion_staging
  where disposition is distinct from 'pending' and created_at < v_cutoff;

  insert into public.ingestion_staging_retention_log
    (older_than_days, cutoff, deleted, events_cascaded, audit_cascaded, remaining, duration_ms)
  values
    (p_older_than_days, v_cutoff, v_deleted, v_events, v_audit, v_remaining,
     (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer);

  return jsonb_build_object(
    'deleted',         v_deleted,
    'events_cascaded', v_events,
    'audit_cascaded',  v_audit,
    'cutoff',          v_cutoff,
    'older_than_days', p_older_than_days,
    'remaining',       v_remaining
  );
end $function$;

revoke all on function public.prune_ingestion_staging(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_ingestion_staging(integer, integer) to service_role;

do $$
begin
  -- The floor guard must still fire. It is the only thing standing between a typo and an
  -- irreversible cascade across six FKs.
  begin
    perform public.prune_ingestion_staging(1, 1);
    raise exception 'floor guard did not fire for p_older_than_days=1';
  exception when others then
    if position('must be >= 30' in sqlerrm) = 0 then raise; end if;
  end;

  if has_table_privilege('anon', 'public.ingestion_staging_retention_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.ingestion_staging_retention_log', 'SELECT') then
    raise exception 'retention log is readable by an API role';
  end if;

  -- Asserted, not assumed: if someone later wraps the command, the projector stops recording
  -- success for this job and liveness tracking silently dies.
  if exists (
    select 1 from cron.job
    where jobname = 'ingestion_staging_retention'
      and command ilike '%admin\_automation\_run\_begin%'
  ) then
    raise exception 'cron command was wrapped in admin_automation_run_begin -- the pg_net reaper can never resolve this job, see header';
  end if;
end $$;
