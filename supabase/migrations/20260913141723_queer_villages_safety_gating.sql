-- queer_villages joins the safety layer. Every other place-adjacent entity
-- (venues/events/organizations/hotels/milestones/guides) that can sit in a
-- criminalizing/death-penalty country is gated via safety_gated + RLS; villages
-- never got the column, so "Public read villages" stayed USING (true).
-- Confirmed on prod: exactly one row is high-risk today (Heera Mandi, Lahore,
-- PK — lgbti_criminalization.legal=false), seo_indexable=true, fully public.

-- ---------------------------------------------------------------------------
-- 1. Denormalized flag + index, same shape as venues/events/organizations/hotels.
-- ---------------------------------------------------------------------------
alter table public.queer_villages add column if not exists safety_gated boolean not null default false;
create index if not exists idx_queer_villages_safety_gated on public.queer_villages(id) where safety_gated;

-- ---------------------------------------------------------------------------
-- 2. Keep it fresh: per-row trigger reuses the shared set_entity_safety_gated()
--    fn (20260623160000); city_id/country_id are NOT NULL on queer_villages,
--    so location_is_high_risk always resolves directly.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_queer_villages_safety_gated on public.queer_villages;
create trigger trg_queer_villages_safety_gated
  before insert or update of country_id, city_id on public.queer_villages
  for each row execute function public.set_entity_safety_gated();

-- ---------------------------------------------------------------------------
-- 3. Country-level bulk recompute (nightly ILGA import path) — add villages
--    alongside the existing venues/events/organizations/hotels block.
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

  update public.hotels h
     set safety_gated = public.location_is_high_risk(h.country_id, h.city_id)
   where (h.country_id = p_country_id
          or h.city_id in (select id from public.cities where country_id = p_country_id))
     and h.safety_gated is distinct from public.location_is_high_risk(h.country_id, h.city_id);

  update public.queer_villages qv
     set safety_gated = public.location_is_high_risk(qv.country_id, qv.city_id)
   where (qv.country_id = p_country_id
          or qv.city_id in (select id from public.cities where country_id = p_country_id))
     and qv.safety_gated is distinct from public.location_is_high_risk(qv.country_id, qv.city_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Backfill the current high-risk subset (column defaults false).
-- ---------------------------------------------------------------------------
with hr as (
  select id from public.countries
  where (lgbti_criminalization->>'legal') = 'false'
     or lower(coalesce(lgbti_criminalization->>'death_penalty','')) = 'yes'
),
hr_cities as (
  select id from public.cities where country_id in (select id from hr)
)
update public.queer_villages qv set safety_gated = true
 where not qv.safety_gated
   and (qv.country_id in (select id from hr) or qv.city_id in (select id from hr_cities));

-- ---------------------------------------------------------------------------
-- 5. RLS: hide gated rows from anonymous sessions only.
-- ---------------------------------------------------------------------------
drop policy if exists "Public read villages" on public.queer_villages;
create policy "Public read villages" on public.queer_villages
  for select using ((not safety_gated) or (select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- 6. search_documents mirror — queer_village docs use entity_type
--    'queer_village' (search_documents_index_villages). Extend the shared
--    trigger fn (20260623160001, last replaced 20260726150300 for guides).
-- ---------------------------------------------------------------------------
create or replace function public.set_search_document_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := case new.entity_type
    when 'venue'        then coalesce((select safety_gated from public.venues        where id = new.entity_id), false)
    when 'event'        then coalesce((select safety_gated from public.events        where id = new.entity_id), false)
    when 'organization' then coalesce((select safety_gated from public.organizations where id = new.entity_id), false)
    when 'milestone'    then coalesce((select safety_gated from public.milestones    where id = new.entity_id), false)
    when 'guide'        then coalesce((select safety_gated from public.guides        where id = new.entity_id), false)
    when 'queer_village' then coalesce((select safety_gated from public.queer_villages where id = new.entity_id), false)
    else false
  end;
  return new;
end;
$$;

-- Backfill existing docs.
update public.search_documents sd set safety_gated = true
 where sd.safety_gated is distinct from true
   and sd.entity_type = 'queer_village'
   and sd.entity_id in (select id from public.queer_villages where safety_gated);

-- ---------------------------------------------------------------------------
-- 7. gated_count_for_location: add villages to the "Sign in to view N places"
--    aggregate (20260623160002; previously venues/events/organizations only).
-- ---------------------------------------------------------------------------
create or replace function public.gated_count_for_location(p_country_id uuid default null, p_city_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'venues', (
      select count(*) from public.venues v
      where v.safety_gated
        and v.duplicate_of_id is null
        and v.closed_at is null
        and (p_country_id is null or v.country_id = p_country_id)
        and (p_city_id    is null or v.city_id    = p_city_id)
    ),
    'events', (
      select count(*) from public.events e
      where e.safety_gated
        and (p_country_id is null or e.country_id = p_country_id)
        and (p_city_id    is null or e.city_id    = p_city_id)
    ),
    'organizations', (
      select count(*) from public.organizations o
      where o.safety_gated
        and o.status = 'active'
        and (p_country_id is null or o.country_id = p_country_id)
        and (p_city_id    is null or o.city_id    = p_city_id)
    ),
    'queer_villages', (
      select count(*) from public.queer_villages qv
      where qv.safety_gated
        and qv.duplicate_of_id is null
        and (p_country_id is null or qv.country_id = p_country_id)
        and (p_city_id    is null or qv.city_id    = p_city_id)
    )
  );
$$;

comment on function public.gated_count_for_location(uuid, uuid) is
  'Aggregate-only count of safety-gated venues/events/organizations/queer_villages for a city or country. Safe for anon — returns no row data.';

-- ---------------------------------------------------------------------------
-- 8. gated_entity_exists: add the queer_village branch (20260623160002, last
--    replaced 20260726150300 for guides) — lets the village detail page show
--    a sign-in gate instead of a bare 404 for a direct link to a gated village.
-- ---------------------------------------------------------------------------
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
    when 'guide' then exists (
      select 1 from public.guides
      where slug = p_slug and safety_gated and status = 'published')
    when 'queer_village' then exists (
      select 1 from public.queer_villages
      where slug = p_slug and safety_gated and duplicate_of_id is null)
    else false
  end;
$$;
