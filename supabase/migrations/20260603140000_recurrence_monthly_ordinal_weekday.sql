-- Extend expand_event_recurrence to support MONTHLY on the Nth weekday
-- ("every 1st Saturday"), via byDay + bySetPos. Everything else is unchanged from
-- 20260429160000_event_occurrences_expansion.sql. bySetPos: 1..4 = first..fourth,
-- -1 = last. Falls back to the previous behavior when bySetPos is absent.

create or replace function public.expand_event_recurrence(
  p_event_id     uuid,
  p_horizon_days int default 365
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event           record;
  v_rule            jsonb;
  v_freq            text;
  v_interval        int;
  v_by_day          text[];
  v_by_setpos       int;
  v_until           timestamptz;
  v_exceptions      text[];
  v_horizon_until   timestamptz;
  v_duration        interval;
  v_current         timestamptz;
  v_count           int := 0;
  v_inserted        int;
  v_rule_hash       text;
  v_week_anchor     timestamptz;
  v_offset_days     int;
  v_byday_iter      text;
  v_target          timestamptz;
  v_month_anchor    date;
  v_tod             interval;
  v_dow_target      int;
  v_first           date;
  v_last            date;
  v_target_date     date;
begin
  select id, start_date, end_date, recurrence_rule
    into v_event
    from public.events
   where id = p_event_id;
  if not found then return 0; end if;
  if v_event.start_date is null then return 0; end if;
  v_rule := v_event.recurrence_rule;
  if v_rule is null or jsonb_typeof(v_rule) <> 'object' then return 0; end if;

  v_freq := upper(coalesce(v_rule->>'freq', ''));
  if v_freq not in ('DAILY','WEEKLY','MONTHLY','YEARLY') then return 0; end if;

  v_interval := greatest(coalesce((v_rule->>'interval')::int, 1), 1);

  if v_rule ? 'byDay' and jsonb_typeof(v_rule->'byDay') = 'array' then
    select array_agg(upper(t)) into v_by_day
      from jsonb_array_elements_text(v_rule->'byDay') t;
  end if;

  if v_rule ? 'bySetPos' and (v_rule->>'bySetPos') <> '' then
    begin
      v_by_setpos := (v_rule->>'bySetPos')::int;
    exception when others then v_by_setpos := null;
    end;
  end if;

  if v_rule ? 'until' and (v_rule->>'until') <> '' then
    begin
      v_until := (v_rule->>'until')::timestamptz;
    exception when others then v_until := null;
    end;
  end if;

  if v_rule ? 'exceptions' and jsonb_typeof(v_rule->'exceptions') = 'array' then
    select array_agg(t) into v_exceptions
      from jsonb_array_elements_text(v_rule->'exceptions') t;
  end if;

  v_horizon_until := now() + make_interval(days => p_horizon_days);
  if v_until is null or v_until > v_horizon_until then
    v_until := v_horizon_until;
  end if;

  v_duration := coalesce(v_event.end_date - v_event.start_date, interval '0');
  v_rule_hash := encode(digest(v_rule::text, 'sha256'), 'hex');

  -- ── MONTHLY on the Nth weekday ("every 1st Saturday") ───────────────────
  if v_freq = 'MONTHLY' and v_by_day is not null and array_length(v_by_day, 1) >= 1
     and v_by_setpos is not null then
    v_dow_target := case upper(v_by_day[1])
      when 'MO' then 1 when 'TU' then 2 when 'WE' then 3 when 'TH' then 4
      when 'FR' then 5 when 'SA' then 6 when 'SU' then 7 else null
    end;
    if v_dow_target is null then return 0; end if;
    v_tod := v_event.start_date - date_trunc('day', v_event.start_date);
    v_month_anchor := date_trunc('month', v_event.start_date)::date;
    while v_month_anchor <= v_until loop
      if v_by_setpos > 0 then
        v_first := v_month_anchor
          + (((v_dow_target - extract(isodow from v_month_anchor)::int) + 7) % 7);
        v_target_date := v_first + (v_by_setpos - 1) * 7;
        if extract(month from v_target_date) <> extract(month from v_month_anchor) then
          v_target_date := null;  -- e.g. no "5th Saturday" this month
        end if;
      else
        v_last := (date_trunc('month', v_month_anchor) + interval '1 month - 1 day')::date;
        v_target_date := v_last
          - (((extract(isodow from v_last)::int - v_dow_target) + 7) % 7);
      end if;
      if v_target_date is not null then
        v_target := v_target_date::timestamptz + v_tod;
        if v_target >= v_event.start_date and v_target <= v_until
           and not is_exception_date(v_target, v_exceptions) then
          insert into public.event_occurrences (
            master_event_id, occurrence_start, occurrence_end,
            is_exception, status, source_rule_hash
          ) values (
            p_event_id, v_target, v_target + v_duration,
            false, 'active', v_rule_hash
          )
          on conflict (master_event_id, occurrence_start) do nothing;
          get diagnostics v_inserted = row_count;
          v_count := v_count + v_inserted;
        end if;
      end if;
      v_month_anchor := (v_month_anchor + make_interval(months => v_interval))::date;
    end loop;
    return v_count;
  end if;

  -- ── DAILY / MONTHLY / YEARLY: simple stepping ────────────────────────────
  if v_freq in ('DAILY','MONTHLY','YEARLY') then
    v_current := v_event.start_date;
    while v_current <= v_until loop
      if not is_exception_date(v_current, v_exceptions) then
        insert into public.event_occurrences (
          master_event_id, occurrence_start, occurrence_end,
          is_exception, status, source_rule_hash
        ) values (
          p_event_id, v_current, v_current + v_duration,
          false, 'active', v_rule_hash
        )
        on conflict (master_event_id, occurrence_start) do nothing;
        get diagnostics v_inserted = row_count;
        v_count := v_count + v_inserted;
      end if;
      v_current := case v_freq
        when 'DAILY'   then v_current + make_interval(days   => v_interval)
        when 'MONTHLY' then v_current + make_interval(months => v_interval)
        when 'YEARLY'  then v_current + make_interval(years  => v_interval)
      end;
    end loop;
    return v_count;
  end if;

  -- ── WEEKLY ───────────────────────────────────────────────────────────────
  if v_freq = 'WEEKLY' then
    if v_by_day is null or array_length(v_by_day, 1) is null then
      v_current := v_event.start_date;
      while v_current <= v_until loop
        if not is_exception_date(v_current, v_exceptions) then
          insert into public.event_occurrences (
            master_event_id, occurrence_start, occurrence_end,
            is_exception, status, source_rule_hash
          ) values (
            p_event_id, v_current, v_current + v_duration,
            false, 'active', v_rule_hash
          )
          on conflict (master_event_id, occurrence_start) do nothing;
          get diagnostics v_inserted = row_count;
          v_count := v_count + v_inserted;
        end if;
        v_current := v_current + make_interval(weeks => v_interval);
      end loop;
      return v_count;
    end if;

    v_week_anchor := v_event.start_date - make_interval(days => extract(isodow from v_event.start_date)::int - 1);
    while v_week_anchor <= v_until loop
      foreach v_byday_iter in array v_by_day loop
        v_offset_days := case upper(v_byday_iter)
          when 'MO' then 0 when 'TU' then 1 when 'WE' then 2 when 'TH' then 3
          when 'FR' then 4 when 'SA' then 5 when 'SU' then 6 else null
        end;
        if v_offset_days is null then continue; end if;
        v_target := v_week_anchor + make_interval(days => v_offset_days);
        v_target := date_trunc('day', v_target)
          + (v_event.start_date - date_trunc('day', v_event.start_date));
        if v_target < v_event.start_date or v_target > v_until then continue; end if;
        if is_exception_date(v_target, v_exceptions) then continue; end if;
        insert into public.event_occurrences (
          master_event_id, occurrence_start, occurrence_end,
          is_exception, status, source_rule_hash
        ) values (
          p_event_id, v_target, v_target + v_duration,
          false, 'active', v_rule_hash
        )
        on conflict (master_event_id, occurrence_start) do nothing;
        get diagnostics v_inserted = row_count;
        v_count := v_count + v_inserted;
      end loop;
      v_week_anchor := v_week_anchor + make_interval(weeks => v_interval);
    end loop;
    return v_count;
  end if;

  return v_count;
end $$;
