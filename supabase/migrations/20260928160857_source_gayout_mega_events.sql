-- ============================================================================
-- source-gayout — worldwide LGBTQ+ MEGA EVENTS
--
-- VERSION NOTE: this file is numbered `20260928160857`, which sorts BELOW the
-- repo's 9999* block. That is deliberate and must NOT be "corrected". It was
-- applied live via MCP `apply_migration`, which stamps `schema_migrations` with
-- its OWN call timestamp rather than the filename it is handed; the repo file is
-- renamed to the version prod actually recorded so file and history match and
-- `db push` skips it on merge. Renaming it upward re-opens the drift that reds
-- every open PR in the repo. Same convention as `20260914084603`.
--
-- Registers the recurring driver for `source-gayout`, which stages gayout.com's
-- 721 curated flagship events (prides, circuit festivals, leather/fetish and
-- bear weeks, queer film festivals) across five continents, 2026-2028.
--
-- WHY THIS SOURCE IS WORTH A CRON, measured against the live corpus on
-- 2026-09-28 by matching despaced titles ignoring a trailing year:
--     710 distinct gayout events
--      81 already exist as UPCOMING events
--     112 exist only as PAST editions — this source carries the upcoming one
--     517 absent from `events` entirely
-- Against ~887 upcoming events in total, that roughly doubles the
-- forward-looking corpus, and it is the flagship half of it.
--
-- TRANSPORT. gayout.com sits behind Cloudflare bot protection that answers 403
-- to every direct client — measured: curl with a browser UA, Playwright bundled
-- chromium, Playwright with the real `chrome` channel, and the UAs gayout's own
-- robots.txt explicitly allows (`anthropic-ai`, `Claude-Web`). The function
-- therefore fetches through Firecrawl (FIRECRAWL_API_KEY, already configured
-- and used by `scrape-web-sources`). This is the same situation
-- `source-gaycities` records for gaycities.com, whose import lives scraper-side
-- behind Playwright; here Playwright is blocked too, so a proxy is the only door.
--
-- PACING IS LOAD-BEARING, NOT TUNING. The first prod dry run at concurrency 5
-- drew HTTP 429 on 46 of 50 pages and parsed 4 events while still reporting
-- success — the shape a throughput number hides. Firecrawl's plan limit is
-- per-minute and counts REQUESTS, so a 429 spends budget too. The function
-- paces globally (`min_interval_ms`, default 5000 ≈ 12 req/min) and retries a
-- 429 against the server's own stated reset rather than counting it as a
-- failure. At that rate one run fetches roughly 80 pages inside its time budget,
-- so the 721-event backfill drains over about ten runs.
--
-- SCHEDULE. Hourly while the backfill drains, which is also the right long-term
-- cadence: once every event is staged the function returns `drained` after a
-- single cached listing call, and `refresh` mode is what re-checks dates. A mega
-- event moves its dates once a year; nothing here needs to be faster.
--
-- KILL SWITCH: disable this `admin_automations` row. Never DELETE it — a deleted
-- row leaves the live cron unregistered, which the reconciler reports and
-- deliberately never auto-kills.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_automations: the registry of record.
-- ----------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'ev_fill_gayout',
  'Fill mega events from GayOut',
  'Hourly at :35 — source-gayout reads gayout.com''s mega-event listing (ItemList JSON-LD, 721 urls) and stages each event from the Event/Festival JSON-LD on its detail page. Fetches through Firecrawl because Cloudflare 403s every direct client. Work list is diffed against what is already staged or committed, so the run is resumable and idempotent; a page whose date is still "TBA" carries no Event block and is re-checked each run rather than staged incomplete. event_type comes from the source''s own ?type= filter buckets, never inferred from the title. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-gayout','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-gayout',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='legacy_anon_key'),
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"limit":60,"concurrency":2,"min_interval_ms":5000,"budget_ms":420000}'::jsonb,
    timeout_milliseconds := 520000
  );
$$),
  '35 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

-- ----------------------------------------------------------------------------
-- pg_cron. Scheduled through admin_automation_effective_command() so the job
-- carries the run-tracking wrapper (admin_automation_run_begin +
-- automation_http_post). Scheduling `action->>'command'` raw is the documented
-- trap: the job works and records no runs, so consecutive_failures never moves
-- and the auto-pause net can never fire for it.
-- ----------------------------------------------------------------------------
DO $sched$
DECLARE
  v_job   text;
  v_cmd   text;
  v_sched text;
BEGIN
  SELECT a.action->>'jobname',
         public.admin_automation_effective_command(a.slug, a.action->>'command'),
         a.schedule
    INTO v_job, v_cmd, v_sched
  FROM public.admin_automations a
  WHERE a.slug = 'ev_fill_gayout';

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'ev_fill_gayout registry row missing after insert';
  END IF;

  PERFORM cron.unschedule(v_job) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job);
  PERFORM cron.schedule(v_job, v_sched, v_cmd);
END
$sched$;

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- `requires_api_key` is TRUE — FIRECRAWL_API_KEY is genuinely required, and the
-- function returns a 200 `skipped` rather than a failure when it is absent.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('GayOut Mega Events', 'gayout', 'scraper', 'events', 'source-gayout', true, true, '35 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();

-- ----------------------------------------------------------------------------
-- Postconditions. Assert the state this migration exists to REACH, not the
-- number of rows it happened to touch: a count is satisfied by a re-run that
-- changed nothing, and these must hold however many times the file is applied.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_cmd     text;
  v_active  boolean;
  v_sched   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_automations WHERE slug = 'ev_fill_gayout' AND enabled) THEN
    RAISE EXCEPTION 'P1: ev_fill_gayout is not registered and enabled';
  END IF;

  SELECT command, active, schedule INTO v_cmd, v_active, v_sched
  FROM cron.job WHERE jobname = 'ev-fill-gayout';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'P2: cron job ev-fill-gayout was not created';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'P3: cron job ev-fill-gayout is inactive';
  END IF;
  IF v_sched <> '35 * * * *' THEN
    RAISE EXCEPTION 'P4: unexpected schedule %', v_sched;
  END IF;

  -- The wrapper is the whole point of scheduling via the effective command: a
  -- job that posts with a raw net.http_post works and records no runs.
  IF position('admin_automation_run_begin' in v_cmd) = 0 THEN
    RAISE EXCEPTION 'P5: cron command is not wrapped with admin_automation_run_begin';
  END IF;
  IF position('automation_http_post' in v_cmd) = 0 THEN
    RAISE EXCEPTION 'P6: cron command does not post through automation_http_post';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingestion_sources
    WHERE slug = 'gayout' AND edge_function = 'source-gayout' AND target_table = 'events'
  ) THEN
    RAISE EXCEPTION 'P7: ingestion_sources row for gayout is missing or mis-targeted';
  END IF;
END
$verify$;
