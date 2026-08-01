-- ============================================================================
-- Address completeness (1/3): schema + instant derive
-- ============================================================================

alter table public.organizations add column if not exists address     text;
alter table public.organizations add column if not exists state       text;
alter table public.organizations add column if not exists postal_code text;

alter table public.hotels        add column if not exists state       text;
alter table public.hotels        add column if not exists postal_code text;

alter table public.events        add column if not exists postal_code text;

comment on column public.organizations.address is
  'Party address for the business spine. Typed satellites (venues/hotels) keep their own per-location address; merchants/brands/affiliate partners inherit this one via organization_id.';
comment on column public.events.postal_code is
  'Backfilled only for upcoming events. Postal codes on past events carry no user value and are deliberately left NULL - do not "complete" them.';

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

create or replace function public.derive_entity_geo_address()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_shape           text := coalesce(tg_argv[0], 'full');
  v_city_name       text;
  v_city_country_id uuid;
  v_city_region     text;
  v_country_id      uuid;
begin
  if new.city_id is not null then
    select c.name, c.country_id, c.region_name
      into v_city_name, v_city_country_id, v_city_region
      from public.cities c
     where c.id = new.city_id;

    if new.country_id is null then
      new.country_id := v_city_country_id;
    end if;
  end if;

  if v_shape = 'full' and new.country_id is null
     and coalesce(btrim(new.country), '') <> '' then
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
    new.country_id := v_country_id;
  end if;

  if coalesce(btrim(new.state), '') = '' and v_city_region is not null then
    new.state := v_city_region;
  end if;

  if v_shape = 'full' then
    if coalesce(btrim(new.city), '') = '' and v_city_name is not null then
      new.city := v_city_name;
    end if;
    if coalesce(btrim(new.country), '') = '' and new.country_id is not null then
      select co.code into new.country
        from public.countries co
       where co.id = new.country_id;
    end if;
  end if;

  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);

  return new;
end;
$$;

comment on function public.derive_entity_geo_address() is
  'BEFORE trigger: NULL-fills country_id / state / city / country from the linked city and the ISO-2 country text, then recomputes safety_gated (trg_*_safety_gated cannot see a country-text-only update). Never overwrites existing values.';

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

revoke all on public.geo_address_queue from anon, authenticated;

comment on table public.geo_address_queue is
  'Work list for reverse-geocoding postal_code (and state, where no city region exists). Drained by the geo_address_drain cron; enqueued by triggers and by backfill scripts.';

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
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.venues where duplicate_of_id is null
    ),
    'events', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null
                                                 and (end_date >= current_date
                                                      or (end_date is null and start_date >= current_date)))
      ) from public.events where duplicate_of_id is null
    ),
    'hotels', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.hotels
    ),
    'organizations', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.organizations where duplicate_of_id is null
    ),
    'cities', (
      select jsonb_build_object(
        'live',                count(*),
        'missing_region_name', count(*) filter (where region_name is null),
        'geocodable_gap',      count(*) filter (where region_name is null and latitude is not null)
      ) from public.cities where duplicate_of_id is null
    ),
    'queue', (
      select jsonb_build_object(
        'depth',              count(*) filter (where attempts < 4),
        'parked',             count(*) filter (where attempts >= 4),
        'oldest_enqueued_at', min(enqueued_at) filter (where attempts < 4)
      ) from public.geo_address_queue
    )
  );
$$;

comment on function public.geo_address_gap_counts() is
  'Address-completeness gap matrix per entity type plus queue health. Powers GeoAddressQualityPanel on /admin/quality.';

revoke all on function public.geo_address_gap_counts() from public, anon;
grant execute on function public.geo_address_gap_counts() to authenticated, service_role;
