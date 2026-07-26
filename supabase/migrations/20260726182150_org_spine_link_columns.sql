-- ============================================================
-- Business Spine Unification — Phase A: schema
--
-- organizations becomes the universal business-party spine. Detail tables
-- link UP via nullable organization_id (pattern live for venues /
-- news_sources / marketplace_merchants since 20260620082831). This adds
-- the three missing links (hotels, affiliate_partners, marketplace_brands),
-- brings hotels into the safety-gating layer, and pins the roles vocabulary.
--
-- No data change here; backfill runs batched via RPCs (20260801100200).
-- ============================================================

-- ── 1. link columns (nullable, no default → no table rewrite) ──────────────
alter table public.hotels
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.affiliate_partners
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.marketplace_brands
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_hotels_organization_id on public.hotels(organization_id);
create index if not exists idx_marketplace_brands_organization_id on public.marketplace_brands(organization_id);
-- One payout config per org (today's model; drop if multi-vertical partners appear).
create unique index if not exists idx_affiliate_partners_organization_id
  on public.affiliate_partners(organization_id) where organization_id is not null;
-- No unique on hotels/venues/merchants: chains and multi-provider integrations.

-- ── 2. hotels join the safety layer (mirrors 20260623160000) ───────────────
alter table public.hotels
  add column if not exists safety_gated boolean not null default false;
create index if not exists idx_hotels_safety_gated on public.hotels(id) where safety_gated;

drop trigger if exists trg_hotels_safety_gated on public.hotels;
create trigger trg_hotels_safety_gated
  before insert or update of country_id, city_id on public.hotels
  for each row execute function public.set_entity_safety_gated();

-- Extend the country-level recompute to cover hotels.
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
end;
$$;

-- Backfill only the high-risk subset (column defaults false; hotels are not in
-- search_documents, so this bulk pass fires no search sync triggers).
with hr as (
  select id from public.countries
  where public.location_is_high_risk(id, null)
)
update public.hotels h
   set safety_gated = true
 where (h.country_id in (select id from hr)
        or h.city_id in (select c.id from public.cities c where c.country_id in (select id from hr)))
   and not h.safety_gated;

-- Anon sessions no longer see gated hotels (same shape as venues/events/orgs).
drop policy if exists "Public read hotels" on public.hotels;
create policy "Public read hotels" on public.hotels
  for select using ((not safety_gated) or (select auth.uid()) is not null);

-- ── 3. roles vocabulary (additive; NOT VALID = no scan, rollback lever) ────
-- Existing live values: venue, publisher, seller, support (+ possible legacy
-- organizer/community from the spine's design comment). Validate in a later
-- migration after checking SELECT DISTINCT unnest(roles).
alter table public.organizations drop constraint if exists organizations_roles_known;
alter table public.organizations add constraint organizations_roles_known
  check (roles <@ array['venue','publisher','seller','support','hotel',
                        'affiliate_partner','brand','organizer','community']::text[])
  not valid;

-- ── 4. org link suggestion queue ───────────────────────────────────────────
-- Deliberately NOT dedup_review_queue: that is a same-type merge-pair queue
-- whose approve path runs merge cores. Adoption ("this hotel belongs to this
-- org") is a link decision, not a merge — it gets its own tiny queue with its
-- own decision RPC (decide_org_adoption, 20260801100200).
create table if not exists public.org_link_suggestions (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null check (entity_type in
                    ('venue','hotel','merchant','affiliate_partner','brand')),
  entity_id       uuid not null,                    -- polymorphic; validated on decide
  organization_id uuid references public.organizations(id) on delete cascade,
  confidence      numeric(3,2) not null default 0.50,
  reason          text not null default 'backfill', -- e.g. core_token_no_geo, despace_no_geo, queer_brand
  source          text not null default 'org_unification',
  payload         jsonb not null default '{}'::jsonb, -- {entity:{name,domain,city}, org:{name,domain,city}}
  status          text not null default 'open' check (status in ('open','approved','rejected','superseded')),
  reviewer_id     uuid,
  reviewer_note   text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

-- One open suggestion per entity — makes backfill re-runs idempotent.
create unique index if not exists org_link_suggestions_open_entity
  on public.org_link_suggestions (entity_type, entity_id) where status = 'open';
create index if not exists org_link_suggestions_open_idx
  on public.org_link_suggestions (status, created_at) where status = 'open';

alter table public.org_link_suggestions enable row level security;
-- Admin-only surface; decisions go through decide_org_adoption (SECURITY DEFINER).
grant select on public.org_link_suggestions to authenticated;
grant all on public.org_link_suggestions to service_role;
drop policy if exists org_link_suggestions_admin_read on public.org_link_suggestions;
create policy org_link_suggestions_admin_read on public.org_link_suggestions
  for select using (public.is_admin(auth.uid()));
