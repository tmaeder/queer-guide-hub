-- The inference worklist was blind to the series most worth a human's time.
--
-- `infer_event_schedules` filtered on the SHAPE GATE in the SQL `where` clause:
--
--     where s.dows = 1 and s.clocks = 1 and s.wks >= 3
--
-- so a series on two weekdays, or at two clock times, never entered the loop at all
-- and could never reach the `not_expressible` stamp inside it. Measured on prod
-- immediately after 20800213094613 applied:
--
--     live series                 192
--     pass the shape gate         154
--       -> got a rule             139
--       -> stamped worklist        15
--     FAIL the shape gate          38   <- stamped nothing, invisible
--
-- Those 38 are the interesting ones. They are where the three genuinely different
-- shapes hide and where structure alone cannot choose between them: a library open
-- Mon/Wed/Fri (opening_hours), a drag night on Fri+Sat (a recurrence with two
-- weekdays), and a theatre run that simply ends. An editor panel fed by this worklist
-- would have shown 15 of 53 and looked complete.
--
-- The gate moves INTO the loop, so every series is dispositioned and says which way.
-- Nothing about the rules already written changes: the same shape still has to hold
-- before a cadence is inferred, and this migration writes no schedule.

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
  v_reason     text;
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
    todo as (
      select o.series_key
      from occ o
      group by o.series_key
      having count(*) filter (where o.has_rule) = 0
    ),
    shape as (
      select o.series_key,
             count(*)                                        as n,
             count(distinct o.dow)                           as dows,
             count(distinct o.clock)                         as clocks,
             count(distinct date_trunc('week', o.local_day)) as wks,
             min(o.dow)                                      as dow,
             min(o.clock)                                    as clock,
             min(o.local_day)                                as first_day,
             max(o.local_day)                                as last_day,
             coalesce(min(o.timezone), 'UTC')                as tz,
             (array_agg(o.id order by o.series_next desc, o.start_date))[1] as rep_id
      from occ o join todo t on t.series_key = o.series_key
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
    -- NO SHAPE GATE HERE. It moved into the loop so a series that fails it is
    -- dispositioned with a reason instead of vanishing. Ordering puts the biggest
    -- series first so a truncated batch still covers the ones a reader meets.
    order by s.n desc
    limit greatest(coalesce(p_batch, 200), 0)
  loop
    v_rule   := null;
    v_reason := null;

    -- The shape gate, now stated as a disposition rather than a filter. Each arm is
    -- a different question for a human, so they are distinct reasons rather than one
    -- catch-all: a two-weekday series may be opening hours OR a real recurrence, and
    -- a two-clock-time series is usually two different things sharing a name.
    if r.dows > 1 then
      v_reason := 'multi_weekday';
    elsif r.clocks > 1 then
      v_reason := 'multi_time';
    elsif r.wks < 3 then
      v_reason := 'too_few_weeks';
    elsif r.med between 6.5 and 7.5 then
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
    else
      v_reason := 'cadence_unusable';
    end if;

    if v_rule is null then
      v_skipped := v_skipped + 1;
      update public.events
         set enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
             || jsonb_build_object('schedule_inference', jsonb_build_object(
                  'state', 'not_expressible',
                  'reason', v_reason,
                  'median_gap_days', r.med,
                  'weekdays', r.dows,
                  'clock_times', r.clocks,
                  'observations', r.n,
                  'at', now()))
       where id = r.rep_id;
      continue;
    end if;

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

-- Break the worklist out by reason: "15 unresolved" and "53 unresolved, 38 of them
-- because nobody has decided whether they are opening hours" are different facts, and
-- the panel in part 4 needs the second one.
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
    'not_expressible_worklist',
      (select count(*) from public.events
        where enrichment_status->'schedule_inference'->>'state' = 'not_expressible'),
    'not_expressible_by_reason',
      coalesce((select jsonb_object_agg(reason, n) from (
        select coalesce(enrichment_status->'schedule_inference'->>'reason','unstated') as reason,
               count(*) as n
        from public.events
        where enrichment_status->'schedule_inference'->>'state' = 'not_expressible'
        group by 1) w), '{}'::jsonb),
    -- Positive control for the worklist itself: a series with neither a rule nor a
    -- stamp is one the inference never dispositioned, which is the bug this migration
    -- fixes. It must fall to zero and stay there.
    'series_undispositioned',
      (select count(*) from (
         select e.series_key
         from public.events e
         where e.series_key is not null and e.duplicate_of_id is null and e.status = 'active'
         group by e.series_key
         having count(*) filter (where e.schedule is not null) = 0
            and count(*) filter (
                  where e.enrichment_status->'schedule_inference'->>'state' is not null) = 0
       ) s),
    'inferred_with_hiatus',
      (select count(*) from public.events
        where schedule->>'confidence' = 'inferred'
          and jsonb_array_length(coalesce(schedule->'exceptions', '[]'::jsonb)) >= 3),
    'last_generated_at', (select max(created_at) from public.event_dates),
    'probe_ok', true
  );
$$;

revoke execute on function public.event_schedule_signals() from public, anon, authenticated;
grant  execute on function public.event_schedule_signals() to service_role;

do $verify$
declare
  v_res jsonb;
  v_sig jsonb;
begin
  v_res := public.infer_event_schedules(400);
  v_sig := public.event_schedule_signals();

  -- The whole point: nothing may be left undispositioned.
  if (v_sig->>'series_undispositioned')::int <> 0 then
    raise exception '% series still have neither a rule nor a stamp', v_sig->>'series_undispositioned';
  end if;

  -- Positive control. Zero undispositioned is also true of a run that stamped
  -- everything for the wrong reason, so the shape-gate reasons must actually appear —
  -- 38 series failed it on prod when this was written.
  if coalesce((v_sig->'not_expressible_by_reason'->>'multi_weekday')::int, 0) = 0 then
    raise exception 'no series was stamped multi_weekday; the gate is still filtering rather than dispositioning: %',
      v_sig->'not_expressible_by_reason';
  end if;

  -- And the rules already written must be untouched: this migration disposition
  -- only, it must not have inferred anything new or lost anything.
  if (v_sig->>'schedules_total')::int < 130 then
    raise exception 'schedules_total fell to % — rules were lost', v_sig->>'schedules_total';
  end if;
  if (v_sig->>'stale_rows')::int <> 0 or (v_sig->>'orphan_generated_rows')::int <> 0 then
    raise exception 'derive chain dirty after re-run: %', v_sig;
  end if;

  raise notice 'worklist now complete: % / signals %', v_res, v_sig;
end
$verify$;
