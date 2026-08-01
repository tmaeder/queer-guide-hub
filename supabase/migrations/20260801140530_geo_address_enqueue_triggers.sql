-- Recovered from supabase_migrations.schema_migrations.statements.
-- Applied to production via MCP apply_migration, which stamps the version from its
-- own call timestamp — so it landed at 20260801140530 (2026-08-01), sorting BELOW the
-- 20260807* files this work intended, and left a remote-only version. db push then
-- skipped ENTIRELY and no merged migration applied. This file restores the pairing.

create or replace function public.enqueue_geo_address()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type text := tg_argv[0];
begin
  insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
  values (v_type, new.id, 'missing_postal', new.latitude, new.longitude)
  on conflict (entity_type, entity_id) do nothing;
  return null;
end;
$$;

comment on function public.enqueue_geo_address() is
  'AFTER trigger: adds a row to geo_address_queue when it has coordinates but no postal_code. ON CONFLICT DO NOTHING makes bulk statements idempotent and cheap - this is the fail-safe alternative to a per-row net.http_post dispatch.';

drop trigger if exists trg_venues_geo_enqueue on public.venues;
create trigger trg_venues_geo_enqueue
  after insert or update of latitude, longitude, city_id on public.venues
  for each row
  when (new.duplicate_of_id is null
        and new.postal_code is null
        and new.latitude is not null and new.longitude is not null)
  execute function public.enqueue_geo_address('venue');

drop trigger if exists trg_hotels_geo_enqueue on public.hotels;
create trigger trg_hotels_geo_enqueue
  after insert or update of latitude, longitude, city_id on public.hotels
  for each row
  when (new.postal_code is null
        and new.latitude is not null and new.longitude is not null)
  execute function public.enqueue_geo_address('hotel');

drop trigger if exists trg_events_geo_enqueue on public.events;
create trigger trg_events_geo_enqueue
  after insert or update of latitude, longitude, city_id on public.events
  for each row
  when (new.duplicate_of_id is null
        and new.postal_code is null
        and new.latitude is not null and new.longitude is not null
        and new.start_date >= now())
  execute function public.enqueue_geo_address('event');
