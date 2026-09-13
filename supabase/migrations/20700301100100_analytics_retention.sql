-- Retention for the analytics tables. There was none, anywhere.
--
-- The repo has a well-developed retention culture — 28 registered prune slugs —
-- and every one of them targets pipeline or ops bookkeeping. Not a single
-- analytics table was covered: umami.website_event, umami.session,
-- umami.event_data, user_events, signup_funnel_events, search_queries,
-- affiliate_clicks, trip_* and redirect_events are all append-only and all
-- unbounded. 20380401100000_autovacuum_tuning_high_churn_tables.sql already
-- states the rule for this shape: an append-only table generates no dead
-- tuples, so autovacuum settings cannot reclaim anything, and "the lever for it
-- is retention."
--
-- Measured on prod 2026-09-12: umami.website_event 3.07M rows / 786 MB,
-- umami.session 403k / 182 MB, the umami schema 1,248 MB of a 14 GB database,
-- growing ~40k rows/day.
--
-- BE HONEST ABOUT WHAT THIS RECOVERS TODAY: at a 90-day window it deletes
-- 393,177 website_event rows (12.8%), 1,727 sessions (0.4%) and 25,389
-- user_events rows (7.6%). Almost all the volume is RECENT, because it was
-- produced by the client-side page-view loop this series removed two commits
-- ago. Retention is not the space fix — stopping the inflow was, taking it from
-- ~40k rows/day to an estimated ~4k. Retention is what stops the table becoming
-- unbounded again, and it will not bite hard for another three months. Anyone
-- reading "retention added" as "space reclaimed" will be disappointed by the
-- numbers and should re-read this paragraph rather than lowering the window.
--
-- DELETE returns space to Postgres for reuse, not to the filesystem. That is
-- the right trade here: these tables refill daily, so reused space is used
-- space. VACUUM FULL would need ~2x the table size in temp disk on a
-- disk-constrained instance, which is exactly what we do not have.

-- ---------------------------------------------------------------------------
-- umami
-- ---------------------------------------------------------------------------

create or replace function public.prune_umami_events(
  p_older_than_days integer,
  p_limit integer default 20000
)
returns jsonb
language plpgsql
security definer
set search_path to 'umami', 'public'
as $function$
declare
  v_cutoff   timestamptz;
  v_events   integer;
  v_sessions integer;
begin
  -- Floor guard. The delete is irreversible and umami is the only record of
  -- site traffic we keep, so a fat-fingered small value must not be able to
  -- erase the working set. 30 is below any window we would deliberately choose.
  if p_older_than_days is null or p_older_than_days < 30 then
    raise exception 'p_older_than_days must be >= 30 (got %) — this delete cannot be undone',
      p_older_than_days;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200000 then
    raise exception 'p_limit must be between 1 and 200000, got %', p_limit;
  end if;

  v_cutoff := now() - make_interval(days => p_older_than_days);

  -- umami.event_data has an FK to website_event ON DELETE CASCADE, so custom
  -- event payloads go with their event and need no separate pass.
  with victims as (
    select event_id
      from umami.website_event
     where created_at < v_cutoff
     order by created_at
     limit p_limit
  )
  delete from umami.website_event e
   using victims v
   where e.event_id = v.event_id;
  get diagnostics v_events = row_count;

  -- Sessions second, and only ones with no events left. A session row is ~470
  -- bytes against an event's ~270, so leaving them behind would make the
  -- session table the larger residue. Bounded by the same p_limit: an
  -- unbounded anti-join over 400k sessions is a seq scan per run.
  with orphans as (
    select s.session_id
      from umami.session s
     where s.created_at < v_cutoff
       and not exists (
         select 1 from umami.website_event e where e.session_id = s.session_id
       )
     order by s.created_at
     limit p_limit
  )
  delete from umami.session s
   using orphans o
   where s.session_id = o.session_id;
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'ok', true,
    'cutoff', v_cutoff,
    'events_deleted', v_events,
    'sessions_deleted', v_sessions,
    -- Reported so a run that hit the cap is distinguishable from a run that
    -- finished the backlog. A capped run means the next one still has work.
    'capped', v_events >= p_limit
  );
end;
$function$;

comment on function public.prune_umami_events(integer, integer) is
  'Deletes umami.website_event older than N days (event_data cascades), then sessions left with no events. Floor guard at 30 days. Registered as admin automation umami_retention.';

revoke all on function public.prune_umami_events(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_umami_events(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- user_events
-- ---------------------------------------------------------------------------

create or replace function public.prune_user_events(
  p_older_than_days integer,
  p_limit integer default 20000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cutoff  timestamptz;
  v_deleted integer;
begin
  -- 90 days is generous for every reader this table has:
  --   recommendation-engine    reads the last 50 events for one visitor
  --   get_trending_entities    reads a 7-day window
  --   get_user_signal          reads a 30-day window
  -- so nothing here is sized by the retention window. The floor guard exists
  -- because that is easy to forget when someone later "tunes" the number.
  if p_older_than_days is null or p_older_than_days < 30 then
    raise exception 'p_older_than_days must be >= 30 (got %) — get_user_signal reads a 30-day window',
      p_older_than_days;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200000 then
    raise exception 'p_limit must be between 1 and 200000, got %', p_limit;
  end if;

  v_cutoff := now() - make_interval(days => p_older_than_days);

  with victims as (
    select id from public.user_events
     where created_at < v_cutoff
     order by created_at
     limit p_limit
  )
  delete from public.user_events u
   using victims v
   where u.id = v.id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'cutoff', v_cutoff,
    'deleted', v_deleted,
    'capped', v_deleted >= p_limit
  );
end;
$function$;

comment on function public.prune_user_events(integer, integer) is
  'Deletes public.user_events older than N days. Floor guard at 30 (get_user_signal reads a 30-day window). Registered as admin automation user_events_retention.';

revoke all on function public.prune_user_events(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_user_events(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Registry + schedule, in this same migration.
--
-- `admin_automations` is the registry of record and pg_cron is driven from it.
-- Both rows carry action.command as well as action.fn: sync_automations_to_cron
-- branch (d) can only recreate a missing job from the command, so an rpc row
-- without one is structurally unschedulable and re-enabling it later leaves it
-- on-but-unscheduled.
--
-- Times are chosen off the existing 02:00–04:00 herd: 20 2 ingestion_staging,
-- 35 2 admin_automation_runs, 45 2 admin_lifecycle_snapshot, 15 2 cron history,
-- 15 3 pipeline_errors, 35 3 review_queue.
-- ---------------------------------------------------------------------------

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  (
    'umami_retention',
    'Prune aged umami analytics rows',
    'Deletes umami.website_event (and cascaded event_data) older than 90 days, then sessions left with no events. The umami schema was 1,248 MB of a 14 GB database with no retention of any kind.',
    'system',
    true,
    '{"type":"schedule"}'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'type', 'rpc',
      'fn', 'prune_umami_events',
      'command', 'SELECT public.prune_umami_events(90, 20000);',
      'jobname', 'umami_retention'
    ),
    '55 2 * * *'
  ),
  (
    'user_events_retention',
    'Prune aged user_events rows',
    'Deletes public.user_events older than 90 days. Every reader of the table uses a window of 30 days or less.',
    'system',
    true,
    '{"type":"schedule"}'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'type', 'rpc',
      'fn', 'prune_user_events',
      'command', 'SELECT public.prune_user_events(90, 20000);',
      'jobname', 'user_events_retention'
    ),
    '5 3 * * *'
  )
on conflict (slug) do update
  set enabled     = excluded.enabled,
      action      = excluded.action,
      schedule    = excluded.schedule,
      description = excluded.description,
      updated_at  = now();

select cron.schedule('umami_retention', '55 2 * * *', 'SELECT public.prune_umami_events(90, 20000);');
select cron.schedule('user_events_retention', '5 3 * * *', 'SELECT public.prune_user_events(90, 20000);');

-- ---------------------------------------------------------------------------
-- Autovacuum. These tables were append-only and so had nothing for autovacuum
-- to reclaim; from today they have a daily bulk delete, which is exactly the
-- high-churn shape 20380401100000 tuned other tables for. Without an override
-- the default 20% dead-tuple threshold on a 3M-row table means ~600k dead rows
-- before a vacuum, i.e. the space the prune frees is not reused for weeks.
-- ---------------------------------------------------------------------------

alter table umami.website_event
  set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table umami.session
  set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
alter table public.user_events
  set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

-- ---------------------------------------------------------------------------
-- Postconditions. Registered is not scheduled and scheduled is not working —
-- this repo has lost a whole ingest engine to exactly that gap, and the Village
-- relink engine shipped with no cron at all and sat dead for months.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_missing text;
  v_floor_held boolean := false;
begin
  -- Both jobs exist in pg_cron, not merely in the registry.
  select string_agg(s, ', ') into v_missing
    from unnest(array['umami_retention','user_events_retention']) s
   where not exists (select 1 from cron.job j where j.jobname = s);
  if v_missing is not null then
    raise exception 'retention registered but NOT scheduled in pg_cron: %', v_missing;
  end if;

  -- Both registry rows are enabled and carry a command, without which
  -- sync_automations_to_cron() branch (d) could never recreate them.
  perform 1 from public.admin_automations
   where slug in ('umami_retention','user_events_retention')
     and enabled
     and coalesce(action->>'command','') <> ''
  having count(*) = 2;
  if not found then
    raise exception 'a retention registry row is disabled or has no action.command';
  end if;

  -- The floor guard actually raises. A prune function whose guard is cosmetic
  -- is worse than none: it reads as protected.
  begin
    perform public.prune_umami_events(1, 10);
  exception when others then
    v_floor_held := true;
  end;
  if not v_floor_held then
    raise exception 'prune_umami_events accepted a 1-day window — the floor guard is not working';
  end if;

  v_floor_held := false;
  begin
    perform public.prune_user_events(1, 10);
  exception when others then
    v_floor_held := true;
  end;
  if not v_floor_held then
    raise exception 'prune_user_events accepted a 1-day window — the floor guard is not working';
  end if;

  raise notice 'analytics retention registered, scheduled and floor-guarded';
end
$verify$;
