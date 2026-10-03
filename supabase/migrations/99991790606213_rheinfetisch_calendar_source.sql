-- ============================================================================
-- rheinfetisch.de — Rheinfetisch e.V., Cologne's fetish and leather club
-- ----------------------------------------------------------------------------
-- WHAT THIS FILLS, measured on prod before a line was written: the corpus held
-- ZERO Rheinfetisch events. Not thin — absent. The club's entire programme (the
-- monthly Socials at Amadeus, the quarterly COLOURcode parties at Pullermanns,
-- the dinners, the bowling nights, Mr. Fetish NRW, the Cologne Pride Boat, the
-- Mitgliederversammlung) was carried by nothing, while the umbrella weekends
-- the same calendar lists were already covered several times over: 'folsom'
-- matched 142 rows across four sources, Maspalomas 18, Darklands 2.
--
-- So the value here is the local NRW programme, and the overlap on the big
-- prides is deliberately NOT filtered out in the adapter — pipeline-deduplicate
-- is the layer that decides that, and the Rheinfetisch entry often carries a
-- fuller German description and an exact street address than the row we hold.
--
-- THE SOURCE IS THE SITE'S OWN GOOGLE CALENDAR, NOT THE RENDERED PAGE.
-- /kalender is a Duda `googlecalendar` widget whose `data-public-calendar-id`
-- is the base64 of the calendar address, so the ICS export is the published
-- feed rather than a back door. Reading the page instead would give one month
-- of titles with no descriptions, no addresses and no recurrence.
--
-- ONE MEASUREMENT DECIDES THE WHOLE PARSER. 115 VEVENTs carry 34 RRULEs, and
-- 30 of those are FREQ=DAILY — every one of them a multi-day festival written
-- the way Google's UI encourages (Darklands across six days, Folsom Europe five,
-- Maspalomas Fetish Pride twelve), NOT a repeating event. Expanding them
-- literally would mint ~130 rows each titled for a whole festival and dated to
-- one of its days. `_shared/ics-parse.ts` collapses a daily rule to ONE spanning
-- row and expands only FREQ=MONTHLY, which is the genuine article: 4 rules, the
-- Socials and COLOURcode. 115 VEVENTs resolve to 128 events, 0 unsupported.
--
-- ALL-DAY DTEND IS EXCLUSIVE IN RFC 5545 AND INCLUSIVE IN THIS CORPUS, and the
-- corpus is what settled it: patroc stores `Maspalomas Fetish Pride 2026` as
-- 2026-10-01 -> 2026-10-12 and `Folsom Europe Berlin 2025` as ending 08-31
-- 23:59. The parser converts, so our span matches theirs and dedup sees one
-- festival rather than two that differ by a day.
--
-- NULL pipeline_run_id IS FINE HERE, and that was verified rather than assumed:
-- a cron posting straight at a source stages rows with no run id, and four of
-- the five DAG stages .eq() on it. The events family has a complete dual-mode
-- drain chain — ev_drain_normalize :02, _validate :07, _dedup :22, _quality :29,
-- _review :37, _commit :52, all six enabled and green — and on prod 10,960 of
-- the 10,960 events staged with a null run id are dispositioned, with exactly
-- one still pending. The path works end to end.
--
-- CADENCE. Weekly, Monday 03:38 — 03:37 to 03:39 are unused, and it sits ahead
-- of the 04:02 normalize drain so a run clears the whole chain the same night.
-- A club programme changes on the order of weeks and the whole calendar is ONE
-- request, so batch_size covers all of it rather than re-reading the head.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper from it, so this
-- file must NOT pre-wrap it — see 20260910163700. It does not reconcile until
-- 05:10, so the first fire after this migration is untracked unless it is run
-- by hand.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_rheinfetisch',
  'Fill Cologne fetish events from Rheinfetisch',
  'Weekly Mon 03:38: source-rheinfetisch reads Rheinfetisch e.V.''s public Google Calendar (the feed behind rheinfetisch.de/kalender) and stages events. 115 VEVENTs resolve to ~128 rows: FREQ=DAILY rules are multi-day festivals and collapse to one spanning row, FREQ=MONTHLY genuinely expands into instances, RECURRENCE-ID overrides replace the instance they modify and EXDATE removes it. Fills the NRW fetish/leather programme the corpus carried none of; overlap with patroc/gaycities on Folsom, Darklands and Maspalomas is left to pipeline-deduplicate. No credentials — the calendar is public. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-rheinfetisch','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-rheinfetisch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":500}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '38 3 * * 1'
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
    PERFORM cron.unschedule('ev-fill-rheinfetisch');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_rheinfetisch';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing registry the admin surfaces read, and the
-- set check-pipeline-health.mjs §9 derives its freshness watch from. The gate
-- arms itself — it only reports staleness once a write has proved the path.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('Rheinfetisch Kalender', 'rheinfetisch', 'scraper', 'events', 'source-rheinfetisch', true, false, '38 3 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- Postconditions. Assert the state this file exists to reach, not the number of
-- rows it happened to touch: both upserts are idempotent, so counting them
-- proves nothing on a re-run.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_cmd text;
  v_sched text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_automations
    WHERE slug = 'ev_fill_rheinfetisch' AND enabled AND schedule = '38 3 * * 1'
  ) THEN
    RAISE EXCEPTION 'ev_fill_rheinfetisch missing, disabled, or on the wrong schedule';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingestion_sources
    WHERE slug = 'rheinfetisch' AND is_enabled AND target_table = 'events'
      AND edge_function = 'source-rheinfetisch'
  ) THEN
    RAISE EXCEPTION 'ingestion_sources row for rheinfetisch missing or misconfigured';
  END IF;

  -- The live cron, not the registry's intent: a reschedule inside a migration
  -- is not itself durable, so this reads what pg_cron will actually fire.
  SELECT command, schedule INTO v_cmd, v_sched
  FROM cron.job WHERE jobname = 'ev-fill-rheinfetisch' AND active;
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'cron job ev-fill-rheinfetisch is absent or inactive';
  END IF;
  IF v_sched <> '38 3 * * 1' THEN
    RAISE EXCEPTION 'cron job ev-fill-rheinfetisch is on %, expected 38 3 * * 1', v_sched;
  END IF;
  IF position('source-rheinfetisch' in v_cmd) = 0 THEN
    RAISE EXCEPTION 'cron job ev-fill-rheinfetisch does not call source-rheinfetisch';
  END IF;
END
$verify$;
