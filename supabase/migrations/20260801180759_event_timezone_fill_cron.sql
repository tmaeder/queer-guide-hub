-- Register run_event_timezone_fill as nightly maintenance.
--
-- Split from 20260801180253 (which defines the function) because that version was
-- already recorded in schema_migrations — appending to it would mean `db push` skips
-- the file and a rebuilt database would get the function without its cron.
--
-- Runs at :15, after event_geo_fill (:10), so it only sees what the city-linked path
-- could not resolve. The historical residue was drained by hand on 2026-08-01
-- (timezone nulls 7,058 -> 570), so this exists to cover new ingest, not a backlog.

select cron.schedule(
  'event_timezone_fill',
  '15 3 * * *',
  $$SELECT public.run_event_timezone_fill(300)$$
);

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  ('event_timezone_fill', 'event_timezone_fill',
   'Fills events.timezone from the nearest timezone-bearing city within 250km (validated 99.7% against known-timezone events), falling back to countries.timezone only for single-timezone countries.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"cron","command":"SELECT public.run_event_timezone_fill(300)","jobname":"event_timezone_fill"}'::jsonb,
   '15 3 * * *')
on conflict (slug) do update set
  enabled = excluded.enabled,
  action = excluded.action,
  schedule = excluded.schedule,
  description = excluded.description,
  updated_at = now();
