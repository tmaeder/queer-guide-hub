-- ============================================================================
-- Event calendar sources, 2026-09-28: qcal.app, queer-kalender.nl,
-- gaytravel4u.com.
--
-- Registers three new event importers. Each is an edge function + a pg_cron
-- job + an admin_automations row of record + an ingestion_sources row.
--
-- A FOURTH SOURCE WAS REQUESTED AND IS DELIBERATELY ABSENT. qalendar.cz is
-- technically the easiest of the four — a full, public The-Events-Calendar
-- REST API plus a 47 KB .ics feed — and it is NOT imported, because its terms
-- at /terms-and-conditions/?lang=en read, verbatim:
--
--   "All rights to the Portal, in particular copyrights to its content ...
--    belong exclusively to the Operator. It is prohibited to copy, modify,
--    distribute, store, or otherwise use any part of the Portal without the
--    prior express consent of the Operator."
--
-- Staging their listings is exactly "store". Czechia is in the EU, so the
-- sui generis database right covers systematic extraction of a substantial
-- part of the compilation independently of copyright in any single listing;
-- and the site sells priority placement (CZK 967 / CZK 3,630), so the
-- listings are partly paid inventory. That is a licensing decision for a
-- human, not a default for an importer. One email to the operator unblocks
-- it and the adapter is a day's work at that point.
--
-- The other three: qcal.app and gaytravel4u.com both publish
-- `User-agent: * / Allow: /` with no reuse clause found; queer-kalender.nl
-- allows everything outside /admin and has no terms page at all, but is a
-- volunteer-run one-developer project whose events are added by hand, which
-- is why its importer makes exactly ONE request per day.
--
-- CADENCE. Spread across the 02:00-04:00 window the other event fills use,
-- avoiding the :00 and :30 marks where the existing jobs cluster.
--   ev-fill-qcal            03:05 daily  — 6 requests (261 events, 50/page)
--   ev-fill-queer-kalender  03:15 daily  — 1 request
--   ev-fill-gaytravel4u     03:45 daily  — 6 + up to 150 requests
--
-- gaytravel4u is the heavy one and it is RESUMABLE BY DESIGN: 621 slugs each
-- need their own detail fetch, which does not fit one 546s invocation, so a
-- run skips slugs already in ingestion_staging and works the tail. Five
-- nights clears the backlog; after that a run costs 6 requests and stages 0.
-- That is not tuning — a job that always re-reads the same head is the
-- selector-starvation shape this schema has been bitten by in city
-- enrichment, embeddings and the news drain.
--
-- THE COMMANDS BELOW ARE THE PLAIN, UNWRAPPED FORM ON PURPOSE.
-- admin_automation_effective_command() derives the run-tracking wrapper
-- (admin_automation_run_begin + public.automation_http_post) from
-- action.command, and sync_automations_to_cron()'s command-drift branch
-- applies it. Pre-wrapping here would double-wrap. See 20260910163700.
-- The reconciler runs at 05:10, so the first fire before then is untracked
-- unless sync_automations_to_cron(true) is run by hand after this applies.
-- ============================================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_qcal',
  'Fill events from qcal.app',
  'Daily 03:05: source-qcal reads the public, key-less /api/events/search JSON endpoint (261 events, pageSize capped server-side at 50, paginate on `page` — `limit` and `perPage` are silently ignored and re-read page 1). Events only: qcal names an organiser and a postal address but never a venue, so venue_name stays null rather than feeding a host name to the event->venue linker. Recurring events stage once on their next instance; `slug` is stable across instances. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-qcal','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-qcal',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":400}'::jsonb,
    timeout_milliseconds := 400000
  );
$$),
  '5 3 * * *'
),
(
  'ev_fill_queer_kalender',
  'Fill Amsterdam events from queer-kalender.nl',
  'Daily 03:15: source-queer-kalender parses the server-rendered /en/ page (154 upcoming events measured 2026-09-28) in ONE request. The Zotonic API at /api/model/search/get was measured and rejected: it needs 1 + 1,698 requests and its resource records carry no venue name and no street, both of which the page''s calendar deeplinks do carry. Start times are read from the tz-qualified <time datetime> attribute; the naive deeplink end is qualified with the start''s own offset, not a hardcoded +02:00, because Amsterdam is +01:00 half the year. "T.B.A." and bare street addresses are never staged as venue names. Volunteer-run hobby site: keep this at one request a day. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-queer-kalender','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-queer-kalender',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":400}'::jsonb,
    timeout_milliseconds := 200000
  );
$$),
  '15 3 * * *'
),
(
  'ev_fill_gaytravel4u',
  'Fill curated circuit events from gaytravel4u.com',
  'Daily 03:45: source-gaytravel4u enumerates the six curated listicles (pride / bear / fetish / ski / carnival / easter — 621 distinct slugs, 46 on more than one page) and reads each /event/<slug>/ page''s schema.org Event node. RESUMABLE: slugs already in ingestion_staging are skipped, so 150 detail fetches a night clears the backlog in five nights and steady state is 6 requests. Two upstream defects are guarded and COUNTED in the run summary, never silent: placeholder start dates more than 3 years out (bilbao-in-black publishes 2031-06-12) are dropped, and a locality naming a different city than the event does (furball-orlando carries "New York") has its city AND country withheld. Events with no date anywhere ("Awaiting dates") are dropped rather than invented. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-gaytravel4u','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-gaytravel4u',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":150}'::jsonb,
    timeout_milliseconds := 500000
  );
$$),
  '45 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

-- Guarded unschedule, then schedule from the registry. Never DELETE a
-- registry row to retire one of these: branch (b) of sync_automations_to_cron
-- treats `enabled=false` as a kill switch, while a missing row makes the live
-- job "unregistered", which the reconciler reports and deliberately never
-- auto-kills.
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['ev-fill-qcal','ev-fill-queer-kalender','ev-fill-gaytravel4u'] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug IN ('ev_fill_qcal','ev_fill_queer_kalender','ev_fill_gaytravel4u');

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- Also the set §9 of check-pipeline-health.mjs derives its staleness watch
-- from, via target_table.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES
  ('qcal.app Events',            'qcal',           'api',     'events', 'source-qcal',           true, false, '5 3 * * *'),
  ('Queer Kalender Amsterdam',   'queer-kalender', 'scraper', 'events', 'source-queer-kalender', true, false, '15 3 * * *'),
  ('Gay Travel 4u Event Guides', 'gaytravel4u',    'scraper', 'events', 'source-gaytravel4u',    true, false, '45 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- Postconditions. Assert the state this file exists to REACH, not the state it
-- found: a concurrent session may legitimately have touched any of these rows
-- between authoring and apply, and an exact-match precondition turns that into
-- a `db push` abort that blocks every migration queued behind it.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_slugs text[] := ARRAY['ev_fill_qcal','ev_fill_queer_kalender','ev_fill_gaytravel4u'];
  v_jobs  text[] := ARRAY['ev-fill-qcal','ev-fill-queer-kalender','ev-fill-gaytravel4u'];
  v_bad   int;
BEGIN
  -- P1: three enabled registry rows, each carrying a command.
  SELECT count(*) INTO v_bad
  FROM unnest(v_slugs) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_automations a
    WHERE a.slug = s AND a.enabled AND coalesce(a.action->>'command','') <> ''
  );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'event calendar sources: % registry row(s) missing, disabled or command-less', v_bad;
  END IF;

  -- P2: three live cron jobs, active.
  SELECT count(*) INTO v_bad
  FROM unnest(v_jobs) j
  WHERE NOT EXISTS (SELECT 1 FROM cron.job c WHERE c.jobname = j AND c.active);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'event calendar sources: % cron job(s) missing or inactive', v_bad;
  END IF;

  -- P3: the registry command must be the PLAIN form. A pre-wrapped command
  -- would be wrapped a second time by the reconciler.
  SELECT count(*) INTO v_bad
  FROM public.admin_automations a
  WHERE a.slug = ANY(v_slugs)
    AND (a.action->>'command' ILIKE '%automation_http_post%'
      OR a.action->>'command' ILIKE '%admin_automation_run_begin%');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'event calendar sources: % command(s) are pre-wrapped; store the plain net.http_post form', v_bad;
  END IF;

  -- P4: three enabled ingestion_sources rows pointed at events.
  SELECT count(*) INTO v_bad
  FROM (VALUES ('qcal'),('queer-kalender'),('gaytravel4u')) t(slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingestion_sources i
    WHERE i.slug = t.slug AND i.is_enabled AND i.target_table = 'events'
  );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'event calendar sources: % ingestion_sources row(s) missing or disabled', v_bad;
  END IF;

  -- P5: qalendar.cz stayed out. This is the licensing decision above made
  -- enforceable — a later pass that adds it has to break this check first and
  -- read why.
  SELECT count(*) INTO v_bad
  FROM public.ingestion_sources i
  WHERE i.slug IN ('qalendar','qalendar-cz','qalendar_cz');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'qalendar.cz is registered but its terms prohibit storing its content without consent; see this migration header';
  END IF;
END
$verify$;
