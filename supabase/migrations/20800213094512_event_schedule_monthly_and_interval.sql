-- Event temporal model, part 3a: the cadences the corpus actually has.
--
-- Part 2 (20750101100000) shipped `weekly` + `extra` only, and deliberately did not
-- CLAIM anything else -- the CHECK permitted no other key. Measuring the 194 live
-- series before writing any inference showed which cadences really exist, and two of
-- them cannot be expressed:
--
--   weekly (7d)                76 series   expressible
--   monthly (~30d)             55 series   NOT expressible  <- 35% of the corpus
--   fortnightly (14d)          15 series   NOT expressible
--   three-weekly / sparser      9 series   left to review, correctly
--
-- The monthly cohort matters most: 35% of the series. Of those 55, 47 fall on a
-- fixed nth weekday and 2 on the LAST weekday of the month -- and "last" is not
-- nth=5. `((day - 1) / 7) + 1` labels 30 Sep as the 5th Wednesday, which is arithmetic
-- rather than meaning: Bi-Gruppe (30 Sep, 28 Oct, 25 Nov) and Polygespräch (29 Sep,
-- 27 Oct, 24 Nov) are last-weekday series, and a forward-only nth generates nothing
-- for them in a month with only four. Hence nth = -1.
--
-- MEASURED BEFORE BUILDING, on the observed dates of the real series:
--   monthly  235 generated dates in-window, 1 never observed  -> 99.6%
--   weekly   902 generated dates in-window, 40 never observed -> 95.6%
-- and the 40 are concentrated in 6 of 75 series, all of them seasonal breaks rather
-- than scattered noise. Part 3b turns those into `exceptions`.

alter table public.events drop constraint if exists events_schedule_shape;
alter table public.events add constraint events_schedule_shape check (
  schedule is null
  or (
    jsonb_typeof(schedule) = 'object'
    and schedule->>'kind' in ('opening_hours', 'recurrence', 'run')
    and (not schedule ? 'weekly'     or jsonb_typeof(schedule->'weekly') = 'array')
    and (not schedule ? 'extra'      or jsonb_typeof(schedule->'extra') = 'array')
    and (not schedule ? 'exceptions' or jsonb_typeof(schedule->'exceptions') = 'array')
    and (not schedule ? 'confidence' or schedule->>'confidence' in ('authored', 'feed', 'inferred'))
    -- monthly is an OBJECT, not an array: one nth-weekday rule per schedule. A
    -- series that meets on the 1st AND 3rd Tuesday is two rules, and this model
    -- cannot hold two -- such a series must route to review rather than be
    -- approximated by one of them.
    and (not schedule ? 'monthly' or (
          jsonb_typeof(schedule->'monthly') = 'object'
      and (schedule->'monthly'->>'nth')::int in (-1, 1, 2, 3, 4)
      and schedule->'monthly'->>'day' in ('MO','TU','WE','TH','FR','SA','SU')
    ))
    -- interval_weeks applies to `weekly` entries and needs an anchor to know WHICH
    -- weeks; without one, "every other Friday" has no phase and is meaningless.
    and (not schedule ? 'interval_weeks' or (
          jsonb_typeof(schedule->'interval_weeks') = 'number'
      and (schedule->>'interval_weeks')::int between 1 and 8
      and schedule ? 'anchor'
    ))
  )
) not valid;

create or replace function public.event_schedule_dates(
  p_schedule jsonb,
  p_from     timestamptz,
  p_to       timestamptz
)
returns table (open_at timestamptz, close_at timestamptz)
language plpgsql
stable
parallel safe
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz         text;
  v_until      date;
  v_exceptions date[];
  v_last       date;
  v_day        date;
  v_dow        text;
  v_entry      jsonb;
  v_open       time;
  v_close      time;
  v_open_at    timestamptz;
  v_close_at   timestamptz;
  v_interval   int;
  v_anchor     date;
  v_m_nth      int;
  v_m_day      text;
  v_m_fwd      int;
  v_m_bwd      int;
begin
  if p_schedule is null or p_from is null or p_to is null or p_to < p_from then
    return;
  end if;

  v_tz       := coalesce(nullif(p_schedule->>'tz', ''), 'UTC');
  v_until    := nullif(p_schedule->>'until', '')::date;
  v_interval := coalesce(nullif(p_schedule->>'interval_weeks', '')::int, 1);
  v_anchor   := nullif(p_schedule->>'anchor', '')::date;
  v_m_nth    := nullif(p_schedule->'monthly'->>'nth', '')::int;
  v_m_day    := p_schedule->'monthly'->>'day';

  select coalesce(array_agg(value::date), '{}'::date[])
    into v_exceptions
  from jsonb_array_elements_text(coalesce(p_schedule->'exceptions', '[]'::jsonb));

  v_last := least(p_to::date, coalesce(v_until, p_to::date));
  v_day  := p_from::date;

  while v_day <= v_last loop
    if not (v_day = any (v_exceptions)) then
      v_dow := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from v_day)::int];

      -- weekly, optionally every Nth week measured from the anchor
      for v_entry in
        select value from jsonb_array_elements(coalesce(p_schedule->'weekly', '[]'::jsonb))
      loop
        if upper(coalesce(v_entry->>'day', '')) = v_dow
           and (
             v_interval = 1
             or (v_anchor is not null
                 -- floor division on whole days, so the phase is stable in both
                 -- directions from the anchor; `%` alone goes negative before it.
                 and (floor((v_day - v_anchor)::numeric / 7)::int % v_interval) = 0)
           )
        then
          v_open  := nullif(v_entry->>'start', '')::time;
          v_close := nullif(v_entry->>'end', '')::time;
          if v_open is not null then
            v_open_at := (v_day::text || ' ' || v_open::text)::timestamp at time zone v_tz;
            if v_close is null then
              v_close_at := null;
            else
              v_close_at := ((case when v_close <= v_open then v_day + 1 else v_day end)::text
                             || ' ' || v_close::text)::timestamp at time zone v_tz;
            end if;
            if v_open_at >= p_from and v_open_at <= p_to then
              open_at := v_open_at; close_at := v_close_at; return next;
            end if;
          end if;
        end if;
      end loop;

      -- monthly nth weekday, where nth = -1 means the LAST one in the month
      if v_m_nth is not null and v_m_day = v_dow then
        v_m_fwd := ((extract(day from v_day)::int - 1) / 7) + 1;
        v_m_bwd := ((extract(day from
                      (date_trunc('month', v_day) + interval '1 month' - interval '1 day')::date
                     )::int - extract(day from v_day)::int) / 7) + 1;

        if (v_m_nth > 0 and v_m_fwd = v_m_nth) or (v_m_nth = -1 and v_m_bwd = 1) then
          v_open  := nullif(p_schedule->'monthly'->>'start', '')::time;
          v_close := nullif(p_schedule->'monthly'->>'end', '')::time;
          if v_open is not null then
            v_open_at := (v_day::text || ' ' || v_open::text)::timestamp at time zone v_tz;
            if v_close is null then
              v_close_at := null;
            else
              v_close_at := ((case when v_close <= v_open then v_day + 1 else v_day end)::text
                             || ' ' || v_close::text)::timestamp at time zone v_tz;
            end if;
            if v_open_at >= p_from and v_open_at <= p_to then
              open_at := v_open_at; close_at := v_close_at; return next;
            end if;
          end if;
        end if;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  for v_entry in
    select value from jsonb_array_elements(coalesce(p_schedule->'extra', '[]'::jsonb))
  loop
    v_day  := nullif(v_entry->>'date', '')::date;
    v_open := nullif(v_entry->>'start', '')::time;
    if v_day is not null and v_open is not null then
      v_open_at := (v_day::text || ' ' || v_open::text)::timestamp at time zone v_tz;
      v_close   := nullif(v_entry->>'end', '')::time;
      if v_close is null then
        v_close_at := null;
      else
        v_close_at := ((case when v_close <= v_open then v_day + 1 else v_day end)::text
                       || ' ' || v_close::text)::timestamp at time zone v_tz;
      end if;
      if v_open_at >= p_from and v_open_at <= p_to then
        open_at := v_open_at; close_at := v_close_at; return next;
      end if;
    end if;
  end loop;
end
$$;

comment on function public.event_schedule_dates(jsonb, timestamptz, timestamptz) is
  'Pure expansion of a schedule rule into concrete openings within [p_from, p_to]. Handles weekly (with interval_weeks + anchor), monthly nth weekday (nth=-1 is the LAST), and one-off extra dates. Driven by weekly/monthly/extra, never by kind. Caller owns the horizon.';

do $verify$
declare
  v_got  text;
  v_n    int;
begin
  -- 1st Tuesday, six months. Reproduces Quinky-Stammtisch's real dates.
  select string_agg(to_char(open_at at time zone 'UTC', 'DD Mon'), ', ' order by open_at)
    into v_got
  from public.event_schedule_dates(
    jsonb_build_object('kind','recurrence','tz','UTC',
      'monthly', jsonb_build_object('nth',1,'day','TU','start','19:00','end','21:00')),
    '2026-09-15 00:00+00'::timestamptz, '2027-01-15 00:00+00'::timestamptz);
  if v_got is distinct from '06 Oct, 03 Nov, 01 Dec, 05 Jan' then
    raise exception 'monthly nth=1 TU produced "%", expected "06 Oct, 03 Nov, 01 Dec, 05 Jan"', v_got;
  end if;

  -- LAST Wednesday. Reproduces Bi-Gruppe (30 Sep, 28 Oct, 25 Nov) -- the case a
  -- forward-only nth gets wrong, because September has five Wednesdays and
  -- October has four.
  select string_agg(to_char(open_at at time zone 'UTC', 'DD Mon'), ', ' order by open_at)
    into v_got
  from public.event_schedule_dates(
    jsonb_build_object('kind','recurrence','tz','UTC',
      'monthly', jsonb_build_object('nth',-1,'day','WE','start','19:00')),
    '2026-09-01 00:00+00'::timestamptz, '2026-12-01 00:00+00'::timestamptz);
  if v_got is distinct from '30 Sep, 28 Oct, 25 Nov' then
    raise exception 'monthly nth=-1 WE produced "%", expected "30 Sep, 28 Oct, 25 Nov"', v_got;
  end if;

  -- Fortnightly from an anchor: every OTHER Friday, not every Friday.
  select count(*) into v_n
  from public.event_schedule_dates(
    jsonb_build_object('kind','recurrence','tz','UTC','interval_weeks',2,'anchor','2026-09-04',
      'weekly', jsonb_build_array(jsonb_build_object('day','FR','start','22:00','end','04:00'))),
    '2026-09-01 00:00+00'::timestamptz, '2026-10-31 00:00+00'::timestamptz);
  -- Fridays in range: 04,11,18,25 Sep, 02,09,16,23,30 Oct = 9; every other = 5.
  if v_n <> 5 then
    raise exception 'fortnightly produced % dates over 9 Fridays, expected 5', v_n;
  end if;

  -- interval_weeks=1 must behave exactly as before, or part 2's rules change meaning.
  select count(*) into v_n
  from public.event_schedule_dates(
    jsonb_build_object('kind','recurrence','tz','UTC',
      'weekly', jsonb_build_array(jsonb_build_object('day','FR','start','22:00'))),
    '2026-09-01 00:00+00'::timestamptz, '2026-10-31 00:00+00'::timestamptz);
  if v_n <> 9 then
    raise exception 'plain weekly regressed: % dates over 9 Fridays', v_n;
  end if;

  raise notice 'expander: monthly nth, monthly last, fortnightly and plain weekly all verified';
end
$verify$;
