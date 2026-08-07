-- ============================================================================
-- Fill-side automation, keyless sources — overhaul Phase 6 Wave A
-- ----------------------------------------------------------------------------
-- The drain side of the pipeline is fully automated; the fill side is not:
-- venues staged in the last 30 days = 6 rows (live, 2026-08-07). The venue DAG
-- nominally carries foursquare/google/tomtom source nodes, but those are
-- keyless-skip in this deployment — effectively nothing feeds venues.
--
-- Wave A schedules the three KEYLESS sources (zero API cost, byte-idempotent
-- via payload_hash/idempotency_key indexes on ingestion_staging):
--   vn-fill-osm         daily  02:50  source-osm-venue   (Overpass, UA + wall-
--                                     clock bounded in-function, shuffled cities)
--   city-fill-geonames  weekly Wed 01:30 source-geonames (cities15000, capped)
--   vn-fill-restrooms   weekly Thu 03:40 source-refuge-restrooms
-- Keyed sources (Foursquare / Google / TomTom) stay admin-triggered only.
--
-- caps: geonames limit 1500 + min_population 15000 keeps staging_pending_review
-- far below the CI hard-fail (5000) while the hourly drains absorb; repeat rows
-- dedupe at the unique indexes.
--
-- Wave B (DAG-schedule retirement + news/mp/ev fill crons) is deliberately NOT
-- here: it is gated on 7 days of stale_pending_by_entity + per-source volume
-- evidence. Adding fetch crons for sources a scheduled DAG still fetches would
-- double the upstream API load for nothing.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'vn_fill_osm',
  'Fill venues from OSM/Overpass',
  'Daily 02:50: source-osm-venue stages LGBTQ+-tagged venues from Overpass (keyless, wall-clock bounded, shuffled city rotation). Fill-side counterpart of the vn-drain-* stage machine. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','vn-fill-osm','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-osm-venue',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":120}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '50 2 * * *'
),
(
  'city_fill_geonames',
  'Fill cities from GeoNames',
  'Weekly Wed 01:30: source-geonames stages cities15000 rows (population ≥ 15k, hard limit 1500/run). Byte-idempotent restages are absorbed by the payload_hash unique index; the cap keeps pending_review far below the CI 5000 hard-fail.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','city-fill-geonames','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-geonames',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"dataset":"cities15000","min_population":15000,"limit":1500}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  '30 1 * * 3'
),
(
  'vn_fill_restrooms',
  'Fill safe-restroom venues from Refuge',
  'Weekly Thu 03:40: source-refuge-restrooms stages accessible/gender-neutral restroom locations (free API, paged, capped).',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','vn-fill-restrooms','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-refuge-restrooms',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":100,"max_pages":5}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '40 3 * * 4'
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['vn-fill-osm','city-fill-geonames','vn-fill-restrooms'] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug IN ('vn_fill_osm','city_fill_geonames','vn_fill_restrooms');
