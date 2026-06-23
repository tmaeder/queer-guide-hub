-- Safety layer (1/3): gate venues / events / organizations in high-risk countries
-- to logged-in users only.
--
-- "High risk" = the country is criminalizing (lgbti_criminalization.legal = false)
-- OR imposes the death penalty (lgbti_criminalization.death_penalty ~ 'yes'). This
-- mirrors the canonical high/critical tiers in src/hooks/useTripSafety.ts and
-- src/lib/lgbtLegality.ts. The "moderate" tier (low equality score but not
-- criminalizing) is deliberately NOT gated.
--
-- Mechanism: a denormalized boolean `safety_gated` on each entity (cheaper than a
-- per-row EXISTS in RLS — the map returns thousands of rows), derived from one
-- shared predicate so the threshold is a single point of change. RLS then hides
-- gated rows from anonymous (anon) sessions; authenticated sessions see everything.

-- ---------------------------------------------------------------------------
-- Shared predicate (single source of truth for the threshold)
-- ---------------------------------------------------------------------------
create or replace function public.location_is_high_risk(p_country_id uuid, p_city_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  with resolved as (
    -- Prefer the entity's own country; fall back to the city's country
    -- (some rows carry a city but no country_id).
    select coalesce(
      p_country_id,
      (select ci.country_id from public.cities ci where ci.id = p_city_id)
    ) as country_id
  )
  select exists (
    select 1
    from public.countries co, resolved r
    where co.id = r.country_id
      and (
        (co.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(co.lgbti_criminalization->>'death_penalty','')) = 'yes'
      )
  );
$$;

comment on function public.location_is_high_risk(uuid, uuid) is
  'True when the resolved country (own country_id, else city''s country) is criminalizing or death-penalty. Single source of truth for the safety-layer gate.';

-- ---------------------------------------------------------------------------
-- Denormalized flag + index on each gated entity
-- ---------------------------------------------------------------------------
alter table public.venues        add column if not exists safety_gated boolean not null default false;
alter table public.events        add column if not exists safety_gated boolean not null default false;
alter table public.organizations add column if not exists safety_gated boolean not null default false;

create index if not exists idx_venues_safety_gated        on public.venues(id)        where safety_gated;
create index if not exists idx_events_safety_gated         on public.events(id)        where safety_gated;
create index if not exists idx_organizations_safety_gated  on public.organizations(id) where safety_gated;

-- ---------------------------------------------------------------------------
-- Keep the flag fresh: recompute whenever an entity's location changes.
-- ---------------------------------------------------------------------------
create or replace function public.set_entity_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);
  return new;
end;
$$;

drop trigger if exists trg_venues_safety_gated on public.venues;
create trigger trg_venues_safety_gated
  before insert or update of country_id, city_id on public.venues
  for each row execute function public.set_entity_safety_gated();

drop trigger if exists trg_events_safety_gated on public.events;
create trigger trg_events_safety_gated
  before insert or update of country_id, city_id on public.events
  for each row execute function public.set_entity_safety_gated();

drop trigger if exists trg_organizations_safety_gated on public.organizations;
create trigger trg_organizations_safety_gated
  before insert or update of country_id, city_id on public.organizations
  for each row execute function public.set_entity_safety_gated();

-- ---------------------------------------------------------------------------
-- Keep the flag fresh: recompute a whole country when its legal status changes
-- (nightly wf-import-ilga-data cron). Set-based, IS DISTINCT FROM guard avoids
-- no-op writes (each entity UPDATE fires search_documents_sync). Legal data
-- changes are rare so the occasional bulk pass is acceptable.
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
end;
$$;

create or replace function public.trg_country_risk_changed()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  perform public.recompute_safety_gated_for_country(new.id);
  return null;
end;
$$;

drop trigger if exists trg_countries_recompute_safety_gated on public.countries;
create trigger trg_countries_recompute_safety_gated
  after update of lgbti_criminalization on public.countries
  for each row
  when (old.lgbti_criminalization is distinct from new.lgbti_criminalization)
  execute function public.trg_country_risk_changed();

-- ---------------------------------------------------------------------------
-- Backfill: only the high-risk subset needs flipping (column defaults false).
-- ---------------------------------------------------------------------------
with hr as (
  select id from public.countries
  where (lgbti_criminalization->>'legal') = 'false'
     or lower(coalesce(lgbti_criminalization->>'death_penalty','')) = 'yes'
),
hr_cities as (
  select id from public.cities where country_id in (select id from hr)
)
update public.venues v set safety_gated = true
 where not v.safety_gated
   and (v.country_id in (select id from hr) or v.city_id in (select id from hr_cities));

with hr as (
  select id from public.countries
  where (lgbti_criminalization->>'legal') = 'false'
     or lower(coalesce(lgbti_criminalization->>'death_penalty','')) = 'yes'
),
hr_cities as (
  select id from public.cities where country_id in (select id from hr)
)
update public.events e set safety_gated = true
 where not e.safety_gated
   and (e.country_id in (select id from hr) or e.city_id in (select id from hr_cities));

with hr as (
  select id from public.countries
  where (lgbti_criminalization->>'legal') = 'false'
     or lower(coalesce(lgbti_criminalization->>'death_penalty','')) = 'yes'
),
hr_cities as (
  select id from public.cities where country_id in (select id from hr)
)
update public.organizations o set safety_gated = true
 where not o.safety_gated
   and (o.country_id in (select id from hr) or o.city_id in (select id from hr_cities));

-- ---------------------------------------------------------------------------
-- RLS: hide gated rows from anonymous sessions only.
-- (select auth.uid()) is the Supabase-recommended initplan-cached form.
-- ---------------------------------------------------------------------------
drop policy if exists "Public read access for venues" on public.venues;
create policy "Public read access for venues" on public.venues
  for select using ((not safety_gated) or (select auth.uid()) is not null);

drop policy if exists "Events public read access" on public.events;
create policy "Events public read access" on public.events
  for select using ((not safety_gated) or (select auth.uid()) is not null);

drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read on public.organizations
  for select using (status = 'active' and ((not safety_gated) or (select auth.uid()) is not null));
