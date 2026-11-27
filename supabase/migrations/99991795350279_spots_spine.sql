-- Spots P0: one spine over venues and organizations.
--
-- Spec: docs/superpowers/specs/2026-11-22-spots-unification-design.md
-- Plan: docs/superpowers/plans/2026-11-22-spots-unification.md
--
-- What this does: adds public.spots, one row per venue (kind 'place') and per organization
-- (kind 'organization'), ids preserved. AFTER triggers on both profile tables keep it in step;
-- spots_drift_check() runs nightly and must stay at zero for seven nights before P1.
--
-- What it deliberately does NOT do:
--   * No anon/authenticated grants. Nothing public reads the spine yet, and a direct grant
--     would need the draft-org and safety-gate rules restated in RLS. Public access arrives
--     in P3 through definer RPCs.
--   * No parent_id, no unique slug, no fold. 3,209 slugs are shared between a venue and an
--     org today (spec §Slugs); the 104k shadow orgs still exist and get their own spot rows.
--
-- One mapping, used twice: spots_from_venue / spots_from_org define the projection, and both
-- the trigger and the drift check call them, so the check cannot measure a different shape
-- than the trigger writes.
--
-- CREATE TRIGGER takes SHARE ROW EXCLUSIVE on each profile table and holds it to commit, so
-- no write can land between the backfill snapshot and the trigger becoming visible. That
-- also means venue writes wait for this migration; lock_timeout makes it fail fast instead
-- of queueing behind a long transaction.

set lock_timeout = '10s';

create table public.spots (
  id uuid primary key,
  kind text not null check (kind in ('place', 'organization')),
  roles text[] not null default '{}',
  slug text not null,
  name text not null,
  category text,
  city_id uuid,
  country_id uuid,
  latitude numeric,
  longitude numeric,
  safety_gated boolean not null default false,
  duplicate_of_id uuid,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz
);

comment on table public.spots is
  'Spine over venues (kind place) and organizations (kind organization). Mirrored by trg_spots_sync; '
  'do not write directly. P0 of docs/superpowers/specs/2026-11-22-spots-unification-design.md.';

create index spots_kind_idx on public.spots (kind);
create index spots_slug_idx on public.spots (slug);
create index spots_duplicate_of_idx on public.spots (duplicate_of_id) where duplicate_of_id is not null;

alter table public.spots enable row level security;
revoke all on public.spots from public, anon, authenticated;

-- Projection: updated_at is left null here so two projections of an unchanged source row
-- compare equal; the writer stamps it.
--
-- No SET search_path on these two: a SET clause stops Postgres inlining a SQL function, and
-- the backfill + drift check call them ~700k times while holding a write lock on both profile
-- tables. The first prod dry run, with the clause, held that lock for minutes. They are
-- invoker functions over fully qualified names, so the clause bought nothing.
create function public.spots_from_venue(v public.venues)
returns public.spots
language sql
stable
as $$
  select row(
    v.id, 'place', '{}'::text[], coalesce(v.slug, v.id::text), coalesce(v.name, ''), v.category,
    v.city_id, v.country_id, v.latitude, v.longitude, coalesce(v.safety_gated, false),
    v.duplicate_of_id, case when v.closed_at is not null then 'closed' else 'active' end,
    coalesce(v.created_at, 'epoch'::timestamptz), null::timestamptz
  )::public.spots
$$;

create function public.spots_from_org(o public.organizations)
returns public.spots
language sql
stable
as $$
  select row(
    o.id, 'organization', coalesce(o.roles, '{}'::text[]), coalesce(o.slug, o.id::text),
    coalesce(o.name, ''), null::text, o.city_id, o.country_id, o.latitude::numeric,
    o.longitude::numeric, coalesce(o.safety_gated, false), o.duplicate_of_id,
    coalesce(o.status, 'active'), coalesce(o.created_at, 'epoch'::timestamptz), null::timestamptz
  )::public.spots
$$;

create function public.spots_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.spots;
  r_old public.spots;
begin
  if tg_op = 'DELETE' then
    delete from public.spots where id = old.id;
    return null;
  end if;

  if tg_table_name = 'venues' then
    r := public.spots_from_venue(new);
    if tg_op = 'UPDATE' then r_old := public.spots_from_venue(old); end if;
  else
    r := public.spots_from_org(new);
    if tg_op = 'UPDATE' then r_old := public.spots_from_org(old); end if;
  end if;

  -- Most profile updates touch columns the spine does not carry.
  if tg_op = 'UPDATE' and r is not distinct from r_old and old.id = new.id then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.id <> new.id then
    delete from public.spots where id = old.id;
  end if;

  r.updated_at := now();
  insert into public.spots values (r.*)
  on conflict (id) do update set
    kind = excluded.kind, roles = excluded.roles, slug = excluded.slug, name = excluded.name,
    category = excluded.category, city_id = excluded.city_id, country_id = excluded.country_id,
    latitude = excluded.latitude, longitude = excluded.longitude,
    safety_gated = excluded.safety_gated, duplicate_of_id = excluded.duplicate_of_id,
    status = excluded.status, created_at = excluded.created_at, updated_at = excluded.updated_at;
  return null;
end;
$$;

revoke execute on function public.spots_from_venue(public.venues) from public, anon, authenticated;
revoke execute on function public.spots_from_org(public.organizations) from public, anon, authenticated;
revoke execute on function public.spots_sync() from public, anon, authenticated;

create trigger trg_spots_sync
  after insert or update or delete on public.venues
  for each row execute function public.spots_sync();

create trigger trg_spots_sync
  after insert or update or delete on public.organizations
  for each row execute function public.spots_sync();

-- Backfill AFTER the triggers exist; the lock above makes the order race-free.
insert into public.spots
select (f).id, (f).kind, (f).roles, (f).slug, (f).name, (f).category, (f).city_id, (f).country_id,
       (f).latitude, (f).longitude, (f).safety_gated, (f).duplicate_of_id, (f).status,
       (f).created_at, now()
from (select public.spots_from_venue(v) f from public.venues v) x
on conflict (id) do nothing;

insert into public.spots
select (f).id, (f).kind, (f).roles, (f).slug, (f).name, (f).category, (f).city_id, (f).country_id,
       (f).latitude, (f).longitude, (f).safety_gated, (f).duplicate_of_id, (f).status,
       (f).created_at, now()
from (select public.spots_from_org(o) f from public.organizations o) x
on conflict (id) do nothing;

create table public.spots_drift_log (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  drift_count integer not null,
  detail jsonb not null
);
alter table public.spots_drift_log enable row level security;
revoke all on public.spots_drift_log from public, anon, authenticated;

create function public.spots_drift_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_detail jsonb;
  v_total integer;
begin
  select jsonb_build_object(
    'missing_venues', (select count(*) from venues v where not exists (select 1 from spots s where s.id = v.id)),
    'missing_orgs',   (select count(*) from organizations o where not exists (select 1 from spots s where s.id = o.id)),
    'orphans',        (select count(*) from spots s
                        where not exists (select 1 from venues v where v.id = s.id)
                          and not exists (select 1 from organizations o where o.id = s.id)),
    'stale_venues',   (select count(*) from venues v join spots s on s.id = v.id
                        where row(s.id, s.kind, s.roles, s.slug, s.name, s.category, s.city_id, s.country_id,
                                  s.latitude, s.longitude, s.safety_gated, s.duplicate_of_id, s.status,
                                  s.created_at, null::timestamptz)::public.spots
                              is distinct from public.spots_from_venue(v)),
    'stale_orgs',     (select count(*) from organizations o join spots s on s.id = o.id
                        where row(s.id, s.kind, s.roles, s.slug, s.name, s.category, s.city_id, s.country_id,
                                  s.latitude, s.longitude, s.safety_gated, s.duplicate_of_id, s.status,
                                  s.created_at, null::timestamptz)::public.spots
                              is distinct from public.spots_from_org(o))
  ) into v_detail;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(v_detail);
  insert into public.spots_drift_log (drift_count, detail) values (v_total, v_detail);
  delete from public.spots_drift_log where run_at < now() - interval '60 days';
  return jsonb_build_object('drift_count', v_total, 'detail', v_detail);
end;
$$;

revoke execute on function public.spots_drift_check() from public, anon, authenticated;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('spots_drift_check', 'Spots spine drift check',
        'Nightly: verifies public.spots exactly mirrors venues + organizations (spots P0). '
        'P1 of the spots unification requires seven clean nights.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"spots_drift_check"}'::jsonb, '45 4 * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('spots_drift_check', '45 4 * * *',
  $cron$ select public.spots_drift_check(); $cron$);

do $verify$
declare
  v jsonb;
  v_spots bigint;
  v_sources bigint;
begin
  v := public.spots_drift_check();
  if (v ->> 'drift_count')::int <> 0 then
    raise exception 'spots drift after backfill: %', v;
  end if;

  select count(*) into v_spots from public.spots;
  select (select count(*) from public.venues) + (select count(*) from public.organizations) into v_sources;
  if v_spots <> v_sources then
    raise exception 'spots has % rows, venues + organizations has %', v_spots, v_sources;
  end if;

  if has_table_privilege('anon', 'public.spots', 'select')
     or has_table_privilege('authenticated', 'public.spots', 'select') then
    raise exception 'spots must not be readable by anon/authenticated in P0';
  end if;
end
$verify$;
