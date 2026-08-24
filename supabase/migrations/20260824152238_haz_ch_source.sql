-- ============================================================================
-- haz.ch/events — HAZ (Queer Zürich)'s own agenda: support groups, discussion
-- circles and Regenbogenhaus open-house hours.
-- ----------------------------------------------------------------------------
-- Joins the existing ev-fill-{display-magazin,gay-ch,eventfrog,milchjugend}
-- block. Like all four it stages EVENTS and the VENUES they name, so the
-- existing hourly ev-drain-*/vn-drain-* stage machines pick both up.
--
-- WordPress + The Events Calendar (free tier — no PRO recurrence engine, so
-- unlike milchjugend every occurrence is its own WP post with a stable real
-- id; no provisional-id trap). `/wp-json/tribe/events/v1/events` serves clean
-- JSON, per_page cap 50, default forward window now..+2y — 301 events over 7
-- pages measured 2026-08-24.
--
-- VENUE NAME IS A ROOM LABEL, NOT AN ADDRESS. HAZ hosts nearly everything at
-- its own Regenbogenhaus (Zollstrasse 117, 8005 Zürich), but the feed's
-- venue.venue string varies by internal room — 13 distinct strings observed,
-- collapsing to exactly 2 real places once normalized (Regenbogenhaus,
-- Gleis). The venue REST endpoint itself carries no structured address at
-- all. The DB already held NINE near-duplicate "Regenbogenhaus..." venue rows
-- from unrelated prior imports (event-import/email_ingest/google/unknown —
-- none from haz.ch) before this source existed; source-haz-ch's own
-- normalizer collapses all 13 feed strings onto 2 identities so this source
-- does not add a tenth. See the edge function's header comment for the full
-- reasoning.
--
-- CADENCE. Daily at 02:25 — the two free minutes left in the 2am hour band
-- were :05 and :25 (:00/:10/:15/:20/:30/:35/:40/:45/:50/:55 all taken by
-- other nightly jobs); :25 keeps this adjacent to the other Swiss events
-- sources at :40-:55 without colliding.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper
-- (admin_automation_run_begin + automation_http_post) from it, so this file
-- must NOT pre-wrap it — see 20260910163700. It also does not apply itself
-- until the 05:10 reconciler, so run it by hand after this migration or the
-- 02:25 fire before then is untracked.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_haz_ch',
  'Fill Zurich HAZ events',
  'Daily 02:25: source-haz-ch reads haz.ch''s The Events Calendar REST API (one JSON endpoint, no page fetches) and stages events plus the venues they name. Venue identity is normalized in the adapter itself — HAZ''s feed names one physical building 13 different ways depending which internal room is booked, so the parser collapses them to the 2 real places (Regenbogenhaus, Gleis) rather than minting a new venue per room label. Forward window only. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-haz-ch','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-haz-ch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":500}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '25 2 * * *'
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
    PERFORM cron.unschedule('ev-fill-haz-ch');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_haz_ch';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('HAZ Events (Queer Zürich)', 'haz-ch', 'scraper', 'events', 'source-haz-ch', true, false, '25 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
