-- Milestones spine (1/3): promote queer-history milestones ("Meilensteine") to a
-- first-class content type. Data model ported from tools/person-db (localStorage
-- curation tool); ~110 curated rows are imported by
-- scripts/data-quality/import-milestones.ts (NOT by this migration — the import
-- needs live country/city/personality lookups + a warning report).
--
-- Linking model: direct country_id/city_id FKs (a milestone happens somewhere)
-- plus ONE polymorphic milestone_links junction for personalities / events /
-- venues / news / organizations, so milestones are no longer subordinate to
-- personalities.
--
-- Safety layer: milestones ARE safety-gated like venues/events/organizations
-- (user decision 2026-07-21) — anon sessions in criminalizing / death-penalty
-- countries don't see that country's milestones; logged-in users see everything.

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  -- Date model: `date` is always populated; year-precision stores Jan 1 and
  -- `date_precision` says how much of it is real. Same for date_end.
  date date not null,
  date_precision text not null default 'day'
    check (date_precision in ('day','month','year')),
  date_end date,
  date_end_precision text
    check (date_end_precision is null or date_end_precision in ('day','month','year')),
  location text,
  region text,
  -- Original free-text place names from the curation tool are kept even when
  -- city_id/country_id resolve (e.g. "Schottland" collapses to GB but the
  -- sub-nation nuance stays renderable).
  city_name text,
  country_name text,
  city_id uuid references public.cities(id) on delete set null,
  country_id uuid references public.countries(id) on delete set null,
  category text
    check (category is null or category in (
      'uprising-movement','law-equality','law-decriminalization',
      'law-criminalization','depathologization','persecution-destruction','other')),
  impact text not null default 'neutral'
    check (impact in ('positive','neutral','negative')),
  significance smallint not null default 3 check (significance between 1 and 5),
  sources jsonb not null default '[]'::jsonb,     -- [{label, url?}]
  image_url text,
  tags text[] not null default '{}',              -- unified_tags slugs
  status text not null default 'published'
    check (status in ('draft','published','archived')),
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  seo_indexable boolean not null default false,
  is_featured boolean not null default false,
  quality_score smallint,
  safety_gated boolean not null default false,
  duplicate_of_id uuid references public.milestones(id) on delete set null,
  field_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.milestones is
  'Queer-history milestones (Stonewall, decriminalizations, marriage equality, repression events). First-class content type; public route /history.';

create index if not exists idx_milestones_date        on public.milestones(date);
create index if not exists idx_milestones_status_date on public.milestones(status, date);
create index if not exists idx_milestones_country     on public.milestones(country_id);
create index if not exists idx_milestones_city        on public.milestones(city_id);
create index if not exists idx_milestones_category    on public.milestones(category);
create index if not exists idx_milestones_impact      on public.milestones(impact);
create index if not exists idx_milestones_tags        on public.milestones using gin(tags);
create index if not exists idx_milestones_safety_gated on public.milestones(id) where safety_gated;

-- updated_at touch trigger (same shape as organizations_touch_updated_at)
create or replace function public.milestones_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_milestones_touch_updated_at on public.milestones;
create trigger trg_milestones_touch_updated_at
  before update on public.milestones
  for each row execute function public.milestones_touch_updated_at();

-- Safety-layer flag: recompute on location change (shared trigger fn from
-- 20260623160000_safety_layer_entity_gating.sql).
drop trigger if exists trg_milestones_safety_gated on public.milestones;
create trigger trg_milestones_safety_gated
  before insert or update of country_id, city_id on public.milestones
  for each row execute function public.set_entity_safety_gated();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.milestones enable row level security;
grant select on public.milestones to anon, authenticated;
grant all on public.milestones to service_role;

drop policy if exists milestones_public_read on public.milestones;
create policy milestones_public_read on public.milestones
  for select using (
    status = 'published'
    and ((not safety_gated) or (select auth.uid()) is not null)
  );

drop policy if exists milestones_admin_all on public.milestones;
create policy milestones_admin_all on public.milestones
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- milestone_links — polymorphic junction to the other entity spines
-- ---------------------------------------------------------------------------
create table if not exists public.milestone_links (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('personality','event','venue','news','organization')),
  entity_id uuid not null,
  role text,               -- e.g. "Beteiligte am Aufstand, Wegbereiterin"
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (milestone_id, entity_type, entity_id)
);

create index if not exists idx_milestone_links_entity
  on public.milestone_links(entity_type, entity_id);

-- Polymorphic → no FK on entity_id; validate the target exists at write time.
-- Later target deletion is tolerated (get_milestone joins drop the row).
create or replace function public.milestone_links_check_target()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_exists boolean;
begin
  case new.entity_type
    when 'personality'  then select exists(select 1 from public.personalities  where id = new.entity_id) into v_exists;
    when 'event'        then select exists(select 1 from public.events         where id = new.entity_id) into v_exists;
    when 'venue'        then select exists(select 1 from public.venues         where id = new.entity_id) into v_exists;
    when 'news'         then select exists(select 1 from public.news_articles  where id = new.entity_id) into v_exists;
    when 'organization' then select exists(select 1 from public.organizations  where id = new.entity_id) into v_exists;
    else v_exists := false;
  end case;
  if not v_exists then
    raise exception 'milestone_links: % target % does not exist', new.entity_type, new.entity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_milestone_links_check_target on public.milestone_links;
create trigger trg_milestone_links_check_target
  before insert or update of entity_type, entity_id on public.milestone_links
  for each row execute function public.milestone_links_check_target();

alter table public.milestone_links enable row level security;
grant select on public.milestone_links to anon, authenticated;
grant all on public.milestone_links to service_role;

drop policy if exists milestone_links_public_read on public.milestone_links;
create policy milestone_links_public_read on public.milestone_links
  for select using (
    exists (
      select 1 from public.milestones m
      where m.id = milestone_id
        and m.status = 'published'
        and ((not m.safety_gated) or (select auth.uid()) is not null)
    )
  );

drop policy if exists milestone_links_admin_all on public.milestone_links;
create policy milestone_links_admin_all on public.milestone_links
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Safety layer wiring: include milestones in the country-level recompute
-- (fired by trg_countries_recompute_safety_gated / nightly ILGA cron) and in
-- the anon-safe gated-existence check used by detail-page fallbacks.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_safety_gated_for_country(p_country_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  update public.venues v
     set safety_gated = public.location_is_high_risk(v.country_id, v.city_id)
   where (v.country_id = p_country_id
          or v.city_id in (select id from public.cities where country_id = p_country_id))
     and v.safety_gated is distinct from public.location_is_high_risk(v.country_id, v.city_id);

  update public.events e
     set safety_gated = public.location_is_high_risk(e.country_id, e.city_id)
   where (e.country_id = p_country_id
          or e.city_id in (select id from public.cities where country_id = p_country_id))
     and e.safety_gated is distinct from public.location_is_high_risk(e.country_id, e.city_id);

  update public.organizations o
     set safety_gated = public.location_is_high_risk(o.country_id, o.city_id)
   where (o.country_id = p_country_id
          or o.city_id in (select id from public.cities where country_id = p_country_id))
     and o.safety_gated is distinct from public.location_is_high_risk(o.country_id, o.city_id);

  update public.milestones m
     set safety_gated = public.location_is_high_risk(m.country_id, m.city_id)
   where (m.country_id = p_country_id
          or m.city_id in (select id from public.cities where country_id = p_country_id))
     and m.safety_gated is distinct from public.location_is_high_risk(m.country_id, m.city_id);
end;
$$;

create or replace function public.gated_entity_exists(p_entity_type text, p_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_entity_type
    when 'venue' then exists (
      select 1 from public.venues
      where slug = p_slug and safety_gated and duplicate_of_id is null and closed_at is null)
    when 'event' then exists (
      select 1 from public.events where slug = p_slug and safety_gated)
    when 'organization' then exists (
      select 1 from public.organizations where slug = p_slug and safety_gated and status = 'active')
    when 'milestone' then exists (
      select 1 from public.milestones
      where slug = p_slug and safety_gated and status = 'published' and duplicate_of_id is null)
    else false
  end;
$$;

grant execute on function public.gated_entity_exists(text, text) to anon, authenticated, service_role;
