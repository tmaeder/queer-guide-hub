-- Safety layer: gate the `cruising` venue category to logged-in users, everywhere.
--
-- WHY -----------------------------------------------------------------------
-- `safety_gated` has been purely GEOGRAPHIC since 20260623160000:
-- set_entity_safety_gated() computes location_is_high_risk(country_id, city_id)
-- and nothing else. `venues` carries no is_adult / content_rating column either
-- (adult gating exists only for marketplace_items, personalities, unified_tags).
--
-- So a cruising spot in any NON-criminalizing country was fully public:
--   * sitemap-venues.xml           — filters only safety_gated=eq.false → Google-indexed
--   * anon RLS read                — "(not safety_gated) or auth.uid() is not null"
--   * search_documents / autocomplete
--   * public map
-- Measured on prod 2026-08-30: 112 of 113 cruising venues were safety_gated=false.
--
-- Cruising spots are overwhelmingly public infrastructure and third-party private
-- property — motorway rest areas, streets, industrial estates, toilets inside named
-- businesses. Publishing an indexed page naming a real business as a sex location
-- is a different and worse act than listing a bar, and it exposes the people who
-- use it. CLAUDE.md already records that cruising/sauna are never bulk-accepted and
-- infer_venue_category scores cruising 0.21 against an 0.85 auto-apply bar.
--
-- This is a PREREQUISITE for ingesting cruising spots from any source.
--
-- DESIGN --------------------------------------------------------------------
-- 1. ONE predicate, venue_is_safety_gated(country_id, city_id, category), so the
--    trigger and the country-recompute cannot drift. Same discipline as
--    location_is_high_risk being "single source of truth for the threshold".
-- 2. A VENUES-SPECIFIC trigger function. set_entity_safety_gated() is shared by six
--    triggers (venues, events, organizations, milestones, hotels, queer_villages)
--    and only `venues` has a `category` column — adding new.category there would
--    raise at runtime on the other five.
-- 3. The venues trigger is RE-SCOPED to include `category`. It was
--    `before insert or update of country_id, city_id`, and a column-scoped trigger
--    fires on the columns named in the UPDATE statement — so
--    `UPDATE venues SET category='cruising'` would NOT have fired it and the row
--    would have stayed ungated. This is the same trap as the safety_gated column
--    scope documented for derive_entity_geo_address().
-- 4. recompute_safety_gated_for_country() is restated from its LIVE definition
--    (read via pg_get_functiondef on prod), NOT from the newest migration file:
--    the live body has venues/events/organizations/HOTELS/QUEER_VILLAGES, while
--    20260721130632_milestones_spine.sql shows venues/events/organizations/MILESTONES.
--    Restating from the file would have dropped hotel + village gating and
--    resurrected a milestones branch that is no longer live.
--    Without this change the nightly ILGA cron would silently CLEAR the cruising
--    gate for every venue in any country whose legal status changed.

-- ---------------------------------------------------------------------------
-- 1. Shared predicate
-- ---------------------------------------------------------------------------
create or replace function public.venue_is_safety_gated(
  p_country_id uuid,
  p_city_id    uuid,
  p_category   text
)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- coalesce is load-bearing: category is nullable, and `false or NULL` is NULL,
  -- which would violate the NOT NULL on venues.safety_gated.
  select public.location_is_high_risk(p_country_id, p_city_id)
      or coalesce(p_category = 'cruising', false);
$$;

comment on function public.venue_is_safety_gated(uuid, uuid, text) is
  'True when a venue must be hidden from anonymous sessions: high-risk country OR category = cruising. Single source of truth — used by trg_venues_safety_gated and recompute_safety_gated_for_country.';

-- ---------------------------------------------------------------------------
-- 2. Venues-specific trigger function + re-scoped trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_venue_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := public.venue_is_safety_gated(new.country_id, new.city_id, new.category);
  return new;
end;
$$;

comment on function public.set_venue_safety_gated() is
  'BEFORE trigger for venues only. set_entity_safety_gated() stays in place for the five entities that have no category column.';

drop trigger if exists trg_venues_safety_gated on public.venues;
create trigger trg_venues_safety_gated
  before insert or update of country_id, city_id, category on public.venues
  for each row execute function public.set_venue_safety_gated();

-- ---------------------------------------------------------------------------
-- 3. Country recompute — venues branch must preserve the category gate.
--    Restated from the LIVE prod definition; only the venues branch changes.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_safety_gated_for_country(p_country_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  update public.venues v
     set safety_gated = public.venue_is_safety_gated(v.country_id, v.city_id, v.category)
   where (v.country_id = p_country_id
          or v.city_id in (select id from public.cities where country_id = p_country_id))
     and v.safety_gated is distinct from public.venue_is_safety_gated(v.country_id, v.city_id, v.category);

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
-- 4. Backfill existing cruising venues.
--    Batched at 300: every venue UPDATE walks trg_search_documents_venue /
--    the search_documents safety mirror, and a statement timeout is a full
--    rollback. Same cap as run_city_safety_backfill / run_needs_attention_recompute.
-- ---------------------------------------------------------------------------
do $$
declare
  v_batch int;
  v_total int := 0;
begin
  loop
    with pick as (
      select id from public.venues
       where category = 'cruising'
         and safety_gated is distinct from true
       limit 300
    )
    update public.venues v
       set safety_gated = true
      from pick
     where v.id = pick.id;

    get diagnostics v_batch = row_count;
    exit when v_batch = 0;
    v_total := v_total + v_batch;
  end loop;

  raise notice 'cruising safety gate backfill: % venues gated', v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Post-condition — fail the migration rather than ship a half-applied gate.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ungated int;
  v_scoped  boolean;
begin
  select count(*) into v_ungated
    from public.venues where category = 'cruising' and not safety_gated;
  if v_ungated > 0 then
    raise exception 'cruising gate backfill incomplete: % ungated cruising venues remain', v_ungated;
  end if;

  -- The trigger must fire on category, or a re-categorisation silently escapes the gate.
  select exists (
    select 1
      from pg_trigger t
      join unnest(t.tgattr) a(attnum) on true
      join pg_attribute att on att.attrelid = t.tgrelid and att.attnum = a.attnum
     where t.tgrelid = 'public.venues'::regclass
       and t.tgname  = 'trg_venues_safety_gated'
       and att.attname = 'category'
  ) into v_scoped;
  if not v_scoped then
    raise exception 'trg_venues_safety_gated is not scoped to the category column';
  end if;
end;
$$;
