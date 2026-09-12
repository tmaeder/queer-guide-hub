-- Event temporal model, part 3b: infer a schedule from what a series actually did.
--
-- A recurring meetup exists in this corpus as N flat `events` rows grouped by
-- `series_key`, materialised by whatever the feed happened to publish. siegessaeule
-- publishes a rolling window, so "Yoga for Queers" -- a weekly class -- exists as
-- three dates and then vanishes. 87 of 194 live series run dry within 90 days and
-- nothing extends them. This reads the pattern off the observed dates and stores it
-- as a rule, so the rule becomes authoritative and the feed corroborates it.
--
-- THE PRECISION BAR WAS MEASURED BEFORE THIS WAS WRITTEN, not asserted after. Each
-- candidate rule was regenerated over its own observed window and compared BOTH
-- ways -- does it reproduce every observed date, and does it invent any that were
-- never observed. The second is the one that matters; a rule that emits fifty extra
-- dates also "reproduces every observed date".
--
--   monthly   235 generated in-window, 1 never observed  -> 99.6%
--   weekly    902 generated in-window, 40 never observed -> 95.6%
--   combined  1,137 generated, 41 fabricated             -> 96.4%
--
-- CADENCE IS MEASURED, NEVER ASSUMED, and that is the whole difference between this
-- and the first draft of the analysis. A test of "same weekday, same clock, >=3
-- distinct weeks" looks like a weekly test and is not one: it passes for 155 series
-- of which only 76 are weekly and 55 are MONTHLY. Inferring weekly across that set
-- would have generated roughly four times too many dates for every monthly community
-- group in the corpus -- Trans-Treff, Bi-Gruppe, Quinky-Stammtisch.
--
-- NOTHING IS PUBLISHED. The rule is stamped confidence='inferred' and its dates are
-- provenance='generated', which the display layer (part 5) must never render as a
-- confirmed listing, give a ticket link, or emit into JSON-LD. A fabricated date that
-- sends someone to a closed venue is real-world harm, so absence of evidence is not
-- evidence.
--
-- THERE IS DELIBERATELY NO REVIEW QUEUE. The design called for one; measuring showed
-- its entire contents would be the 31 series whose cadence is NOT expressible -- a
-- "we could not work this out" pile. This repo has disabled two such queues already
-- (tag relations at ~29% precision, the prose judge at ~19%), and a queue that is
-- mostly noise teaches reviewers to rubber-stamp. The expressible 124 need no review
-- because they publish nothing; the other 31 become a worklist for the editor panel
-- in part 4, which is pull-based and cannot rot.

-- ---------------------------------------------------------------------------
-- 1. Corroboration: a generated date the feed also published is CONFIRMED
-- ---------------------------------------------------------------------------

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
  select id, schedule, start_date, end_date, series_key
    into v_event
  from public.events
  where id = p_event_id;

  if not found then
    return 0;
  end if;

  -- CLEARS BOTH PROVENANCES, which reverses part 2 deliberately. There, `confirmed`
  -- meant "corroborated by a feed or a human" and had to survive a rebuild. Here
  -- corroboration is DERIVED -- recomputed below from the sibling rows -- so a
  -- confirmed row that survived would fossilise the moment its sibling was cancelled,
  -- leaving a promise nothing backs. Nothing in event_dates is hand-authored, so
  -- everything in it is safe to rebuild.
  delete from public.event_dates where event_id = p_event_id;

  if v_event.schedule is null then
    return 0;
  end if;

  v_hash := public.event_schedule_hash(v_event.schedule);
  v_from := greatest(v_event.start_date, now() - interval '1 day');

  -- end_date is the end of the SPAN for opening_hours/run, but the end of the FIRST
  -- OCCURRENCE for a recurrence -- capping there gives a recurrence an empty window.
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
         -- CORROBORATION. The series still exists as sibling event rows the feed
         -- published; a generated date landing on one of them is not a guess, it is
         -- the feed agreeing with the rule. Marking it confirmed is what lets the
         -- display layer show it normally, and it is derived rather than sticky --
         -- recomputed on every rebuild, so a sibling being cancelled downgrades the
         -- date back to generated instead of leaving a stale promise.
         case when v_event.series_key is not null and exists (
                select 1 from public.events sib
                 where sib.series_key = v_event.series_key
                   and sib.duplicate_of_id is null
                   and sib.start_date = d.open_at
              ) then 'confirmed' else 'generated' end,
         v_hash
  from public.event_schedule_dates(v_event.schedule, v_from, v_to) d
  on conflict (event_id, open_at) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke all on function public.event_dates_rebuild_one(uuid) from public, anon, authenticated;
grant execute on function public.event_dates_rebuild_one(uuid) to service_role;

-- run_event_dates_rebuild's own orphan sweep still filters provenance='generated',
-- which would now leave corroborated orphans behind. Widened to match.
create or replace function public.run_event_dates_rebuild(p_batch integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id     uuid;
  v_events integer := 0;
  v_rows   integer := 0;
begin
  for v_id in
    select e.id
    from public.events e
    where e.schedule is not null
      and e.duplicate_of_id is null
      and (
        not exists (select 1 from public.event_dates d where d.event_id = e.id)
        or exists (select 1 from public.event_dates d
                    where d.event_id = e.id
                      and d.source_hash is distinct from public.event_schedule_hash(e.schedule))
      )
    order by e.start_date
    limit greatest(coalesce(p_batch, 200), 0)
  loop
    v_rows := v_rows + public.event_dates_rebuild_one(v_id);
    v_events := v_events + 1;
  end loop;

  delete from public.event_dates d
   where not exists (select 1 from public.events e
                      where e.id = d.event_id and e.schedule is not null
                        and e.duplicate_of_id is null);

  return jsonb_build_object('events_rebuilt', v_events, 'dates_written', v_rows);
end
$$;

revoke all on function public.run_event_dates_rebuild(integer) from public, anon, authenticated;
grant execute on function public.run_event_dates_rebuild(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The inference
-- ---------------------------------------------------------------------------

create or replace function public.infer_event_schedules(p_batch integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r            record;
  v_rule       jsonb;
  v_exceptions jsonb;
  v_weekly     integer := 0;
  v_monthly    integer := 0;
  v_fortnight  integer := 0;
  v_skipped    integer := 0;
  v_hiatus     integer := 0;
begin
  for r in
    with occ as (
      select e.series_key, e.id, e.series_next, e.start_date, e.timezone,
             (e.start_date at time zone coalesce(e.timezone, 'UTC'))::date as local_day,
             extract(isodow from (e.start_date at time zone coalesce(e.timezone, 'UTC')))::int as dow,
             to_char(e.start_date at time zone coalesce(e.timezone, 'UTC'), 'HH24:MI') as clock,
             (e.schedule is not null) as has_rule
      from public.events e
      where e.series_key is not null
        and e.duplicate_of_id is null
        and e.status = 'active'
    ),
    -- Only series where NO member already carries a rule. Re-running is then a
    -- no-op, and a human who authored a schedule by hand is never overwritten by
    -- the nightly pass.
    todo as (
      select o.series_key
      from occ o
      group by o.series_key
      having count(*) filter (where o.has_rule) = 0
    ),
    shape as (
      select o.series_key,
             count(*)                                    as n,
             count(distinct o.dow)                       as dows,
             count(distinct o.clock)                     as clocks,
             count(distinct date_trunc('week', o.local_day)) as wks,
             min(o.dow)                                  as dow,
             min(o.clock)                                as clock,
             min(o.local_day)                            as first_day,
             max(o.local_day)                            as last_day,
             coalesce(min(o.timezone), 'UTC')            as tz,
             (array_agg(o.id order by o.series_next desc, o.start_date))[1] as rep_id
      from occ o
      join todo t on t.series_key = o.series_key
      group by o.series_key
    ),
    gaps as (
      select o.series_key,
             (o.local_day - lag(o.local_day) over (partition by o.series_key order by o.local_day)) as gap
      from occ o join todo t on t.series_key = o.series_key
    ),
    cadence as (
      select series_key, percentile_disc(0.5) within group (order by gap) as med
      from gaps where gap is not null group by series_key
    ),
    nths as (
      select o.series_key,
             ((extract(day from o.local_day)::int - 1) / 7) + 1 as fwd,
             ((date_trunc('month', o.local_day) + interval '1 month' - interval '1 day')::date
                - o.local_day) < 7 as is_last
      from occ o join todo t on t.series_key = o.series_key
    ),
    pinned as (
      select series_key,
             case when bool_and(is_last) then -1
                  when count(distinct fwd) = 1 then min(fwd) end as nth
      from nths group by series_key
    )
    select s.*, c.med, p.nth
    from shape s
    join cadence c on c.series_key = s.series_key
    left join pinned p on p.series_key = s.series_key
    -- The shape gate. Anything failing it is not a candidate at all: a series on two
    -- weekdays or at two clock times is not one rule, and fewer than three distinct
    -- weeks is not a pattern.
    where s.dows = 1 and s.clocks = 1 and s.wks >= 3
    order by s.n desc
    limit greatest(coalesce(p_batch, 200), 0)
  loop
    v_rule := null;

    if r.med between 6.5 and 7.5 then
      v_rule := jsonb_build_object(
        'kind', 'recurrence', 'tz', r.tz, 'confidence', 'inferred',
        'weekly', jsonb_build_array(jsonb_build_object(
          'day', (array['MO','TU','WE','TH','FR','SA','SU'])[r.dow], 'start', r.clock)));
      v_weekly := v_weekly + 1;

    elsif r.med between 13 and 15 then
      v_rule := jsonb_build_object(
        'kind', 'recurrence', 'tz', r.tz, 'confidence', 'inferred',
        'interval_weeks', 2, 'anchor', r.first_day::text,
        'weekly', jsonb_build_array(jsonb_build_object(
          'day', (array['MO','TU','WE','TH','FR','SA','SU'])[r.dow], 'start', r.clock)));
      v_fortnight := v_fortnight + 1;

    elsif r.med between 27 and 32 and r.nth is not null then
      v_rule := jsonb_build_object(
        'kind', 'recurrence', 'tz', r.tz, 'confidence', 'inferred',
        'monthly', jsonb_build_object(
          'nth', r.nth,
          'day', (array['MO','TU','WE','TH','FR','SA','SU'])[r.dow],
          'start', r.clock));
      v_monthly := v_monthly + 1;
    end if;

    if v_rule is null then
      -- Three-weekly, drifting-monthly and sparser cadences land here. They are
      -- RECORDED so part 4's panel has a worklist, and deliberately not guessed at.
      v_skipped := v_skipped + 1;
      update public.events
         set enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
             || jsonb_build_object('schedule_inference', jsonb_build_object(
                  'state', 'not_expressible',
                  'median_gap_days', r.med,
                  'observations', r.n,
                  'at', now()))
       where id = r.rep_id;
      continue;
    end if;

    -- Exceptions: dates the rule WOULD generate inside the observed window that the
    -- feed never published. Measured, not assumed -- 40 of 902 weekly dates, and they
    -- are concentrated in 6 series that take a seasonal break rather than scattered
    -- across all of them.
    select coalesce(jsonb_agg(to_char(d.open_at at time zone r.tz, 'YYYY-MM-DD') order by d.open_at), '[]'::jsonb)
      into v_exceptions
    from public.event_schedule_dates(v_rule,
           r.first_day::timestamptz, (r.last_day + 1)::timestamptz) d
    where not exists (
      select 1 from public.events sib
       where sib.series_key = r.series_key
         and sib.duplicate_of_id is null
         and (sib.start_date at time zone coalesce(sib.timezone, 'UTC'))::date
             = (d.open_at at time zone r.tz)::date
    );

    if jsonb_array_length(v_exceptions) > 0 then
      v_rule := v_rule || jsonb_build_object('exceptions', v_exceptions);
    end if;
    -- A long unbroken run of skipped occurrences is a seasonal break, not scattered
    -- cancellations -- Heldenbar sits out five months, Queerterthur ten weeks. The
    -- exceptions above still generate the right dates, but such a series may really
    -- be two seasons and is worth a human look, so it is counted rather than hidden.
    if jsonb_array_length(v_exceptions) >= 3 then
      v_hiatus := v_hiatus + 1;
    end if;

    update public.events set schedule = v_rule where id = r.rep_id;
  end loop;

  return jsonb_build_object(
    'weekly', v_weekly, 'fortnightly', v_fortnight, 'monthly', v_monthly,
    'not_expressible', v_skipped, 'with_hiatus', v_hiatus);
end
$$;

revoke all on function public.infer_event_schedules(integer) from public, anon, authenticated;
grant execute on function public.infer_event_schedules(integer) to service_role;

comment on function public.infer_event_schedules(integer) is
  'Reads the observed dates of each series_key group and stores the pattern as an inferred schedule on the representative row. Cadence is MEASURED from the median gap, never assumed weekly. Writes confidence=inferred and generates provenance=generated dates only; nothing is published.';

-- ---------------------------------------------------------------------------
-- 3. Signals
-- ---------------------------------------------------------------------------

create or replace function public.event_schedule_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'schedules_total',
      (select count(*) from public.events where schedule is not null and duplicate_of_id is null),
    'schedules_by_kind',
      coalesce((select jsonb_object_agg(kind, n) from (
        select schedule->>'kind' as kind, count(*) as n
        from public.events where schedule is not null and duplicate_of_id is null
        group by 1) k), '{}'::jsonb),
    'schedules_by_confidence',
      coalesce((select jsonb_object_agg(conf, n) from (
        select coalesce(schedule->>'confidence','unstated') as conf, count(*) as n
        from public.events where schedule is not null and duplicate_of_id is null
        group by 1) c), '{}'::jsonb),
    'dates_total', (select count(*) from public.event_dates),
    'dates_generated', (select count(*) from public.event_dates where provenance = 'generated'),
    'dates_confirmed', (select count(*) from public.event_dates where provenance = 'confirmed'),

    'stale_rows',
      (select count(*) from public.event_dates d
        join public.events e on e.id = d.event_id
       where d.source_hash is distinct from public.event_schedule_hash(e.schedule)),
    'orphan_generated_rows',
      (select count(*) from public.event_dates d
        where not exists (select 1 from public.events e
                           where e.id = d.event_id and e.schedule is not null
                             and e.duplicate_of_id is null)),
    'beyond_horizon',
      (select count(*) from public.event_dates
        where open_at > now() + interval '18 months' + interval '1 day'),
    'expandable_rules_with_no_dates',
      (select count(*) from public.events e
        where e.schedule is not null and e.duplicate_of_id is null
          and (jsonb_array_length(coalesce(e.schedule->'weekly', '[]'::jsonb)) > 0
            or jsonb_array_length(coalesce(e.schedule->'extra', '[]'::jsonb)) > 0
            or e.schedule ? 'monthly')
          and not exists (select 1 from public.event_dates d where d.event_id = e.id)),

    -- Advisory. The worklist part 4's panel picks up, and the seasonal-break cohort.
    'not_expressible_worklist',
      (select count(*) from public.events
        where enrichment_status->'schedule_inference'->>'state' = 'not_expressible'),
    'inferred_with_hiatus',
      (select count(*) from public.events
        where schedule->>'confidence' = 'inferred'
          and jsonb_array_length(coalesce(schedule->'exceptions', '[]'::jsonb)) >= 3),

    'last_generated_at', (select max(created_at) from public.event_dates),
    'probe_ok', true
  );
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so naming service_role ADDS
-- a grantee rather than setting the list. CREATE OR REPLACE preserves the grants
-- 20760101100000 already fixed, but restating the revoke keeps the file honest about
-- what it leaves behind -- part 2 shipped this exact line without one and needed a
-- follow-up security migration.
revoke execute on function public.event_schedule_signals() from public, anon, authenticated;
grant  execute on function public.event_schedule_signals() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Schedule it
-- ---------------------------------------------------------------------------

insert into public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
values (
  'event_schedule_infer',
  'Event schedule inference',
  'Reads each series_key group''s observed dates and stores the measured cadence as an inferred schedule. Publishes nothing.',
  '15 3 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object('type', 'rpc', 'fn', 'infer_event_schedules',
                     'command', 'SELECT public.infer_event_schedules(200);',
                     'jobname', 'event_schedule_infer'),
  true,
  3
)
on conflict (slug) do update
  set schedule = excluded.schedule, action = excluded.action, enabled = true;

select cron.schedule('event_schedule_infer', '15 3 * * *',
                     'SELECT public.infer_event_schedules(200);');

-- ---------------------------------------------------------------------------
-- 5. Postconditions -- run it, then assert what it produced
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_res  jsonb;
  v_sig  jsonb;
  v_bad  integer;
begin
  v_res := public.infer_event_schedules(400);

  -- Positive control: a run that infers nothing is the state this migration exists
  -- to change, and every zero-invariant below also passes on it.
  if (v_res->>'weekly')::int + (v_res->>'monthly')::int + (v_res->>'fortnightly')::int = 0 then
    raise exception 'inference produced no rules at all: %', v_res;
  end if;

  -- Measured before writing this: 76 weekly, ~49 monthly, 15 fortnightly. Wide
  -- bounds, because the corpus moves -- this catches a collapse or a runaway, not a
  -- drift of a few series.
  if (v_res->>'weekly')::int < 40 then
    raise exception 'only % weekly rules inferred, expected ~76', v_res->>'weekly';
  end if;
  if (v_res->>'monthly')::int < 20 then
    raise exception 'only % monthly rules inferred, expected ~49', v_res->>'monthly';
  end if;

  -- Every rule must be stamped inferred. An unstamped rule is indistinguishable
  -- from one a human authored, and part 5 keys its no-publish treatment on this.
  select count(*) into v_bad
  from public.events
  where schedule is not null and coalesce(schedule->>'confidence','') = '';
  if v_bad > 0 then
    raise exception '% schedule(s) carry no confidence stamp', v_bad;
  end if;

  -- The derive chain must have run via the on-write trigger.
  v_sig := public.event_schedule_signals();
  if (v_sig->>'dates_total')::int = 0 then
    raise exception 'rules were written but no dates derived: %', v_sig;
  end if;
  if (v_sig->>'stale_rows')::int <> 0
     or (v_sig->>'orphan_generated_rows')::int <> 0
     or (v_sig->>'beyond_horizon')::int <> 0 then
    raise exception 'schedule signals dirty after inference: %', v_sig;
  end if;

  -- Corroboration must actually fire, or the provenance split is decorative: these
  -- rules were inferred FROM feed rows, so a large share of their dates coincide
  -- with one.
  if (v_sig->>'dates_confirmed')::int = 0 then
    raise exception 'no date was corroborated by its own feed rows -- the confirmed branch is dead: %', v_sig;
  end if;

  raise notice 'inference: %; signals: %', v_res, v_sig;
end
$verify$;
