-- ============================================================================
-- Wave B step 1: fill crons for marketplace / events / news / community —
-- STARTS the 7-day soak clocks for DAG-start retirement (playbook B1)
-- ----------------------------------------------------------------------------
-- These crons take over the FETCH role the scheduled DAGs perform today.
-- For the next ~7 days both paths fetch (deliberate, bounded overlap): the
-- byte-idempotent staging indexes absorb duplicates, and the overlap window
-- IS the measurement — retirement requires fill volume ≥ DAG-fetch volume
-- with a flat stale_pending_by_entity sentinel
-- (docs/plans/2026-08-pipeline-overhaul-wave-b.md, gate dashboard).
--
-- Bodies mirror the live DAG source-node configs (pipeline_definitions,
-- captured 2026-08-08): awin 200 / shopify 50 / etsy 50 / ohmyfantasy
-- shopify-public {max_pages 40, batch 250}; news {max_feeds_per_run 15,
-- sinceHours 24, maxArticles 100, use_eligibility_rpc}. ohmyfantasy gets its
-- own fill because it is NOT in marketplace_merchants (verified live) — the
-- DAG node is its only fetcher today. source-eventbrite is keyless-skip safe
-- (MissingCredentialsError → skippedResponse). source-ticketmaster's LGBTQ+
-- prefilter is default-ON since P3a. source-community-submissions drains ALL
-- content types in one call (it maps content_type → target_table itself), so
-- ONE cron replaces the per-DAG community source nodes; email_ingestions is
-- dormant (no writer) and deliberately gets no fill.
-- Kill switch for any of these = disable its admin_automations row.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
SELECT
  v.slug, v.name, v.description, 'system', true,
  '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname',v.jobname,'command',v.command),
  v.schedule
FROM (VALUES
  ('mp_fill_awin', 'Fill marketplace from AWIN', 'Daily 03:40 (Wave B soak): source-awin datafeed fetch — takes over the marketplace DAG''s fetch role; retirement gated on 7-day volume evidence.', 'mp-fill-awin', '40 3 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-awin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":200}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  ('mp_fill_shopify', 'Fill marketplace from Shopify', 'Daily 03:42 (Wave B soak): source-shopify keyed fetch (keyless-skip safe).', 'mp-fill-shopify', '42 3 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-shopify',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":50}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  ('mp_fill_etsy', 'Fill marketplace from Etsy', 'Daily 03:44 (Wave B soak): source-etsy keyed fetch (keyless-skip safe).', 'mp-fill-etsy', '44 3 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-etsy',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":50}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  ('mp_fill_ohmyfantasy', 'Fill marketplace from ohmyfantasy (shopify-public)', 'Daily 03:46 (Wave B soak): the DAG node was this shop''s ONLY fetcher (not in marketplace_merchants).', 'mp-fill-ohmyfantasy', '46 3 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-shopify-public',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"max_pages":40,"batch_size":250,"shop_domain":"ohmyfantasy.com","source_slug":"ohmyfantasy"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  ('ev_fill_eventbrite', 'Fill events from Eventbrite', '6-hourly :30 (Wave B soak): keyless-skip safe until EVENTBRITE_OAUTH_TOKEN is set.', 'ev-fill-eventbrite', '30 */6 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-eventbrite',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  ('ev_fill_ticketmaster', 'Fill events from Ticketmaster', '6-hourly :35 (Wave B soak): LGBTQ+ keyword prefilter default-ON (P3a) — junk dies at the door.', 'ev-fill-ticketmaster', '35 */6 * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-ticketmaster',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  ('news_fill_rss', 'Fill news from RSS', 'Hourly :30 (Wave B soak): bounded fetch (max 15 feeds/run — the HTTP 546 fix) offset from the DAG''s :00 tick; on retirement this becomes the only news fetch.', 'news-fill-rss', '30 * * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-rss-news',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"max_feeds_per_run":15,"sinceHours":24,"maxArticles":100,"use_eligibility_rpc":true}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  ('cm_fill_community', 'Drain community submissions to staging', 'Hourly :20 (Wave B soak): source-community-submissions promotes ALL content types (it maps content_type → target_table itself) — replaces the per-DAG community source nodes when events/venue DAGs retire. email_ingestions stays dormant by design.', 'cm-fill-community', '20 * * * *',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-community-submissions',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batchLimit":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$)
) AS v(slug, name, description, jobname, schedule, command)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['mp-fill-awin','mp-fill-shopify','mp-fill-etsy','mp-fill-ohmyfantasy',
                           'ev-fill-eventbrite','ev-fill-ticketmaster','news-fill-rss','cm-fill-community'] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug IN ('mp_fill_awin','mp_fill_shopify','mp_fill_etsy','mp_fill_ohmyfantasy',
                 'ev_fill_eventbrite','ev_fill_ticketmaster','news_fill_rss','cm_fill_community');
