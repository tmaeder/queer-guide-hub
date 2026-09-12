-- Event temporal model, part 2: the derive job, its trigger, and its sentinel.
--
-- Part 1 (20700101100000) added `events.schedule`, the pure expander and the
-- `event_dates` index. This makes the index maintain itself and reports when it
-- stops.
--
-- REBUILD, NEVER REPAIR. `event_dates.source_hash` holds the fingerprint of the rule
-- that produced the row, so "is this row stale" is a join against the parent's
-- current hash rather than a field-by-field diff. There is deliberately no code path
-- that edits a generated row: the only operations are delete-and-regenerate.
--
-- STILL NO WRITER AND NO READER. `schedule` is NULL on every row until part 3, so
-- this job is a no-op today. That is the point of landing it now -- the machinery is
-- proven and watched before anything depends on it.

-- ---------------------------------------------------------------------------
-- 1. Rebuild one event
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because the trigger below fires for whoever edits the event --
-- an admin over PostgREST is `authenticated`, and event_dates writes are
-- service_role only. Without DEFINER an editor saving a schedule would get a
-- permission error from a table they are not supposed to know about.
create or replace function public.event_dates_rebuild_one(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_event  record;
  v_hash   text;
  v_from   timestamptz;
  v_to     timestamptz;
  v_n      integer := 0;
begin
  select id, schedule, start_date, end_date
    into v_event
  from public.events
  where id = p_event_id;

  if not found then
    return 0;
  end if;

  -- A CONFIRMED row is evidence from a feed or a human. A rebuild regenerates the
  -- derived half only; wiping the whole event would silently downgrade corroborated
  -- dates back to guesses, which is the opposite of what the provenance split is for.
  delete from public.event_dates
   where event_id = p_event_id and provenance = 'generated';

  if v_event.schedule is null then
    return 0;
  end if;

  v_hash := public.event_schedule_hash(v_event.schedule);

  -- Horizon. An open-ended weekly rule expands forever without a cap; 18 months is
  -- far past any travel-planning window and keeps the whole index in the tens of
  -- thousands of rows. One day of lookback so "open today" survives any timezone.
  v_from := greatest(v_event.start_date, now() - interval '1 day');

  -- `end_date` MEANS DIFFERENT THINGS PER KIND, and reading it uniformly is wrong.
  -- For opening_hours and run it is the end of the whole span, so it caps expansion.
  -- For a recurrence it is the end of the FIRST OCCURRENCE -- a weekly meetup's row
  -- ends two hours after it starts -- so capping there yields an empty window and
  -- the series never expands. Caught by running the derive chain against a real
  -- upcoming event, which produced zero dates; the series end is `schedule.until`,
  -- which the expander already applies.
  if v_event.schedule->>'kind' = 'recurrence' then
    v_to := now() + interval '18 months';
  else
    v_to := least(coalesce(v_event.end_date, now() + interval '18 months'),
                  now() + interval '18 months');
  end if;

  if v_to < v_from then
    return 0;
  end if;

  insert into public.event_dates (event_id, open_at, close_at, day, provenance, source_hash)
  select p_event_id, d.open_at, d.close_at,
         (d.open_at at time zone coalesce(nullif(v_event.schedule->>'tz', ''), 'UTC'))::date,
         'generated', v_hash
  from public.event_schedule_dates(v_event.schedule, v_from, v_to) d
  -- A generated date must never displace a confirmed one at the same instant.
  on conflict (event_id, open_at) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke all on function public.event_dates_rebuild_one(uuid) from public, anon, authenticated;
grant execute on function public.event_dates_rebuild_one(uuid) to service_role;

comment on function public.event_dates_rebuild_one(uuid) is
  'Regenerates the GENERATED half of event_dates for one event from its schedule. Confirmed rows are preserved. Horizon-capped at 18 months.';

-- ---------------------------------------------------------------------------
-- 2. Rebuild the stale ones
-- ---------------------------------------------------------------------------

create or replace function public.run_event_dates_rebuild(p_batch integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id      uuid;
  v_events  integer := 0;
  v_rows    integer := 0;
begin
  for v_id in
    select e.id
    from public.events e
    where e.schedule is not null
      and e.duplicate_of_id is null
      and (
        -- never expanded
        not exists (select 1 from public.event_dates d
                     where d.event_id = e.id and d.provenance = 'generated')
        -- or expanded from a rule that has since changed
        or exists (select 1 from public.event_dates d
                    where d.event_id = e.id
                      and d.provenance = 'generated'
                      and d.source_hash is distinct from public.event_schedule_hash(e.schedule))
      )
    order by e.start_date
    limit greatest(coalesce(p_batch, 200), 0)
  loop
    v_rows := v_rows + public.event_dates_rebuild_one(v_id);
    v_events := v_events + 1;
  end loop;

  -- An event whose schedule was cleared leaves its generated rows behind, and the
  -- loop above cannot see it because it filters on `schedule is not null`.
  delete from public.event_dates d
   where d.provenance = 'generated'
     and not exists (select 1 from public.events e
                      where e.id = d.event_id and e.schedule is not null
                        and e.duplicate_of_id is null);

  return jsonb_build_object('events_rebuilt', v_events, 'dates_written', v_rows);
end
$$;

revoke all on function public.run_event_dates_rebuild(integer) from public, anon, authenticated;
grant execute on function public.run_event_dates_rebuild(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Rebuild on write, so an editor sees their own change
-- ---------------------------------------------------------------------------

-- Column-scoped, and that scoping is a real hazard elsewhere in this schema: an
-- `UPDATE OF` trigger fires on the columns named in the STATEMENT, not on what some
-- other BEFORE trigger wrote. Nothing derives `schedule` from another column today,
-- so it is safe here -- and this comment is the reason to re-check if that changes.
create or replace function public.events_schedule_rebuild_dates()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    if new.schedule is not null then
      perform public.event_dates_rebuild_one(new.id);
    end if;
  elsif new.schedule is distinct from old.schedule then
    perform public.event_dates_rebuild_one(new.id);
  end if;
  return null;
end
$$;

drop trigger if exists trg_events_schedule_dates on public.events;
create trigger trg_events_schedule_dates
after insert or update of schedule on public.events
for each row execute function public.events_schedule_rebuild_dates();

-- ---------------------------------------------------------------------------
-- 4. Sentinel
-- ---------------------------------------------------------------------------

-- Reports COUNTS AND CONTEXT SEPARATELY. "0 stale rows" is also true of a corpus
-- with no schedules at all and of a job that has never run, and those are three
-- different situations -- conflating them is how a dead derive job reads as a clean
-- index. `schedules_total` is the positive control for every zero below it.
--
-- The design's zero-tolerance check -- a `generated` date reaching search_documents
-- or JSON-LD -- is NOT here, because nothing indexes event_dates yet. Adding a check
-- that cannot fail would be a gate that teaches people to trust it. It lands with
-- the display layer in part 5.
create or replace function public.event_schedule_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'schedules_total',
      (select count(*) from public.events
        where schedule is not null and duplicate_of_id is null),
    'schedules_by_kind',
      coalesce((select jsonb_object_agg(kind, n) from (
        select schedule->>'kind' as kind, count(*) as n
        from public.events where schedule is not null and duplicate_of_id is null
        group by 1) k), '{}'::jsonb),
    'dates_total', (select count(*) from public.event_dates),
    'dates_generated', (select count(*) from public.event_dates where provenance = 'generated'),
    'dates_confirmed', (select count(*) from public.event_dates where provenance = 'confirmed'),

    -- HARD: the rule moved and the index did not follow.
    'stale_rows',
      (select count(*) from public.event_dates d
        join public.events e on e.id = d.event_id
       where d.provenance = 'generated'
         and d.source_hash is distinct from public.event_schedule_hash(e.schedule)),

    -- HARD: generated rows whose event no longer carries a schedule.
    'orphan_generated_rows',
      (select count(*) from public.event_dates d
        where d.provenance = 'generated'
          and not exists (select 1 from public.events e
                           where e.id = d.event_id and e.schedule is not null
                             and e.duplicate_of_id is null)),

    -- HARD: the horizon cap leaked. A day of slack absorbs clock skew.
    'beyond_horizon',
      (select count(*) from public.event_dates
        where open_at > now() + interval '18 months' + interval '1 day'),

    -- ADVISORY: a rule that says it repeats but produced nothing is either an
    -- expander bug or a rule whose window has closed. Worth a look, not a failure.
    'expandable_rules_with_no_dates',
      (select count(*) from public.events e
        where e.schedule is not null and e.duplicate_of_id is null
          and (jsonb_array_length(coalesce(e.schedule->'weekly', '[]'::jsonb)) > 0
            or jsonb_array_length(coalesce(e.schedule->'extra', '[]'::jsonb)) > 0)
          and not exists (select 1 from public.event_dates d where d.event_id = e.id)),

    'last_generated_at',
      (select max(created_at) from public.event_dates where provenance = 'generated'),
    'probe_ok', true
  );
$$;

grant execute on function public.event_schedule_signals() to service_role;

comment on function public.event_schedule_signals() is
  'Health of the schedule -> event_dates derivation. stale_rows / orphan_generated_rows / beyond_horizon are zero-invariants. schedules_total is the positive control: every zero below it is also true of an empty corpus.';

-- ---------------------------------------------------------------------------
-- 5. Schedule it
-- ---------------------------------------------------------------------------

-- `trigger` is NOT NULL with no default and `managed_by` defaults to 'user' while
-- every scheduled sibling is 'system'. Omitting either aborts the INSERT, and db
-- push wraps the file in one transaction, so that rolls back the DDL above with it.
insert into public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
values (
  'event_dates_rebuild',
  'Event dates rebuild',
  'Regenerates public.event_dates from events.schedule wherever the stored rule fingerprint no longer matches the rule.',
  '25 3 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_event_dates_rebuild',
    'command', 'SELECT public.run_event_dates_rebuild(200);',
    'jobname', 'event_dates_rebuild'
  ),
  true,
  3
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action   = excluded.action,
      enabled  = true;

-- An action->>'type'='rpc' row carries no action.command that
-- sync_automations_to_cron() branch (d) can reschedule from, so rpc automations are
-- scheduled by their own migration and re-enabling one is never enough on its own.
select cron.schedule('event_dates_rebuild', '25 3 * * *',
                     'SELECT public.run_event_dates_rebuild(200);');

-- ---------------------------------------------------------------------------
-- 6. Postconditions
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_event    uuid;
  v_sig      jsonb;
  v_n        integer;
  v_hash_old text;
  v_hash_new text;
begin
  -- Round-trip the whole chain on a real row, then put it back. A migration that
  -- installs a derive job without ever running it is how an inert job ships green.
  select id into v_event
  from public.events
  where duplicate_of_id is null and status = 'active' and start_date > now()
  order by start_date
  limit 1;

  if v_event is null then
    raise exception 'no upcoming event to verify the derive chain against';
  end if;

  update public.events
     set schedule = jsonb_build_object(
           'kind', 'recurrence', 'tz', 'UTC', 'confidence', 'authored',
           'weekly', jsonb_build_array(jsonb_build_object('day', 'MO', 'start', '19:00', 'end', '21:00')))
   where id = v_event;

  -- The trigger must have populated the index without anyone calling the job.
  select count(*) into v_n from public.event_dates where event_id = v_event;
  if v_n = 0 then
    raise exception 'the on-write trigger produced no dates -- an editor would save a schedule and see nothing';
  end if;

  -- The other direction, or the kind-split above would just swing the bug the other
  -- way: an opening_hours rule MUST still stop at its own end_date rather than
  -- running to the 18-month horizon.
  update public.events
     set schedule = jsonb_build_object(
           'kind', 'opening_hours', 'tz', 'UTC',
           'weekly', jsonb_build_array(
             jsonb_build_object('day', 'MO', 'start', '11:00', 'end', '18:00'),
             jsonb_build_object('day', 'TU', 'start', '11:00', 'end', '18:00'),
             jsonb_build_object('day', 'WE', 'start', '11:00', 'end', '18:00'),
             jsonb_build_object('day', 'TH', 'start', '11:00', 'end', '18:00'),
             jsonb_build_object('day', 'FR', 'start', '11:00', 'end', '18:00')))
   where id = v_event;

  select count(*) into v_n
  from public.event_dates d join public.events e on e.id = d.event_id
  where d.event_id = v_event and e.end_date is not null and d.open_at > e.end_date;

  if v_n > 0 then
    raise exception 'an opening_hours rule expanded % opening(s) past its own end_date', v_n;
  end if;

  update public.events
     set schedule = jsonb_build_object(
           'kind', 'recurrence', 'tz', 'UTC', 'confidence', 'authored',
           'weekly', jsonb_build_array(jsonb_build_object('day', 'MO', 'start', '19:00', 'end', '21:00')))
   where id = v_event;

  select source_hash into v_hash_old from public.event_dates where event_id = v_event limit 1;

  -- Change the rule: the fingerprint must move and the index must follow.
  update public.events
     set schedule = jsonb_set(schedule, '{weekly,0,day}', '"FR"')
   where id = v_event;

  select source_hash into v_hash_new from public.event_dates where event_id = v_event limit 1;
  if v_hash_new is null or v_hash_new = v_hash_old then
    raise exception 'the rule changed but source_hash did not -- staleness would never be detected';
  end if;

  -- Clearing the rule must clear the derived rows.
  update public.events set schedule = null where id = v_event;
  select count(*) into v_n from public.event_dates where event_id = v_event;
  if v_n <> 0 then
    raise exception 'clearing the schedule left % derived row(s) behind', v_n;
  end if;

  -- Sentinel must answer, and must answer clean on the corpus we are leaving.
  v_sig := public.event_schedule_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'event_schedule_signals did not report probe_ok';
  end if;
  if (v_sig->>'stale_rows')::int <> 0
     or (v_sig->>'orphan_generated_rows')::int <> 0
     or (v_sig->>'beyond_horizon')::int <> 0 then
    raise exception 'schedule signals are dirty on install: %', v_sig;
  end if;

  -- The cron must exist. A registry row on its own does not run anything.
  if not exists (select 1 from cron.job where jobname = 'event_dates_rebuild') then
    raise exception 'event_dates_rebuild was registered but never scheduled';
  end if;

  raise notice 'derive chain verified end to end (trigger, rehash, clear, sentinel, cron): %', v_sig;
end
$verify$;
