-- Register the events geo backfill runners as nightly maintenance.
--
-- The historical residue was drained by hand on 2026-08-01 (city_id 27,618 -> 658 null,
-- coordinates 36,408 -> 659 null, country_id 21,682 -> 6 null). These crons exist to keep
-- newly-ingested events linked, not to chew through a backlog, so the batches are small.
--
-- Both runners stamp enrichment_status, so a row that cannot be resolved is attempted once
-- and then skipped forever -- the sweep terminates instead of retrying the same residue
-- every night. Batch size is capped because each events UPDATE fires
-- trg_search_documents_event; a 6,000-row call was measured hitting the statement timeout.
--
-- Scheduled at :05/:10 past 03:00, before event_tags_backfill (20 3) and the trust/
-- completeness recomputes, so downstream scorers see the freshly linked geo.

select cron.schedule(
  'event_city_link',
  '5 3 * * *',
  $$SELECT public.run_event_city_link(500)$$
);

select cron.schedule(
  'event_geo_fill',
  '10 3 * * *',
  $$SELECT public.run_event_geo_fill(500)$$
);

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  ('event_city_link', 'event_city_link',
   'Resolves events.city_id from (country, city text). Writing city_id cascades to country_id/state/city/country via trg_events_geo_derive and to currency via trg_events_set_currency.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"cron","command":"SELECT public.run_event_city_link(500)","jobname":"event_city_link"}'::jsonb,
   '5 3 * * *'),
  ('event_geo_fill', 'event_geo_fill',
   'Fills event latitude/longitude from the linked city centroid (stamped derived:city_centroid in field_provenance) and timezone from cities.timezone, falling back to countries.timezone only for single-timezone countries.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"cron","command":"SELECT public.run_event_geo_fill(500)","jobname":"event_geo_fill"}'::jsonb,
   '10 3 * * *')
on conflict (slug) do update set
  enabled = excluded.enabled,
  action = excluded.action,
  schedule = excluded.schedule,
  description = excluded.description,
  updated_at = now();
