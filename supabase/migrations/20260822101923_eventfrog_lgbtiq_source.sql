-- ============================================================================
-- eventfrog.ch LGBTIQ partys — third Swiss queer agenda source
-- ----------------------------------------------------------------------------
-- Joins ev_fill_display_magazin (02:40) and ev_fill_gay_ch (02:45) on the
-- events fill side. Like both of those it stages EVENTS and the VENUES those
-- events name, so the hourly ev-drain-* and vn-drain-* stage machines pick both
-- up with no new drain.
--
-- WHY IT IS WORTH A THIRD SOURCE. eventfrog is the ticketing platform Swiss
-- promoters actually sell through, so its LGBTIQ listing carries the club
-- nights gay.ch's volunteer agenda does not (Floor Club Kloten, Kauz, Zinkbad,
-- palais mascotte) and, because `?c=ALL` drops the country filter, the German
-- and Austrian queer parties too. Measured 2026-08-22: 39 events across 27
-- venues, 2026-08-22 -> 2027-01-08, in one server-rendered page.
--
-- CADENCE. Daily at 02:50, in the same quiet window as the other two. One
-- listing fetch plus one request per upcoming event — ~40 requests — against a
-- commercial platform. A 6-hourly cron would quadruple that to re-read pages
-- that change at most once.
--
-- SCOPE IS THE FORWARD WINDOW. eventfrog removes past events from the listing
-- entirely, so unlike gay.ch there is no archive to walk and no one-shot
-- companion importer.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper
-- (admin_automation_run_begin + automation_http_post) from it, so this file
-- must NOT pre-wrap it — see 20260910163700. It also does not apply itself
-- until the 05:10 reconciler, so run it by hand after this migration or the
-- 02:50 fire before then is untracked.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_eventfrog',
  'Fill parties from Eventfrog',
  'Daily 02:50: source-eventfrog parses the eventfrog.ch LGBTIQ party listing (?c=ALL, i.e. CH+DE+AT) and each upcoming event page, which carries a full schema.org Event in application/ld+json — staging events plus the venues they name. Forward window only; eventfrog drops past events from the listing. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-eventfrog','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-eventfrog',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":120}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  '50 2 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('ev-fill-eventfrog');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_eventfrog';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('Eventfrog LGBTIQ Partys', 'eventfrog', 'scraper', 'events', 'source-eventfrog', true, false, '50 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
