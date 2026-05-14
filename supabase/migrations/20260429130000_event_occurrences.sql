-- event_occurrences
--
-- First-class storage for recurring-event expansions. Called out in
-- docs/search-intelligence/02-unified-model.md (section E + Phase 2 roadmap):
-- today, events.recurrence_rule (jsonb) is set on the master row, but no row
-- exists for individual occurrences, so "events on 2026-06-15" can't match
-- a recurring weekly event that happens that day.
--
-- This migration is pure schema. It adds the table, RLS, and a window-query
-- helper. Population of occurrences from events.recurrence_rule is its own
-- follow-up PR (RRULE expansion is bug-prone enough to deserve dedicated
-- review and tests).
--
-- Once an expansion job populates this table, search and listing code can
-- query event_occurrences directly with a date window and JOIN back to the
-- master event for content fields.

create table if not exists public.event_occurrences (
  id                uuid primary key default gen_random_uuid(),
  master_event_id   uuid not null references public.events(id) on delete cascade,
  -- Occurrence start/end. For all-day events, set time to 00:00 / 23:59:59
  -- in the master event's timezone. Stored as TIMESTAMPTZ (UTC) per project
  -- convention.
  occurrence_start  timestamptz not null,
  occurrence_end    timestamptz,
  -- True when this occurrence overrides a generated rule slot (cancelled,
  -- moved, etc.). Lets the expansion job re-run idempotently without
  -- clobbering manual edits.
  is_exception      boolean not null default false,
  -- Per-occurrence status independent of the master event's status. An
  -- "active" master with a "cancelled" occurrence is the canonical reason
  -- this column exists.
  status            text not null default 'active'
                    check (status in ('active','cancelled','moved')),
  -- Optional override fields for this occurrence (rare; keeps schema lean).
  override_title       text,
  override_description text,
  override_venue_id    uuid,
  -- Provenance: the rule version that produced this row, so re-expansion
  -- can detect drift.
  source_rule_hash  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A given (master_event_id, occurrence_start) combination is unique:
  -- you cannot have two distinct occurrences at the same start time for
  -- the same master event.
  unique (master_event_id, occurrence_start)
);

create index if not exists event_occurrences_master_idx
  on public.event_occurrences (master_event_id);
create index if not exists event_occurrences_window_idx
  on public.event_occurrences (occurrence_start);
create index if not exists event_occurrences_active_window_idx
  on public.event_occurrences (occurrence_start)
  where status = 'active';

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.tg_event_occurrences_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists event_occurrences_set_updated_at on public.event_occurrences;
create trigger event_occurrences_set_updated_at
  before update on public.event_occurrences
  for each row execute function public.tg_event_occurrences_set_updated_at();

-- ── Helper RPC: events in a date window ──────────────────────────────────────
-- Returns one row per matching occurrence with the master event's id, slug,
-- and title for cheap rendering. The caller can join back to events for
-- additional fields. Window is half-open [from_ts, to_ts).
--
-- Returns occurrences whose status='active' AND whose master event has
-- status='published' (matches the storefront's existing event visibility).
create or replace function public.events_in_window(
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  occurrence_id    uuid,
  master_event_id  uuid,
  occurrence_start timestamptz,
  occurrence_end   timestamptz,
  master_title     text,
  master_slug      text,
  is_exception     boolean
)
language sql
stable
as $$
  select
    o.id,
    o.master_event_id,
    o.occurrence_start,
    o.occurrence_end,
    coalesce(o.override_title, e.title) as master_title,
    e.slug,
    o.is_exception
  from public.event_occurrences o
  join public.events e on e.id = o.master_event_id
  where o.status = 'active'
    and e.status = 'published'
    and o.occurrence_start >= p_from
    and o.occurrence_start <  p_to
  order by o.occurrence_start asc
$$;

revoke all on function public.events_in_window(timestamptz, timestamptz) from public;
grant execute on function public.events_in_window(timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.event_occurrences enable row level security;

-- Public can read active occurrences whose master is published. Matches
-- the existing events public-read posture.
drop policy if exists event_occurrences_public_read on public.event_occurrences;
create policy event_occurrences_public_read on public.event_occurrences
  for select using (
    status = 'active'
    and exists (
      select 1 from public.events e
      where e.id = event_occurrences.master_event_id
        and e.status = 'published'
    )
  );

-- Admins/moderators see everything (cancelled occurrences, drafts).
drop policy if exists event_occurrences_admin_read on public.event_occurrences;
create policy event_occurrences_admin_read on public.event_occurrences
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- Writes admin-only via service role. Browser-direct writes denied.

comment on table public.event_occurrences is
  'Materialised expansion of recurring events. Each row is one occurrence; populated from events.recurrence_rule by a separate expansion job.';
comment on function public.events_in_window(timestamptz, timestamptz) is
  'Returns active occurrences whose master event is published, within [p_from, p_to). Joins to events for title/slug.';
