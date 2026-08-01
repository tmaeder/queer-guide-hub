-- ============================================================================
-- Address completeness (1/3): schema + instant derive
-- ----------------------------------------------------------------------------
-- Entities carry a city or a street address but leave state / postal_code /
-- country empty, and nothing fills them on write. Measured on 2026-08-07:
--
--   venues  23,484 live — 22,006 no state · 21,874 no postal · 1,877 no country_id
--   events  39,715 live — 26,840 no country_id (26,800 of them trivially fixable:
--                          events.country holds ISO-2 codes, not names)
--   hotels     325       — no state/postal columns at all
--   orgs     1,703       — link-only spine, no address columns at all
--
-- This migration adds the missing columns and the pure-SQL derive layer that
-- makes country_id / country / city / state fill themselves on every write,
-- with zero network calls. postal_code needs a geocoder and is handled by the
-- async queue drained in migration 3/3.
--
-- Scope note: marketplace_merchants / marketplace_brands / affiliate_partners
-- deliberately get NO address columns. All three already carry organization_id,
-- have zero address source data, and docs/plans/2026-07-26-business-spine-
-- unification.md rules that address/geo "stay per-location". They inherit an
-- address through the spine instead of maintaining three more write paths.
-- personalities is excluded too: its country_id is a BIRTHPLACE, not an address.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.organizations add column if not exists address     text;
alter table public.organizations add column if not exists state       text;
alter table public.organizations add column if not exists postal_code text;

alter table public.hotels        add column if not exists state       text;
alter table public.hotels        add column if not exists postal_code text;

-- events.state already exists; postal_code did not. source-osm-venue already
-- emits a postcode for events that pipeline-normalize was dropping on the floor.
alter table public.events        add column if not exists postal_code text;

comment on column public.organizations.address is
  'Party address for the business spine. Typed satellites (venues/hotels) keep their own per-location address; merchants/brands/affiliate partners inherit this one via organization_id.';
comment on column public.events.postal_code is
  'Backfilled only for upcoming events. Postal codes on past events carry no user value and are deliberately left NULL — do not "complete" them.';

-- ---------------------------------------------------------------------------
-- 2. Partial indexes for the gap RPC + backfill selectors
--    (verified 2026-08-07: these columns hold NULL, never '', so IS NULL is
--    the correct sargable predicate)
-- ---------------------------------------------------------------------------
create index if not exists idx_venues_missing_postal
  on public.venues (id)
  where postal_code is null and duplicate_of_id is null and latitude is not null;

create index if not exists idx_venues_missing_state
  on public.venues (id)
  where state is null and duplicate_of_id is null;

create index if not exists idx_venues_missing_country_id
  on public.venues (id)
  where country_id is null and duplicate_of_id is null;

create index if not exists idx_events_missing_country_id
  on public.events (id)
  where country_id is null and duplicate_of_id is null;

create index if not exists idx_cities_missing_region
  on public.cities (id)
  where region_name is null and duplicate_of_id is null and latitude is not null;

-- ---------------------------------------------------------------------------
-- 3. The derive layer
-- ---------------------------------------------------------------------------
-- One BEFORE trigger function. Two shapes, selected by TG_ARGV[0]:
--   'full'    — venues / events / hotels (have city + country text mirrors)
--   'minimal' — organizations (FK-only spine, no text mirrors)
--
-- THREE RULES, in priority order:
--   1. Explicit input wins. If the caller sets country_id in the same statement,
--      it is never second-guessed.
--   2. Fill what is empty, from the linked city then the ISO-2 country text.
--   3. RE-DERIVE ON RELOCATION. A pure NULL-fill rule is not safe enough here:
--      `UPDATE venues SET country = 'YE'` on a row that already had
--      country_id = US left the FK pointing at the United States, so
--      location_is_high_risk saw "US", safety_gated stayed false, and a venue in
--      a criminalizing country stayed publicly visible. Verified on production
--      before this guard existed. So when city_id or the country text actually
--      CHANGES and the FK was not explicitly set alongside it, the FK (and the
--      dependent state / text mirrors) re-derive to match.
--   Never clobber a good value with NULL: a failed text resolution leaves the
--   existing FK alone.
--
-- WHY IT RECOMPUTES safety_gated ITSELF (load-bearing, do not remove):
-- trg_*_safety_gated is scoped `BEFORE UPDATE OF country_id, city_id`. Column-
-- scoped triggers fire on the columns named in the UPDATE *statement*, not on
-- what a BEFORE trigger mutated. So `UPDATE venues SET country = 'IR'` fires
-- this function (country is in its own scope), which resolves country_id = Iran
-- — but never fires the safety trigger, leaving safety_gated = false on a venue
-- in a criminalizing country. That is an outing risk, not a data-quality nit.
-- Recomputing here closes it. location_is_high_risk is STABLE and costs ~2
-- index lookups.
create or replace function public.derive_entity_geo_address()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_shape           text := coalesce(tg_argv[0], 'full');
  v_upd             boolean := (tg_op = 'UPDATE');
  v_fk_explicit     boolean := false;  -- caller set country_id itself
  v_city_moved      boolean := false;
  v_country_retyped boolean := false;
  v_city_name       text;
  v_city_country_id uuid;
  v_city_region     text;
  v_country_id      uuid;
begin
  if v_upd then
    v_fk_explicit     := new.country_id is distinct from old.country_id;
    v_city_moved      := new.city_id    is distinct from old.city_id;
    if v_shape = 'full' then
      v_country_retyped := new.country  is distinct from old.country;
    end if;
  end if;

  -- (a) country_id from the linked city — most specific wins.
  --     Scalars, not a RECORD: a RECORD left unassigned when city_id IS NULL
  --     raises "record is not assigned yet" the moment a later branch reads it.
  if new.city_id is not null then
    select c.name, c.country_id, c.region_name
      into v_city_name, v_city_country_id, v_city_region
      from public.cities c
     where c.id = new.city_id;

    if v_city_country_id is not null
       and (new.country_id is null or (v_city_moved and not v_fk_explicit)) then
      new.country_id := v_city_country_id;
    end if;
  end if;

  -- (b) country_id from the country text column. venues.country / events.country
  --     hold ISO-2 codes ('DE', 'FR') — venues even has a CHECK enforcing it — so
  --     try code first, then name. This single step resolves ~26,800 events and
  --     ~1,162 venues at write time.
  --
  --     The v_shape test MUST be its own outer IF, not another AND in the
  --     condition below. PL/pgSQL prepares a whole boolean expression as ONE SQL
  --     statement, so `v_shape = 'full' and ... new.country ...` still resolves
  --     new.country for the 'minimal' shape and dies with
  --     'record "new" has no field "country"' on organizations. Boolean
  --     short-circuiting does not save you here. Verified the hard way.
  if v_shape = 'full' then
    if coalesce(btrim(new.country), '') <> ''
       and (new.country_id is null
            or (v_country_retyped and not v_fk_explicit and not v_city_moved)) then
      select co.id into v_country_id
        from public.countries co
       where upper(co.code) = upper(btrim(new.country))
       limit 1;
      if v_country_id is null then
        select co.id into v_country_id
          from public.countries co
         where lower(co.name) = lower(btrim(new.country))
         limit 1;
      end if;
      -- only adopt a successful resolution; unrecognised text must not NULL a good FK
      if v_country_id is not null then
        new.country_id := v_country_id;
      end if;
    end if;
  end if;

  -- (c) state from the city's region. cities.region_name is the single source of
  --     truth for state across every entity table — see migration 2/3, which
  --     backfills it so this branch actually fires.
  if v_city_region is not null
     and (coalesce(btrim(new.state), '') = ''
          or (v_city_moved and new.state is not distinct from old.state)) then
    new.state := v_city_region;
  end if;

  -- (d) text mirrors, only where the columns exist
  if v_shape = 'full' then
    if v_city_name is not null
       and (coalesce(btrim(new.city), '') = ''
            or (v_city_moved and new.city is not distinct from old.city)) then
      new.city := v_city_name;
    end if;
    if new.country_id is not null
       and (coalesce(btrim(new.country), '') = ''
            or (v_upd and not v_country_retyped
                and new.country_id is distinct from old.country_id)) then
      select co.code into new.country
        from public.countries co
       where co.id = new.country_id;
    end if;
  end if;

  -- (e) keep the safety gate honest — see the comment block above
  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);

  return new;
end;
$$;

comment on function public.derive_entity_geo_address() is
  'BEFORE trigger: fills country_id / state / city / country from the linked city and the ISO-2 country text, re-deriving them when the row is relocated, then recomputes safety_gated (trg_*_safety_gated is scoped to country_id/city_id and cannot see a country-text-only update). Explicit caller input always wins; a failed text resolution never NULLs an existing FK.';

-- Trigger names matter: same-timing row triggers fire in NAME order, and
-- trg_*_geo_derive sorts before trg_*_safety_gated ('g' < 's'), so when the
-- safety trigger does fire it already sees the derived country_id.
--
-- latitude/longitude/address are deliberately NOT in these column lists, so
-- coordinate writes cost nothing here and venue_coord_guard_trg's scope
-- (lat, lng, city_id, address) is untouched.
drop trigger if exists trg_venues_geo_derive on public.venues;
create trigger trg_venues_geo_derive
  before insert or update of city_id, country_id, country, city, state
  on public.venues
  for each row execute function public.derive_entity_geo_address('full');

drop trigger if exists trg_events_geo_derive on public.events;
create trigger trg_events_geo_derive
  before insert or update of city_id, country_id, country, city, state
  on public.events
  for each row execute function public.derive_entity_geo_address('full');

drop trigger if exists trg_hotels_geo_derive on public.hotels;
create trigger trg_hotels_geo_derive
  before insert or update of city_id, country_id, country, city, state
  on public.hotels
  for each row execute function public.derive_entity_geo_address('full');

drop trigger if exists trg_organizations_geo_derive on public.organizations;
create trigger trg_organizations_geo_derive
  before insert or update of city_id, country_id, state
  on public.organizations
  for each row execute function public.derive_entity_geo_address('minimal');

-- ---------------------------------------------------------------------------
-- 4. Async work queue for postal_code (the one field a geocoder must supply)
-- ---------------------------------------------------------------------------
-- A queue table rather than a per-row net.http_post dispatch guarded by a
-- session GUC. The GUC guard is fail-OPEN: every bulk write path (both commit
-- RPCs, the CMS editor, 12 dedup merge cores, org_spine_backfill, every future
-- scripts/data-quality/*.mjs) would have to remember to set it, and one
-- omission is a pg_net burst against a disk-constrained DB. Enqueueing is
-- fail-SAFE: a bulk statement just adds rows and the drain pops at a fixed
-- rate regardless. It also gives the admin panel its counters for free.
-- pgmq is not an option here — the extension was CASCADE-dropped
-- (see 20260801070000_repair_cron_failures.sql).
create table if not exists public.geo_address_queue (
  entity_type     text        not null check (entity_type in ('venue','event','hotel','organization')),
  entity_id       uuid        not null,
  reason          text        not null default 'missing_postal',
  latitude        numeric,
  longitude       numeric,
  attempts        smallint    not null default 0,
  last_error      text,
  enqueued_at     timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index if not exists idx_geo_address_queue_ready
  on public.geo_address_queue (next_attempt_at)
  where attempts < 4;

alter table public.geo_address_queue enable row level security;

-- Service-role only. No anon/authenticated grants: this is operator plumbing,
-- and the RLS-on-with-zero-policies shape is the deliberate closed default.
revoke all on public.geo_address_queue from anon, authenticated;

comment on table public.geo_address_queue is
  'Work list for reverse-geocoding postal_code (and state, where no city region exists). Drained by the geo_address_drain cron; enqueued by triggers and by backfill scripts.';

-- ---------------------------------------------------------------------------
-- 5. Operator visibility
-- ---------------------------------------------------------------------------
create or replace function public.geo_address_gap_counts()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'venues', (
      select jsonb_build_object(
        'live',              count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.venues where duplicate_of_id is null
    ),
    'events', (
      select jsonb_build_object(
        'live',              count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null
                                                 and (end_date >= current_date
                                                      or (end_date is null and start_date >= current_date)))
      ) from public.events where duplicate_of_id is null
    ),
    'hotels', (
      select jsonb_build_object(
        'live',              count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.hotels
    ),
    'organizations', (
      select jsonb_build_object(
        'live',              count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.organizations where duplicate_of_id is null
    ),
    'cities', (
      select jsonb_build_object(
        'live',                count(*),
        'missing_region_name', count(*) filter (where region_name is null),
        -- Actionable work only: a 'tmp-' slug is a placeholder stub, which the
        -- backfill deliberately skips, so counting them here would overstate
        -- the gap by ~1,800 and make a finished job look stuck.
        'geocodable_gap',      count(*) filter (
                                 where region_name is null
                                   and latitude is not null
                                   and (slug is null or slug not like 'tmp-%'))
      ) from public.cities where duplicate_of_id is null
    ),
    'queue', (
      select jsonb_build_object(
        'depth',            count(*) filter (where attempts < 4),
        'parked',           count(*) filter (where attempts >= 4),
        'oldest_enqueued_at', min(enqueued_at) filter (where attempts < 4)
      ) from public.geo_address_queue
    )
  );
$$;

comment on function public.geo_address_gap_counts() is
  'Address-completeness gap matrix per entity type plus queue health. Powers GeoAddressQualityPanel on /admin/quality.';

revoke all on function public.geo_address_gap_counts() from public, anon;
grant execute on function public.geo_address_gap_counts() to authenticated, service_role;
