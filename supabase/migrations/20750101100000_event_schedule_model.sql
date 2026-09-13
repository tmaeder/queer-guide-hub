-- Event temporal model, part 1: one discriminated `schedule` and a derived date index.
--
-- Design: docs/superpowers/specs/2026-09-12-event-temporal-model-design.md
--
-- WHAT THIS REPLACES. "When is this on" is currently expressed four ways, three of
-- them empty on every row: `event_occurrences` (0 rows, and its read RPC gates on
-- status='published', which events_status_check forbids), `festivals`/`festival_id`
-- (0/0), and `events.recurrence_rule` (0). The one populated pair does NOT mean what
-- its name says -- `is_recurring` + `recurrence_pattern` is 98% 'annual', i.e. the
-- year-over-year EDITION axis, and it has ZERO overlap with `series_key` (measured:
-- `is_recurring AND series_key IS NOT NULL` is 0 rows). Two different concepts wore
-- one word, which is why `festivals`, the intended edition table, was never filled:
-- the concept already lived in a text column.
--
-- NOTHING IS RETIRED HERE AND NOTHING READS THIS YET. This part ships the model and
-- the expander only. `schedule` has no writer until part 3 (inference -> review
-- queue) and no reader until part 5 (display). That is deliberate: it makes the
-- measurements in part 3 honest, because nothing is published while they are taken.
--
-- `series_key`/`series_size`/`series_next` are untouched. They work, they carry 1,921
-- rows across 194 live series, and they remain the browse-collapse mechanism.

-- ---------------------------------------------------------------------------
-- 1. events.schedule
-- ---------------------------------------------------------------------------

alter table public.events add column if not exists schedule jsonb;

comment on column public.events.schedule is
  'Discriminated temporal rule. kind=opening_hours (one continuous thing that is OPEN) | recurrence (N separate happenings you attend) | run (one thing playing across a span). NULL for a plain point event. Authoritative; public.event_dates is derived from it and is disposable. See docs/superpowers/specs/2026-09-12-event-temporal-model-design.md';

-- NOT VALID: `events` is ~48k rows and every existing row has schedule IS NULL, so
-- the constraint is satisfied today; validating it would take a full scan for no
-- new information. Matches the house convention for adding a CHECK to a big table.
alter table public.events drop constraint if exists events_schedule_shape;
alter table public.events add constraint events_schedule_shape check (
  schedule is null
  or (
    jsonb_typeof(schedule) = 'object'
    and schedule->>'kind' in ('opening_hours', 'recurrence', 'run')
    -- `weekly` and `extra` drive expansion; a scalar or object there would make the
    -- expander silently emit nothing rather than fail, which is the shape of bug
    -- this whole file exists to stop repeating.
    and (not schedule ? 'weekly'     or jsonb_typeof(schedule->'weekly') = 'array')
    and (not schedule ? 'extra'      or jsonb_typeof(schedule->'extra') = 'array')
    and (not schedule ? 'exceptions' or jsonb_typeof(schedule->'exceptions') = 'array')
    and (not schedule ? 'confidence' or schedule->>'confidence' in ('authored', 'feed', 'inferred'))
  )
) not valid;

-- ---------------------------------------------------------------------------
-- 2. The rule's fingerprint
-- ---------------------------------------------------------------------------

-- jsonb renders with sorted keys and normalised whitespace, so its text form is a
-- stable canonical encoding -- two logically equal rules hash the same regardless of
-- how they were written. IMMUTABLE is correct here: md5 over jsonb::text depends on
-- nothing outside its argument.
create or replace function public.event_schedule_hash(p_schedule jsonb)
returns text
language sql
immutable
parallel safe
as $$ select case when p_schedule is null then null else md5(p_schedule::text) end $$;

comment on function public.event_schedule_hash(jsonb) is
  'Canonical fingerprint of a schedule rule. event_dates.source_hash stores the hash of the rule that produced the row, so staleness is a JOIN rather than a diff -- and "repair" is impossible by construction, the only operation is rebuild.';

-- ---------------------------------------------------------------------------
-- 3. The expander (pure)
-- ---------------------------------------------------------------------------

-- EXPANSION IS DRIVEN BY `weekly` + `extra`, NEVER BY `kind`. `kind` decides the
-- SENTENCE a reader gets ("Open today until 18:00" vs "Every Tuesday" vs "Playing
-- until 30 Nov"); it must not change which dates exist, or the same rule would mean
-- different things depending on a label someone can edit.
--
-- A schedule with no `weekly` and no `extra` expands to NOTHING, on purpose. That is
-- a continuous span, and the span is already on events.start_date/end_date --
-- emitting a row per day would double-count it against its own parent.
--
-- STABLE, not IMMUTABLE: `AT TIME ZONE` reads the tz database.
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
begin
  if p_schedule is null or p_from is null or p_to is null or p_to < p_from then
    return;
  end if;

  v_tz    := coalesce(nullif(p_schedule->>'tz', ''), 'UTC');
  v_until := nullif(p_schedule->>'until', '')::date;

  select coalesce(array_agg(value::date), '{}'::date[])
    into v_exceptions
  from jsonb_array_elements_text(coalesce(p_schedule->'exceptions', '[]'::jsonb));

  -- The caller owns the horizon; `until` may only narrow it, never extend it.
  v_last := least(p_to::date, coalesce(v_until, p_to::date));
  v_day  := p_from::date;

  while v_day <= v_last loop
    if not (v_day = any (v_exceptions)) then
      -- isodow, never to_char(...,'DY'): to_char is lc_time-dependent, so a server
      -- with a non-English locale would match no weekday at all and silently expand
      -- to nothing.
      v_dow := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from v_day)::int];

      for v_entry in
        select value from jsonb_array_elements(coalesce(p_schedule->'weekly', '[]'::jsonb))
      loop
        if upper(coalesce(v_entry->>'day', '')) = v_dow then
          v_open  := nullif(v_entry->>'start', '')::time;
          v_close := nullif(v_entry->>'end', '')::time;

          if v_open is not null then
            v_open_at := (v_day::text || ' ' || v_open::text)::timestamp at time zone v_tz;

            if v_close is null then
              v_close_at := null;
            else
              -- A close at or before the open is the next morning: a club open
              -- 22:00-04:00 is one session, not a zero-length or negative one.
              v_close_at := ((case when v_close <= v_open then v_day + 1 else v_day end)::text
                             || ' ' || v_close::text)::timestamp at time zone v_tz;
            end if;

            if v_open_at >= p_from and v_open_at <= p_to then
              open_at := v_open_at; close_at := v_close_at; return next;
            end if;
          end if;
        end if;
      end loop;
    end if;

    v_day := v_day + 1;
  end loop;

  -- One-off additions (a late opening, a special evening). Exceptions do NOT
  -- suppress these: an `extra` entry is an explicit statement about that exact date
  -- and is the more specific instruction.
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
  'Pure expansion of a schedule rule into concrete openings within [p_from, p_to]. Driven by weekly + extra, never by kind. Caller owns the horizon.';

-- ---------------------------------------------------------------------------
-- 4. event_dates -- derived, disposable
-- ---------------------------------------------------------------------------

create table if not exists public.event_dates (
  event_id    uuid        not null references public.events(id) on delete cascade,
  open_at     timestamptz not null,
  close_at    timestamptz,
  day         date        not null,
  -- A generated date is a CLAIM DERIVED FROM A RULE, never a confirmed listing. The
  -- display layer must not give it a ticket link, must exclude it from JSON-LD and
  -- from browse-feed date facets. Absence of evidence is not evidence: a fabricated
  -- date that sends someone to a closed venue is real-world harm.
  provenance  text        not null default 'generated'
                          check (provenance in ('generated', 'confirmed')),
  source_hash text        not null,
  created_at  timestamptz not null default now(),
  primary key (event_id, open_at)
);

comment on table public.event_dates is
  'Derived index of concrete openings, rebuilt from events.schedule. NEVER edited by hand: a row whose source_hash differs from event_schedule_hash(events.schedule) is stale and gets rebuilt. Disposable by design -- the rule is the source of truth.';
comment on column public.event_dates.provenance is
  'generated = derived from the rule, must never render as a confirmed listing or reach JSON-LD. confirmed = corroborated by a feed or a human.';
comment on column public.event_dates.source_hash is
  'event_schedule_hash() of the rule that produced this row. Makes the staleness check a join, not a diff.';

create index if not exists event_dates_day_idx on public.event_dates (day);
create index if not exists event_dates_open_at_idx on public.event_dates (open_at);

alter table public.event_dates enable row level security;

-- The satellite embeds the FULL parent predicate rather than joining and hoping:
-- events are hidden from anon in criminalizing countries (safety_gated) and merged
-- rows are hidden from everyone. A date row leaks the existence and timing of its
-- event, so it has to answer the same question the parent does.
drop policy if exists event_dates_public_read on public.event_dates;
create policy event_dates_public_read on public.event_dates
for select
using (
  exists (
    select 1
    from public.events e
    where e.id = public.event_dates.event_id
      and e.duplicate_of_id is null
      and (not e.safety_gated or (select auth.uid()) is not null)
  )
);

-- New tables need explicit anon GRANTs in this project.
grant select on public.event_dates to anon, authenticated, service_role;
grant insert, update, delete on public.event_dates to service_role;

-- Supabase stock `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated` hands the write set to both API roles on every new relation. RLS
-- would refuse the write anyway (there is no write policy), but leaving the grant
-- in place is how 20260806180000 and 20260912075359 both happened.
revoke insert, update, delete, truncate on public.event_dates from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Postconditions -- assert what was reached, not what was expected
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_rule  jsonb;
  v_n     integer;
  v_first timestamptz;
  v_close timestamptz;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'schedule'
  ) then
    raise exception 'events.schedule was not created';
  end if;

  if to_regclass('public.event_dates') is null then
    raise exception 'event_dates was not created';
  end if;

  -- Exercise the expander on a real rule. A migration that ships an expander
  -- without running it is how a function that expands to nothing ships green.
  -- Tuesdays 19:00-22:00, Europe/Berlin, across exactly four Tuesdays, with the
  -- third one excepted.
  v_rule := jsonb_build_object(
    'kind', 'recurrence',
    'tz', 'Europe/Berlin',
    'weekly', jsonb_build_array(jsonb_build_object('day', 'TU', 'start', '19:00', 'end', '22:00')),
    'exceptions', jsonb_build_array('2026-09-22')
  );

  select count(*), min(open_at) into v_n, v_first
  from public.event_schedule_dates(v_rule, '2026-09-07 00:00+00'::timestamptz, '2026-10-05 00:00+00'::timestamptz);

  -- Tuesdays in range: 08, 15, 22, 29 Sep. One excepted => 3.
  if v_n <> 3 then
    raise exception 'expander produced % openings for a weekly rule over 4 Tuesdays with 1 exception, expected 3', v_n;
  end if;
  if v_first <> '2026-09-08 19:00+02'::timestamptz then
    raise exception 'expander put the first opening at %, expected 2026-09-08 19:00+02', v_first;
  end if;

  -- Past-midnight close must land on the NEXT day, not produce a negative session.
  select close_at into v_close
  from public.event_schedule_dates(
    jsonb_build_object('kind', 'recurrence', 'tz', 'UTC',
      'weekly', jsonb_build_array(jsonb_build_object('day', 'TU', 'start', '22:00', 'end', '04:00'))),
    '2026-09-07 00:00+00'::timestamptz, '2026-09-09 00:00+00'::timestamptz);

  if v_close is null or v_close <= '2026-09-08 22:00+00'::timestamptz then
    raise exception 'a 22:00-04:00 session closed at %, which is not the following morning', v_close;
  end if;

  -- A rule with neither weekly nor extra is a continuous span and must expand to
  -- nothing -- the span already lives on events.start_date/end_date.
  select count(*) into v_n
  from public.event_schedule_dates(
    jsonb_build_object('kind', 'run', 'tz', 'UTC'),
    '2026-09-01 00:00+00'::timestamptz, '2026-12-01 00:00+00'::timestamptz);

  if v_n <> 0 then
    raise exception 'a span-only rule expanded to % rows; it must expand to none', v_n;
  end if;

  raise notice 'event schedule model installed; expander verified on 3 synthetic rules';
end
$verify$;
