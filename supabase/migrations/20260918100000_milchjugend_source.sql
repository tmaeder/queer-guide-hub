-- ============================================================================
-- milchjugend.ch — fourth Swiss queer agenda source
-- ----------------------------------------------------------------------------
-- Joins ev_fill_display_magazin (02:40), ev_fill_gay_ch (02:45) and
-- ev_fill_eventfrog (02:50) on the events fill side. Like all three it stages
-- EVENTS and the VENUES those events name, so the hourly ev-drain-* and
-- vn-drain-* stage machines pick both up with no new drain.
--
-- WHY IT IS WORTH A FOURTH SOURCE. The other three are nightlife and magazine
-- agendas; milchjugend is Switzerland's queer YOUTH organisation, so its corpus
-- is the recurring community infrastructure none of them list — Jugendtreffs,
-- Milchbars, trans counselling drop-ins — across Winterthur, Baden, Basel,
-- Luzern and Wil, not just Zurich. Measured 2026-08-22: 499 events in the
-- forward window over 15 venues; 1,654 events and 115 venues in the full
-- corpus back to 2024-08.
--
-- IT IS THE CHEAPEST SOURCE HERE AND THE ONLY ONE THAT NEEDS NO GEOCODING.
-- WordPress + The Events Calendar serves everything from ONE JSON endpoint —
-- no per-event page fetch — and, unlike display-magazin, that payload carries
-- venue.geo_lat / geo_lng, populated on 96.3% of the whole corpus. Measured end
-- to end against pipeline-validate's 3-warning threshold: 0 of 499 forward
-- events and 1 of 1,654 total would land in the human review queue.
--
-- BATCH SIZE IS LOAD-BEARING at 600. The fetch always restarts at the soonest
-- event, so a cap below the forward window (499) would re-read the same head
-- every night and never reach the tail. 600 rows is ~12 requests.
--
-- CADENCE. Daily at 02:55, the next free minute in the quiet band (00/10/15/20/
-- 35/40/45/50 are taken). Forward window only; the 2024→now archive is a
-- one-shot job, not something a nightly cron should re-walk.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper
-- (admin_automation_run_begin + automation_http_post) from it, so this file must
-- NOT pre-wrap it — see 20260910163700. It also does not apply itself until the
-- 05:10 reconciler, so run it by hand after this migration or the 02:55 fire
-- before then is untracked.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_milchjugend',
  'Fill youth events from Milchjugend',
  'Daily 02:55: source-milchjugend reads milchjugend.ch''s The Events Calendar REST API (one JSON endpoint, no page fetches) and stages events plus the venues they name. The payload carries venue coordinates, so no geocoding pass is needed. Identity is the permalink, never the numeric id — those are TEC Pro provisional occurrence ids that change when a recurrence rule is edited. Forward window only; the archive is a one-shot import. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-milchjugend','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-milchjugend',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":600}'::jsonb,
    timeout_milliseconds := 150000
  );
$$),
  '55 2 * * *'
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
    PERFORM cron.unschedule('ev-fill-milchjugend');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_milchjugend';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('Milchjugend Agenda', 'milchjugend', 'scraper', 'events', 'source-milchjugend', true, false, '55 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
