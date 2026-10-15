-- The postal queue tracks missing postal codes, but other enrichment paths can
-- fill a code after a row was enqueued. Do not spend a Photon request on rows
-- whose target field is already populated. In particular, the embedded-postal
-- BEFORE trigger can fill postal_code during an UPDATE of address/country_id,
-- so this must be an AFTER UPDATE trigger without an UPDATE OF column list.
create or replace function public.prune_satisfied_geo_address_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.geo_address_queue
  where entity_type = TG_ARGV[0]
    and entity_id = new.id
    and reason = 'missing_postal';
  return new;
end;
$$;

drop trigger if exists prune_satisfied_geo_address_queue on public.venues;
create trigger prune_satisfied_geo_address_queue
after update on public.venues
for each row
when (nullif(btrim(new.postal_code), '') is not null
  and old.postal_code is distinct from new.postal_code)
execute function public.prune_satisfied_geo_address_queue('venue');

drop trigger if exists prune_satisfied_geo_address_queue on public.events;
create trigger prune_satisfied_geo_address_queue
after update on public.events
for each row
when (nullif(btrim(new.postal_code), '') is not null
  and old.postal_code is distinct from new.postal_code)
execute function public.prune_satisfied_geo_address_queue('event');

drop trigger if exists prune_satisfied_geo_address_queue on public.hotels;
create trigger prune_satisfied_geo_address_queue
after update on public.hotels
for each row
when (nullif(btrim(new.postal_code), '') is not null
  and old.postal_code is distinct from new.postal_code)
execute function public.prune_satisfied_geo_address_queue('hotel');

drop trigger if exists prune_satisfied_geo_address_queue on public.organizations;
create trigger prune_satisfied_geo_address_queue
after update on public.organizations
for each row
when (nullif(btrim(new.postal_code), '') is not null
  and old.postal_code is distinct from new.postal_code)
execute function public.prune_satisfied_geo_address_queue('organization');

-- These rows were already satisfied by another enrichment workflow. Remove
-- only queue state; never change an entity's postal code or coordinates.
delete from public.geo_address_queue q
using public.venues v
where q.entity_type = 'venue' and q.entity_id = v.id
  and q.reason = 'missing_postal'
  and nullif(btrim(v.postal_code), '') is not null;

delete from public.geo_address_queue q
using public.events e
where q.entity_type = 'event' and q.entity_id = e.id
  and q.reason = 'missing_postal'
  and nullif(btrim(e.postal_code), '') is not null;

delete from public.geo_address_queue q
using public.hotels h
where q.entity_type = 'hotel' and q.entity_id = h.id
  and q.reason = 'missing_postal'
  and nullif(btrim(h.postal_code), '') is not null;

delete from public.geo_address_queue q
using public.organizations o
where q.entity_type = 'organization' and q.entity_id = o.id
  and q.reason = 'missing_postal'
  and nullif(btrim(o.postal_code), '') is not null;
