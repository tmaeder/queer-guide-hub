-- Organizations were the least-covered geo table, and one live trigger had no
-- migration at all. Both closed here.
--
-- MEASURED ON PROD (2026-09-05, 6,110 live organizations):
--   5,391 with no coordinates      5,909 with no postal_code
--   3,482 with no state              165 with no country_id
--
-- 1. NO ENQUEUE TRIGGER. 20260807100300 created trg_venues_geo_enqueue,
--    trg_hotels_geo_enqueue and trg_events_geo_enqueue but no organization
--    equivalent, even though 'organization' is a valid entity_type in the
--    geo_address_queue CHECK and backfill-venue-cities already handles it.
--    Confirmed by the queue's own contents: it held only venue and event rows.
--    So geo_address_gap_counts() reported an organizations postal gap that no
--    trigger could ever close -- only the hourly run_geo_address_enqueue_backlog
--    reached them, in batches of 400 across four entity types. A gap that is
--    reported but structurally unreachable reads as a backlog when it is
--    actually a missing mechanism.
--
-- 2. NO NULL-ISLAND GUARD. venues, events and hotels carry
--    coerce_null_island_coords; organizations does not.
--
-- 3. NOT IN geo_integrity_violations. The view has seven arms covering
--    villages, venues, events and hotels; organizations appear in none, despite
--    being a row in geo_address_gap_counts. Measured: 2 organizations have a
--    city_id whose country contradicts their country_id.
--
-- coerce_null_island_coords ALREADY EXISTS IN PRODUCTION and has no migration
-- file anywhere in this repo -- it was applied out of band (the raw
-- Management-API path records no history). It is committed here verbatim so a
-- rebuild from zero does not silently lose it. This is a no-op against the live
-- database and the whole point of writing it down.
--
-- Only exact (0,0) is coerced. lng=0 alone is Greenwich and lat=0 alone is the
-- equator; both are legitimate.

create or replace function public.coerce_null_island_coords()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.latitude = 0 and new.longitude = 0 then
    new.latitude := null;
    new.longitude := null;
  end if;
  return new;
end;
$$;

comment on function public.coerce_null_island_coords() is
  'BEFORE trigger: (0,0) is a failed geocode, not a location. Existed in production from 2026-06 with no migration file; committed 20270602143713.';

drop trigger if exists trg_organizations_null_island on public.organizations;
create trigger trg_organizations_null_island
  before insert or update of latitude, longitude on public.organizations
  for each row
  execute function public.coerce_null_island_coords();

-- Mirrors trg_venues_geo_enqueue. organizations has no duplicate_of_id column,
-- so there is no dedup predicate to carry across.
drop trigger if exists trg_organizations_geo_enqueue on public.organizations;
create trigger trg_organizations_geo_enqueue
  after insert or update of latitude, longitude, city_id on public.organizations
  for each row
  when (new.postal_code is null
        and new.latitude is not null and new.longitude is not null)
  execute function public.enqueue_geo_address('organization');

-- Re-stated in full: CREATE OR REPLACE VIEW cannot add a union arm in place,
-- and re-stating it without `with (security_invoker = true)` would silently
-- drop invoker semantics and run the view as its owner.
create or replace view public.geo_integrity_violations
with (security_invoker = true) as
select 'village_country_mismatch' as violation, 'village' as entity_type, qv.id as entity_id,
       qv.name as entity_name, c.country_id as expected_id, qv.country_id as actual_id
from public.queer_villages qv
join public.cities c on c.id = qv.city_id
where qv.country_id is distinct from c.country_id
union all
select 'venue_city_country_mismatch', 'venue', v.id, v.name, c.country_id, v.country_id
from public.venues v
join public.cities c on c.id = v.city_id
where v.country_id is not null and v.country_id is distinct from c.country_id
union all
select 'venue_village_city_mismatch', 'venue', v.id, v.name, qv.city_id, v.city_id
from public.venues v
join public.queer_villages qv on qv.id = v.queer_village_id
where v.city_id is not null and v.city_id is distinct from qv.city_id
union all
select 'event_city_country_mismatch', 'event', e.id, e.title, c.country_id, e.country_id
from public.events e
join public.cities c on c.id = e.city_id
where e.country_id is not null and e.country_id is distinct from c.country_id
union all
select 'event_village_city_mismatch', 'event', e.id, e.title, qv.city_id, e.city_id
from public.events e
join public.queer_villages qv on qv.id = e.queer_village_id
where e.city_id is not null and e.city_id is distinct from qv.city_id
union all
select 'hotel_city_country_mismatch', 'hotel', h.id, h.name, c.country_id, h.country_id
from public.hotels h
join public.cities c on c.id = h.city_id
where h.country_id is not null and h.country_id is distinct from c.country_id
union all
select 'hotel_village_city_mismatch', 'hotel', h.id, h.name, qv.city_id, h.city_id
from public.hotels h
join public.queer_villages qv on qv.id = h.queer_village_id
where h.city_id is not null and h.city_id is distinct from qv.city_id
union all
select 'organization_city_country_mismatch', 'organization', o.id, o.name, c.country_id, o.country_id
from public.organizations o
join public.cities c on c.id = o.city_id
where o.country_id is not null and o.country_id is distinct from c.country_id;

grant select on public.geo_integrity_violations to authenticated;

-- Seed the queue for organizations that the new trigger will never fire for,
-- because it only fires on write. Bounded: the drain is 25 rows / 5 min, and
-- run_geo_address_enqueue_backlog already tops it up hourly.
insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
select 'organization', o.id, 'missing_postal', o.latitude, o.longitude
from public.organizations o
where o.postal_code is null
  and o.latitude is not null and o.longitude is not null
limit 500
on conflict (entity_type, entity_id) do nothing;

do $$
declare
  v_trigger int;
  v_arm     int;
begin
  select count(*) into v_trigger from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'organizations'
     and t.tgname in ('trg_organizations_geo_enqueue', 'trg_organizations_null_island');
  if v_trigger <> 2 then
    raise exception 'expected both organization geo triggers, found %', v_trigger;
  end if;

  select count(*) into v_arm from public.geo_integrity_violations
   where violation = 'organization_city_country_mismatch';
  raise notice 'organization integrity arm live, % current violations', v_arm;
end $$;
