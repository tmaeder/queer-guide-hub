-- ============================================================================
-- Swiss queer agenda sources — display-magazin.ch + gay.ch
-- ----------------------------------------------------------------------------
-- Two new fill-side sources on the events family, alongside ev_fill_eventbrite
-- and ev_fill_ticketmaster. Both stage EVENTS and the VENUES those events
-- reference, so the existing hourly ev-drain-* and vn-drain-* stage machines
-- pick both up with no new drain.
--
-- display-magazin.ch is WordPress + The Events Calendar and serves
-- `/wp-json/tribe/events/v1/{events,venues}` as clean JSON. It was ALREADY
-- registered twice and worked neither time:
--   * scrape_sources 'display-magazin' (20260228130100, then 20260330600000)
--     guesses CSS selectors — `.tribe-events-list-event-title` and friends —
--     against a page that is server-rendered from that very API. Disabled here
--     for good, with the reason recorded rather than deleted: a DELETE would
--     just invite a third rediscovery of the same dead end.
--   * ingestion_sources 'display-magazin' (20260416110000) points edge_function
--     at `scrape-web-sources`, i.e. the same selector scraper, and has sat
--     is_enabled=false since. Repointed at the new function.
-- gay.ch has never been registered at all.
--
-- CADENCE. Daily, not 6-hourly like the two ticketing APIs. These are two small
-- Swiss editorial agendas — 217 and ~33 forward-dated rows respectively — and
-- gay.ch costs one listing fetch plus one request per upcoming party, so a
-- 6-hourly cron would quadruple the load on a volunteer-run Plone box to
-- re-read the same 33 pages.
--
-- SCOPE IS THE FORWARD WINDOW ONLY. display-magazin's REST default window is
-- "now .. now+2y"; gay.ch's /parties/ listing shows only upcoming events. The
-- archives (217 events back to 2025-12, and 3,543 gay.ch party pages back to
-- 2015) are a one-shot job — scripts/data-quality/import-swiss-events.mjs —
-- because a daily cron re-walking 3.5k static pages is pure waste and the
-- archive needs a geocoding pass the cron deliberately does not do.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper
-- (admin_automation_run_begin + automation_http_post) from it, so this file
-- must NOT pre-wrap it — see 20260910163700.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_display_magazin',
  'Fill events from Display Magazin',
  'Daily 02:40: source-display-magazin stages forward-dated events from the WordPress/Tribe REST API at display-magazin.ch, plus the venue records those events reference. Replaces the never-working scrape_sources selector scraper of the same slug. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-display-magazin','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-display-magazin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":300,"days_back":7}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '40 2 * * *'
),
(
  'ev_fill_gay_ch',
  'Fill parties from gay.ch',
  'Daily 02:45: source-gay-ch parses the /parties/ listing and each upcoming party page (schema.org Event in a bare <script>, no ld+json attribute), staging events plus the venues they name. Forward window only — the 3,543-page archive is the one-shot importer. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-gay-ch','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-gay-ch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":60}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  '45 2 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['ev-fill-display-magazin','ev-fill-gay-ch'] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug IN ('ev_fill_display_magazin','ev_fill_gay_ch');

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES
  ('Display Magazin Agenda', 'display-magazin', 'api',     'events', 'source-display-magazin', true, false, '40 2 * * *'),
  ('gay.ch Parties',         'gay-ch',          'scraper', 'events', 'source-gay-ch',          true, false, '45 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- Retire the selector scraper, keeping the row so the dead end stays recorded.
-- ----------------------------------------------------------------------------
UPDATE public.scrape_sources
SET is_enabled = false,
    last_error = 'Retired 2026-09-15: the site is WordPress + The Events Calendar and is '
              || 'server-rendered from /wp-json/tribe/events/v1/. Use the source-display-magazin '
              || 'edge function; CSS selectors against this page will never work.',
    updated_at = now()
WHERE slug = 'display-magazin';
