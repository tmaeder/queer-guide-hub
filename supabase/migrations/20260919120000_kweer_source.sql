-- ============================================================================
-- kweer.io — Zurich queer party promoter
-- ----------------------------------------------------------------------------
-- Fifth Swiss agenda source, and the smallest: 25 events in the sitemap, of
-- which 21 stage. Worth a cron because the four existing Swiss sources are a
-- magazine agenda, a volunteer listing, a ticketing platform and a youth
-- organisation — none of them carry this promoter's club nights (Kweer Ball,
-- Explicit, PIT, TEA) at Kauz, Zinkbad, Barfussbar and LABOR5.
--
-- IT IS NOT A BROWSER JOB, despite the listing being client-rendered Wix with
-- no payload in the HTML. `event-pages-sitemap.xml` enumerates every event and
-- each detail page is server-rendered with a clean schema.org Event carrying a
-- correct UTC offset. One sitemap fetch plus 25 pages.
--
-- EVENTS ONLY. kweer publishes no venue records — just a name and a one-line
-- address per event — so nothing is staged to `venues`.
--
-- THE VENUE NAME IS OFTEN THE CITY. Measured over all 25 live pages, 8 give
-- `location.name` as "Zürich" rather than the venue. The parser nulls those:
-- feeding a city into venue matching is the documented place collision, where
-- 15 of 65 `name_exact` matches were cities or queer-village names — a 23%
-- error rate on a branch that auto-applies. The real name is NOT recoverable
-- from the address either, and that was measured, not assumed:
-- "Schiffbaustrasse 3" appears as LABOR5 Zürich, as Fabrik Du Plaisir, and as
-- plain "Zürich".
--
-- FOUR ONLINE-ONLY ROWS (2020-21 Vimeo/Zoom/Twitch streams) have no address at
-- all and are dropped in the parser, because pipeline-validate raises
-- E_NO_LOCATION on them.
--
-- Measured end to end 2026-08-22: 21 staged, 21 distinct slugs, city / postal /
-- country / street all 100%, 0 numeric cities, 0 venue-equals-city. Two rows
-- are over a year old, so the worst case is W_EVENT_IN_PAST + W_NO_GEO = 2
-- warnings, under the threshold of 3.
--
-- CADENCE. Weekly, Monday 03:20 — a free slot next to vn-fill-gaybasel at
-- 03:10 and clear of gaycities-sync at 04:17. A 25-event corpus that gains a
-- few rows a month does not justify a nightly walk.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper from it, so this
-- file must NOT pre-wrap it — see 20260910163700. It also does not reconcile
-- until 05:10, so run it by hand after this migration or the first fire is
-- untracked.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_kweer',
  'Fill Zurich parties from Kweer',
  'Weekly Mon 03:20: source-kweer reads kweer.io''s event sitemap and each server-rendered detail page''s schema.org Event. Events only — kweer publishes no venue records. A location.name that is merely the city ("Zürich", on 8 of 25) is nulled rather than staged as a venue; online-only rows with no address are dropped. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-kweer','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-kweer',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":60}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '20 3 * * 1'
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
    PERFORM cron.unschedule('ev-fill-kweer');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_kweer';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('Kweer Zurich Parties', 'kweer', 'scraper', 'events', 'source-kweer', true, false, '20 3 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
