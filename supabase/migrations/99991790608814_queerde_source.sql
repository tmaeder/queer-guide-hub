-- ============================================================================
-- queer.de — the German-language CSD / Pride calendars
-- ----------------------------------------------------------------------------
-- queer.de is Germany's main queer news outlet and its CSD list is THE reference
-- for German pride dates. There was no queer.de source at all before this, and
-- German coverage was thin for exactly the small-town prides this hand-maintained
-- list carries and no ticketing platform lists (Bramsche, Freital, Prenzlau,
-- Kulmbach, Norden).
--
--   /csd-termine.php              22 live + 448 archive
--   /gay-pride-international.php   3 live +  25 archive
--
-- Measured end to end 2026-09-28 against both live pages: 498 vevents parsed,
-- 485 staged, 13 skipped (6 cancelled + 7 city-less), 485 distinct source ids,
-- zero mangled umlauts. Against prod, 3 rows already exist as an exact
-- title+city+date match and 23 share a city+date under a different title, so the
-- dedup engine has real work to do and ~482 events are new.
--
-- BOTH PAGES ARE UNDECLARED ISO-8859-1. The parser takes raw bytes and owns the
-- decoding; decoding as UTF-8 mangles München, Köln, Göttingen, Nürnberg,
-- Österreich and Zürich, i.e. most of the largest prides. All the parsing traps
-- live in `_shared/queerde-parse.ts`, which is pure and has 27 unit tests.
--
-- EVENTS ONLY. queer.de publishes venue NAMES (268 of 485 rows) but no addresses
-- and no coordinates, so nothing is staged to `venues`.
--
-- ── EVERY ROW LANDS IN REVIEW, BY DESIGN ────────────────────────────────────
-- The pages carry no description, no image and no coordinates, so each row trips
-- W_DESCRIPTION_MISSING_OR_THIN + W_IMAGE_MISSING + W_DESCRIPTION_THIN + W_NO_GEO
-- — over `warn_review_threshold` (3) — and `pipeline-validate` writes
-- `ai_validation_status='needs_review'` with `ai_confidence_score=0.5`.
--
-- That is thin metadata, not doubtful correctness, and it is deliberately NOT
-- worked around: no description is invented, no city centroid is stamped as if it
-- were the event's own coordinate, and the threshold is not raised for this
-- source. A human confirms and `trg_staging_human_approval_clears_validation`
-- promotes `ai_validation_status`, which is the column every downstream stage
-- actually gates on.
--
-- TWO OPERATIONAL CONSEQUENCES, both measured, both easy to trip over:
--   1. 0.5 is BELOW `triage_bulk_approve_high_conf`'s 0.9 default, so the
--      "Approve >=90%" button can never see these rows. Approving the archive in
--      bulk needs an explicit id list through `ingestion-review-api` bulk_approve
--      (max 1000 ids) — which is also the only form scoped to THIS source, since
--      that RPC scopes by `target_table` and has no per-source filter.
--   2. `staging_auto_reject_stale` (cron 45 3 * * *) auto-rejects any
--      `pending_review` + `pending` row older than 30 DAYS. An un-reviewed
--      archive import is silently discarded after a month.
--
-- ── NO DRAIN, NO DAG NODE ───────────────────────────────────────────────────
-- The six hourly `ev-drain-*` crons (20260704170000_events_staging_drain_cron)
-- scan `ingestion_staging` globally and pick up any pending event row: normalize
-- :02, validate :07, dedup :22, quality :29, review-gate :37, commit :52. They
-- pass no `pipeline_run_id` and every stage's filter on it is conditional, so
-- NULL-run rows are exactly what they select. Same as kweer, the Swiss sources
-- and milchjugend — no new machinery.
--
-- ── CADENCE ─────────────────────────────────────────────────────────────────
-- Weekly, Monday 02:05 — a free slot in the event-fill neighbourhood (haz-ch
-- 02:25, display-magazin 02:40, gay-ch 02:45, eventfrog 02:50, milchjugend
-- 02:55) and clear of the Monday weeklies (gaybasel 03:10, kweer 03:20). It also
-- lands two minutes before the :07 validate tick, so a run is visible quickly.
--
-- The cron re-reads the LIVE sections only (`include_past` defaults false). The
-- 473-row archive is a deliberate one-time run, not weekly churn — and re-running
-- it is harmless anyway, because identity is stable and the
-- `(source_name, source_entity_id)` idempotency index skips an already-seen row.
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
  'ev_fill_queerde',
  'Fill German CSD dates from queer.de',
  'Weekly Mon 02:05: source-queerde reads queer.de''s hCalendar CSD calendar (/csd-termine.php) and its international Pride list (/gay-pride-international.php). Live sections only — the 473-row archive is an explicit include_past run. Both pages are undeclared ISO-8859-1 and the parser decodes latin-1, so umlauts survive. Cancelled ("- abgesagt -") and city-less ("Diverse Orte") rows are skipped and counted, because a source cannot express cancellation through this pipeline and a city-less row raises E_NO_LOCATION. Every row lands in review (no description/image/coords = 4 warnings) and needs a human approve. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-queerde','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-queerde',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":80}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '5 2 * * 1'
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
    PERFORM cron.unschedule('ev-fill-queerde');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_queerde';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('queer.de CSD & Pride Calendar', 'queerde', 'scraper', 'events', 'source-queerde', true, false, '5 2 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- Postconditions. Assert the reached state, not the number of rows written, so
-- the file is idempotent and a re-run verifies rather than double-counts.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_cmd  text;
  v_sched text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_automations WHERE slug='ev_fill_queerde' AND enabled) THEN
    RAISE EXCEPTION 'ev_fill_queerde missing or disabled in admin_automations';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ingestion_sources
                  WHERE slug='queerde' AND target_table='events' AND edge_function='source-queerde' AND is_enabled) THEN
    RAISE EXCEPTION 'queerde missing or disabled in ingestion_sources';
  END IF;

  -- The live cron must exist, be active, and post to THIS function. Checked on
  -- cron.job rather than on the registry, because a registry row whose job was
  -- never scheduled is the documented on-but-unscheduled failure.
  SELECT command, schedule INTO v_cmd, v_sched
  FROM cron.job WHERE jobname='ev-fill-queerde' AND active;
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'cron job ev-fill-queerde is missing or inactive';
  END IF;
  IF position('source-queerde' in v_cmd) = 0 THEN
    RAISE EXCEPTION 'cron job ev-fill-queerde does not post to source-queerde';
  END IF;
  IF v_sched <> '5 2 * * 1' THEN
    RAISE EXCEPTION 'cron job ev-fill-queerde has schedule % (expected 5 2 * * 1)', v_sched;
  END IF;

  RAISE NOTICE 'queer.de source registered: automation + ingestion_sources + cron % ', v_sched;
END $verify$;
