-- ============================================================================
-- gaybasel.org — Basel queer venue registry (and a small live agenda)
-- ----------------------------------------------------------------------------
-- Registered on the VENUE fill side (vn-fill-*), not the events side, because
-- that is what this source actually is: its sitemap holds 544
-- `/locations/<id>/<slug>` pages and only SEVEN `/events/<id>/<slug>`.
-- Measured 2026-08-22 against the live site: 90 of 91 sampled location pages
-- parse (the one null is the site's own "(tba)" placeholder), 100% carry a
-- city, 99% a street and 60% coordinates; all 7 events parse.
--
-- WHY IT IS WORTH A CRON. Basel is the third-largest Swiss city and the corpus
-- held almost no venue records for it. 544 curated queer-culture venues with
-- the site's own stable numeric ids is the largest untapped venue set among the
-- ten requested sources apart from gaycities — and unlike gaycities it is not
-- behind Cloudflare.
--
-- EVERY UNKNOWN PATH RETURNS HTTP 200. `/events/list`, `/api/events` and any
-- dead location id all serve one byte-identical shell, and the sitemap DOES
-- contain ids that no longer resolve. The parser gates on a detail-view marker;
-- `res.ok` would let the shell through and this job would report success while
-- writing nothing — the scrape_sources failure already on record in this repo.
--
-- TRI-BORDER, NOT SWITZERLAND. GayBasel lists the CH/DE/FR corner: 3 of 46
-- sampled locations are in Freiburg im Breisgau, Germany. Coordinates are gated
-- against the tri-border box, and venue `country` is deliberately left NULL —
-- a coordinate kilometres from a border cannot settle it, NULL is filled from
-- the linked city later, and a WRONG country drives safety-gating.
--
-- CADENCE. Weekly, Monday 03:10 — a free slot, clear of the 02:xx events-fill
-- ladder and of gaycities-sync at 04:17. 544 pages that change rarely do not
-- justify a nightly walk. batch_size covers the whole sitemap so a run is
-- complete rather than perpetually re-reading the head.
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
  'vn_fill_gaybasel',
  'Fill Basel venues from GayBasel',
  'Weekly Mon 03:10: source-gaybasel walks gaybasel.org''s sitemap — 544 location pages plus 7 event pages — and stages venues and events. Location pages carry the site''s own numeric id, an address and (60%) coordinates; event pages carry schema.org with real offsets. Every unknown path on this host answers HTTP 200 with an identical shell, so the parser gates on a detail-view marker rather than the status code. Venue country is left NULL by design: the site covers the CH/DE/FR tri-border. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','vn-fill-gaybasel','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-gaybasel',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":600}'::jsonb,
    timeout_milliseconds := 400000
  );
$$),
  '10 3 * * 1'
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
    PERFORM cron.unschedule('vn-fill-gaybasel');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'vn_fill_gaybasel';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- target_table is 'venues' — 544 of the 551 staged rows are venues.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('GayBasel Locations', 'gaybasel', 'scraper', 'venues', 'source-gaybasel', true, false, '10 3 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
