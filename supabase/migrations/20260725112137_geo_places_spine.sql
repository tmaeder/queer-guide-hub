-- Geo Hierarchy Unification — P0: the geo_places spine + typed satellite profiles.
--
-- Class-table inheritance: one narrow spine row per geo entity (continent, region,
-- country, city, village, landmark) with the containment hierarchy modeled as
-- parent_id + composite-FK type checks, plus per-type satellite tables carrying the
-- type-specific columns. Existing UUIDs are preserved on backfill (next migration),
-- so every later FK re-point is a constraint swap, not a data rewrite.
--
-- Design doc: docs/plans/2026-07-25-geo-hierarchy-unification.md

-- ---------------------------------------------------------------------------
-- Spine
-- ---------------------------------------------------------------------------
create table public.geo_places (
  id                uuid primary key default gen_random_uuid(),
  place_type        text not null,
  parent_id         uuid references public.geo_places(id) on delete restrict,
  parent_type       text,
  -- Derived ancestors, maintained by trigger, never user-writable. Same UUIDs as
  -- countries.id / cities.id so location_is_high_risk() works unchanged.
  country_id        uuid references public.geo_places(id) on delete set null,
  city_id           uuid references public.geo_places(id) on delete set null,
  name              text not null,
  name_normalized   text,
  name_en           text,
  name_de           text,
  name_i18n         jsonb not null default '{}'::jsonb,
  description       text,
  description_i18n  jsonb not null default '{}'::jsonb,
  slug              text,
  code              text,
  latitude          numeric,
  longitude         numeric,
  image_url         text,
  image_metadata    jsonb,
  image_flagged     boolean not null default false,
  curated_image_url text,
  duplicate_of_id   uuid references public.geo_places(id) on delete set null,
  safety_gated      boolean not null default false,
  seo_indexable     boolean not null default true,
  data_source       text,
  last_refreshed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint geo_places_type_chk check (place_type in ('continent','region','country','city','village','landmark')),
  constraint geo_places_name_nonempty_chk check (btrim(name) <> ''),
  constraint geo_places_slug_format_chk check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' or slug ~ '^[a-z0-9]$'),
  -- Continents/regions have no slugs today; every routable type must.
  constraint geo_places_slug_required_chk check (place_type in ('continent','region') or slug is not null),
  constraint geo_places_latlng_bounds_chk check (
    (latitude is null or (latitude >= -90 and latitude <= 90))
    and (longitude is null or (longitude >= -180 and longitude <= 180))
  ),
  -- parent_id and parent_type travel together so the composite FK below is enforced.
  constraint geo_places_parent_pair_chk check ((parent_id is null) = (parent_type is null)),
  constraint geo_places_parent_required_chk check (place_type = 'continent' or parent_id is not null),
  -- The taxonomy: each type may only hang under its legal parent type. A village
  -- under a Paris city can therefore never resolve to a Berlin country.
  constraint geo_places_hierarchy_chk check (
    case place_type
      when 'continent' then parent_id is null
      when 'region'    then parent_type = 'continent'
      when 'country'   then parent_type in ('continent','region')
      when 'city'      then parent_type = 'country'
      when 'village'   then parent_type = 'city'
      when 'landmark'  then parent_type in ('city','village')
    end
  ),
  constraint geo_places_id_type_uniq unique (id, place_type),
  constraint geo_places_parent_type_fk foreign key (parent_id, parent_type)
    references public.geo_places (id, place_type)
);

comment on table public.geo_places is
  'Unified geo spine: one row per geographic entity (continent/region/country/city/village/landmark). UUIDs match the legacy typed tables during the strangler migration. Type-specific columns live in geo_*_profiles satellites.';
comment on column public.geo_places.country_id is 'Derived ancestor (trigger-maintained). For a country row this is its own id.';
comment on column public.geo_places.city_id is 'Derived ancestor (trigger-maintained). For a city row this is its own id.';

create unique index geo_places_type_slug_uniq on public.geo_places (place_type, slug) where slug is not null;
create index idx_geo_places_parent on public.geo_places (parent_id);
create index idx_geo_places_country on public.geo_places (country_id);
create index idx_geo_places_city on public.geo_places (city_id);
create index idx_geo_places_type on public.geo_places (place_type);
create index idx_geo_places_dup on public.geo_places (duplicate_of_id) where duplicate_of_id is not null;
create index idx_geo_places_gated on public.geo_places (id) where safety_gated;

-- ---------------------------------------------------------------------------
-- Derivation trigger: parent_type + derived ancestors + landmark safety gating
-- ---------------------------------------------------------------------------
create or replace function public.geo_places_derive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p record;
begin
  if new.parent_id is not null then
    select gp.place_type, gp.country_id, gp.city_id
      into p
      from public.geo_places gp
     where gp.id = new.parent_id;
    if not found then
      raise exception 'geo_places: parent % not found', new.parent_id;
    end if;
    new.parent_type := p.place_type;
  else
    new.parent_type := null;
  end if;

  case new.place_type
    when 'continent' then new.country_id := null; new.city_id := null;
    when 'region'    then new.country_id := null; new.city_id := null;
    when 'country'   then new.country_id := new.id; new.city_id := null;
    when 'city'      then new.country_id := p.country_id; new.city_id := new.id;
    when 'village'   then new.country_id := p.country_id; new.city_id := p.city_id;
    when 'landmark'  then new.country_id := p.country_id; new.city_id := p.city_id;
  end case;

  -- Safety layer: landmarks are gated like venues/events/orgs. Other geo types
  -- (country/city pages) stay public by design.
  if new.place_type = 'landmark' then
    new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_geo_places_derive
  before insert or update on public.geo_places
  for each row execute function public.geo_places_derive();

-- Re-derive descendants when a node's ancestry changes (move of a subtree).
create or replace function public.geo_places_cascade_derive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.country_id is distinct from old.country_id
     or new.city_id is distinct from old.city_id then
    -- Self-assignment fires trg_geo_places_derive on each child, which recurses
    -- down the (max depth 5) tree and stops as soon as nothing changes.
    update public.geo_places set parent_id = parent_id where parent_id = new.id;
  end if;
  return null;
end;
$$;

create trigger trg_geo_places_cascade
  after update on public.geo_places
  for each row execute function public.geo_places_cascade_derive();

-- ---------------------------------------------------------------------------
-- Satellite: country profile
-- ---------------------------------------------------------------------------
create table public.geo_country_profiles (
  place_id   uuid primary key,
  place_type text not null default 'country',
  capital text,
  population bigint,
  area_km2 numeric,
  currency text,
  languages text[],
  timezone text,
  government_type text,
  capital_coordinates jsonb,
  national_anthem text,
  national_day date,
  calling_code text,
  internet_tld text,
  driving_side text,
  major_religions text[],
  gdp_usd bigint,
  gdp_per_capita_usd integer,
  human_development_index numeric(3,3),
  life_expectancy numeric(4,1),
  literacy_rate numeric(5,2),
  climate_zones text[],
  natural_resources text[],
  unesco_sites text[],
  major_industries text[],
  exports text[],
  imports text[],
  visa_requirements jsonb default '{}'::jsonb,
  flag_emoji text,
  national_symbols jsonb default '{}'::jsonb,
  airport_codes text[],
  major_airports text[],
  lgbti_criminalization jsonb default '{}'::jsonb,
  lgbti_expression_restrictions jsonb default '{}'::jsonb,
  lgbti_association_restrictions jsonb default '{}'::jsonb,
  lgbti_constitutional_protection jsonb default '{}'::jsonb,
  lgbti_goods_services_protection jsonb default '{}'::jsonb,
  lgbti_health_protection jsonb default '{}'::jsonb,
  lgbti_education_protection jsonb default '{}'::jsonb,
  lgbti_bullying_protection jsonb default '{}'::jsonb,
  lgbti_employment_protection jsonb default '{}'::jsonb,
  lgbti_housing_protection jsonb default '{}'::jsonb,
  lgbti_hate_crime_law jsonb default '{}'::jsonb,
  lgbti_incitement_prohibition jsonb default '{}'::jsonb,
  lgbti_conversion_therapy_regulation text,
  lgbti_same_sex_unions text,
  lgbti_adoption_rights text,
  lgbti_intersex_protection text,
  lgbti_gender_recognition jsonb default '{}'::jsonb,
  lgbti_data_last_updated timestamptz,
  equality_score integer,
  wolfram_enriched_at timestamptz,
  last_synced_at timestamptz,
  editorial_hook text,
  editorial_long text,
  content_completeness_score smallint,
  enrichment_status jsonb not null default '{}'::jsonb,
  shell_status text not null default 'real',
  constraint geo_country_profiles_type_chk check (place_type = 'country'),
  constraint geo_country_profiles_place_fk foreign key (place_id, place_type)
    references public.geo_places (id, place_type) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Satellite: city profile
-- ---------------------------------------------------------------------------
create table public.geo_city_profiles (
  place_id   uuid primary key,
  place_type text not null default 'city',
  region_name text,
  population bigint,
  is_capital boolean default false,
  is_major_city boolean default false,
  timezone text,
  elevation_m integer,
  climate_type text,
  founded_year integer,
  area_km2 numeric,
  local_language text,
  official_website text,
  mayor text,
  postal_codes text[],
  area_codes text[],
  sister_cities text[],
  notable_landmarks text[],
  economy_sectors text[],
  universities text[],
  transportation_info jsonb default '{}'::jsonb,
  demographics jsonb default '{}'::jsonb,
  cost_of_living jsonb default '{}'::jsonb,
  lgbt_friendly_rating integer,
  best_time_to_visit text,
  local_customs text,
  airport_codes text[],
  major_airport_code text,
  wolfram_enriched_at timestamptz,
  last_synced_at timestamptz,
  historical_names jsonb not null default '[]'::jsonb,
  editorial_hook text,
  trust_score smallint not null default 0,
  completeness_score smallint not null default 0,
  last_verified_at timestamptz,
  shell_status text not null default 'real',
  needs_attention boolean not null default false,
  field_provenance jsonb not null default '{}'::jsonb,
  enrichment_status jsonb not null default '{}'::jsonb,
  safety_notes text,
  social_links jsonb not null default '{}'::jsonb,
  constraint geo_city_profiles_type_chk check (place_type = 'city'),
  constraint geo_city_profiles_place_fk foreign key (place_id, place_type)
    references public.geo_places (id, place_type) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Satellite: village profile
-- ---------------------------------------------------------------------------
create table public.geo_village_profiles (
  place_id   uuid primary key,
  place_type text not null default 'village',
  history text,
  images text[] default '{}'::text[],
  boundaries jsonb,
  notable_landmarks text[] default '{}'::text[],
  tags text[] default '{}'::text[],
  website text,
  featured boolean default false,
  created_by uuid,
  updated_by uuid,
  geometry extensions.geometry(MultiPolygon, 4326),
  editorial_hook text,
  completeness_score smallint not null default 0,
  trust_score smallint not null default 0,
  shell_status text not null default 'real',
  needs_attention boolean not null default false,
  field_provenance jsonb not null default '{}'::jsonb,
  enrichment_status jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  social_links jsonb not null default '{}'::jsonb,
  constraint geo_village_profiles_type_chk check (place_type = 'village'),
  constraint geo_village_profiles_place_fk foreign key (place_id, place_type)
    references public.geo_places (id, place_type) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Satellite: landmark profile (parks, beaches, landmarks — the new type)
-- ---------------------------------------------------------------------------
create table public.geo_landmark_profiles (
  place_id   uuid primary key,
  place_type text not null default 'landmark',
  landmark_kind text not null default 'landmark',
  address text,
  website text,
  opening_hours jsonb default '{}'::jsonb,
  accessibility_notes text,
  images text[] default '{}'::text[],
  boundaries jsonb,
  tags text[] default '{}'::text[],
  featured boolean default false,
  created_by uuid,
  updated_by uuid,
  needs_review boolean not null default false,
  constraint geo_landmark_profiles_kind_chk check (landmark_kind in ('park','beach','monument','memorial','building','viewpoint','landmark','other')),
  constraint geo_landmark_profiles_type_chk check (place_type = 'landmark'),
  constraint geo_landmark_profiles_place_fk foreign key (place_id, place_type)
    references public.geo_places (id, place_type) on delete cascade
);

comment on table public.geo_landmark_profiles is
  'First-class parks/beaches/landmarks. needs_review=true for rows seeded from the legacy notable_landmarks text[] until an admin approves them.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.geo_places enable row level security;
alter table public.geo_country_profiles enable row level security;
alter table public.geo_city_profiles enable row level security;
alter table public.geo_village_profiles enable row level security;
alter table public.geo_landmark_profiles enable row level security;

-- Safety layer: gated rows (landmarks in criminalizing countries) are only
-- visible to logged-in users, mirroring venues/events/organizations.
create policy "Public read geo_places" on public.geo_places
  for select using (not safety_gated or (select auth.uid()) is not null);
create policy "Admin write geo_places" on public.geo_places
  for all to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]))
  with check (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

create policy "Public read geo_country_profiles" on public.geo_country_profiles for select using (true);
create policy "Admin write geo_country_profiles" on public.geo_country_profiles
  for all to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]))
  with check (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

create policy "Public read geo_city_profiles" on public.geo_city_profiles for select using (true);
create policy "Admin write geo_city_profiles" on public.geo_city_profiles
  for all to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]))
  with check (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

create policy "Public read geo_village_profiles" on public.geo_village_profiles for select using (true);
create policy "Admin write geo_village_profiles" on public.geo_village_profiles
  for all to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]))
  with check (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

-- Landmark profiles inherit the spine's gating via join; the profile alone
-- carries no location, but hide ungated reads anyway by requiring the spine row.
create policy "Public read geo_landmark_profiles" on public.geo_landmark_profiles
  for select using (
    exists (
      select 1 from public.geo_places gp
      where gp.id = place_id
        and (not gp.safety_gated or (select auth.uid()) is not null)
    )
  );
create policy "Admin write geo_landmark_profiles" on public.geo_landmark_profiles
  for all to authenticated
  using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]))
  with check (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));
