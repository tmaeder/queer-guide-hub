-- Event recurrence expansion
--
-- Populates event_occurrences (table introduced in 20260429130000_event_occurrences.sql)
-- from events.recurrence_rule. Closes one of the Phase 2 follow-ups.
--
-- Recurrence rule shape (jsonb):
--   {
--     "freq": "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY",
--     "interval": 1,                       -- optional, default 1
--     "byDay": ["MO","TU","WE","TH","FR","SA","SU"],  -- optional, WEEKLY only
--     "until": "2026-12-31T00:00:00Z",     -- optional ISO 8601 timestamptz
--     "exceptions": ["2026-07-15", ...]    -- optional dates or timestamps
--   }
--
-- Supported subset:
--   - DAILY  with interval (any value >= 1)
--   - WEEKLY with interval (any value >= 1) + optional byDay (multiple values)
--   - MONTHLY with interval
--   - YEARLY with interval
--   - until horizon and exceptions[]
--
-- Out of scope (will fall back to interval-only stepping or be ignored):
--   - BYMONTHDAY, BYWEEKNO, BYSETPOS, BYHOUR, BYMINUTE, COUNT
--   - Exotic fields documented in RFC 5545 §3.3.10.
--
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING against the unique
-- (master_event_id, occurrence_start) constraint. Re-running the function
-- adds only new occurrences and never disturbs existing rows (which is
-- important because admins may edit individual occurrences).

create extension if not exists pgcrypto;

-- ── Per-event expansion ─────────────────────────────────────────────────────
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
  v_until           timestamptz;
  v_exceptions      text[];
  v_horizon_until   timestamptz;
  v_duration        interval;
  v_current         timestamptz;
  v_count           int := 0;
  v_inserted        int;
  v_dow_short       text;
  v_skip            boolean;
  v_rule_hash       text;
  v_week_anchor     timestamptz;
  v_offset_days     int;
  v_byday_iter      text;
  v_target          timestamptz;
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
  -- Two sub-cases: with byDay (expand each week to all matching days), or
  -- without (step by interval weeks).
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

    -- WEEKLY with byDay: for each iteration of `interval` weeks, emit one
    -- occurrence per matching byDay where the date is >= start_date and
    -- <= until.
    -- Anchor the iteration on the start_date's week (Mon-based).
    v_week_anchor := v_event.start_date - make_interval(days => extract(isodow from v_event.start_date)::int - 1);
    while v_week_anchor <= v_until loop
      foreach v_byday_iter in array v_by_day loop
        v_offset_days := case upper(v_byday_iter)
          when 'MO' then 0 when 'TU' then 1 when 'WE' then 2 when 'TH' then 3
          when 'FR' then 4 when 'SA' then 5 when 'SU' then 6 else null
        end;
        if v_offset_days is null then continue; end if;
        v_target := v_week_anchor + make_interval(days => v_offset_days);
        -- Preserve time-of-day from the master start_date.
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

-- ── exception-date predicate ────────────────────────────────────────────────
-- Accepts both YYYY-MM-DD and full ISO timestamp strings; matches on the
-- date portion only (so "exception on 2026-07-15" cancels every occurrence
-- on that calendar day in the event's timezone).
create or replace function public.is_exception_date(
  p_when       timestamptz,
  p_exceptions text[]
) returns boolean
language plpgsql
immutable
as $$
declare
  v_d   text;
  v_iso text;
begin
  if p_exceptions is null or array_length(p_exceptions, 1) is null then
    return false;
  end if;
  v_d := p_when::date::text;        -- e.g. '2026-07-15'
  v_iso := p_when::text;            -- full ISO
  return v_d = any(p_exceptions) or v_iso = any(p_exceptions);
end $$;

-- ── Bulk expansion ──────────────────────────────────────────────────────────
-- Iterates every event with non-null recurrence_rule and expands it. Uses a
-- statement timeout suitable for a nightly cron. Returns total occurrences
-- inserted across all events.
create or replace function public.expand_all_recurring_events(
  p_horizon_days int default 365
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  r       record;
begin
  for r in
    select id from public.events
     where recurrence_rule is not null
       and (status is null or status <> 'archived')
  loop
    v_total := v_total + public.expand_event_recurrence(r.id, p_horizon_days);
  end loop;
  return v_total;
end $$;

revoke all on function public.expand_event_recurrence(uuid, int) from public;
revoke all on function public.expand_all_recurring_events(int) from public;
revoke all on function public.is_exception_date(timestamptz, text[]) from public;
grant execute on function public.expand_event_recurrence(uuid, int) to authenticated, service_role;
grant execute on function public.expand_all_recurring_events(int)   to authenticated, service_role;
grant execute on function public.is_exception_date(timestamptz, text[]) to authenticated, service_role, anon;

comment on function public.expand_event_recurrence(uuid, int) is
  'Expand events.recurrence_rule for one event into event_occurrences rows. Idempotent via UNIQUE (master_event_id, occurrence_start). Returns rows inserted.';
comment on function public.expand_all_recurring_events(int) is
  'Bulk wrapper: expand every event with recurrence_rule. Intended target of nightly cron.';

-- ── Nightly cron ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'expand-event-recurrences') then
    perform cron.unschedule('expand-event-recurrences');
  end if;
end $$;

select cron.schedule(
  'expand-event-recurrences',
  '15 3 * * *',  -- daily at 03:15 UTC (before scraper full refresh at 03:30)
  $cron$ select public.expand_all_recurring_events(365); $cron$
);
