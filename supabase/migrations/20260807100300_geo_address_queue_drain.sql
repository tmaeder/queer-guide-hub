-- ============================================================================
-- Address completeness (3/3): enqueue + drain postal_code
-- ----------------------------------------------------------------------------
-- state / country_id are pure-SQL derivations (migration 1/3). postal_code is
-- the one field that genuinely needs a geocoder, so it goes through
-- geo_address_queue and a paced drain rather than a per-row net.http_post.
--
-- The enqueue triggers are AFTER, so derive_entity_geo_address has already run
-- and we never queue a row it just satisfied. They are also scoped to the
-- columns that can newly make a row eligible (coords / city link), so ordinary
-- edits do not churn the queue.
-- ============================================================================

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
  'AFTER trigger: adds a row to geo_address_queue when it has coordinates but no postal_code. ON CONFLICT DO NOTHING makes bulk statements idempotent and cheap — this is the fail-safe alternative to a per-row net.http_post dispatch.';

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

-- Events: UPCOMING only. Postal codes on past events carry no user value and
-- there are 39,437 of them — queueing those would be 12 hours of geocoding for
-- nothing. Deliberate scope limit, not an oversight.
drop trigger if exists trg_events_geo_enqueue on public.events;
create trigger trg_events_geo_enqueue
  after insert or update of latitude, longitude, city_id on public.events
  for each row
  when (new.duplicate_of_id is null
        and new.postal_code is null
        and new.latitude is not null and new.longitude is not null
        and new.start_date >= now())
  execute function public.enqueue_geo_address('event');

-- ---------------------------------------------------------------------------
-- Drain cron
-- ---------------------------------------------------------------------------
-- Secret comes from the vault, never a literal (see
-- 20260703170000_rotate_webhook_secret_to_vault.sql).
select cron.unschedule('geo_address_drain')
where exists (select 1 from cron.job where jobname = 'geo_address_drain');

select cron.schedule(
  'geo_address_drain',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'postal', 'batch_size', 25)
  );
  $cmd$
);

-- Register in admin_automations in the SAME migration that schedules the job.
-- pipeline_hygiene_stats().unregistered_cron_count fails the pipeline-health CI
-- on unregistered crons, and registration is what brings the job under the
-- sync_automations_to_cron() kill switch.
insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
select
  'geo_address_drain',
  'geo_address_drain',
  'Drains geo_address_queue: reverse-geocodes venue/hotel/event coordinates via Photon to fill '
    || 'postal_code (and state where the city has no region). Steady-state only — a handful of rows '
    || 'a day from new inserts; the historical 21k-venue sweep runs from '
    || 'scripts/data-quality/backfill-venue-postal.mjs, not from this cron.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', 'geo_address_drain',
                     'command', (select command from cron.job where jobname = 'geo_address_drain')),
  '*/5 * * * *'
where not exists (
  select 1 from public.admin_automations a
  where a.slug = 'geo_address_drain' or a.action->>'jobname' = 'geo_address_drain'
);
