-- ============================================================================
-- lgbtnetwork.org — NY LGBT Network calendar (EventON)
-- ----------------------------------------------------------------------------
-- The only US source among the ten requested sites, and the largest by raw
-- count (2,380 events) — but deliberately the most conservative importer here,
-- because its location data is the worst of the set.
--
-- THREE MEASURED FACTS SHAPE IT (2026-08-22, live):
--
-- 1. The list has NO dates. /wp-json/wp/v2/ajde_events returns all 2,380 rows
--    with acf=[], empty event_type taxonomies and no date field — EventON keeps
--    occurrence times in its own table. Committing from the list alone would
--    reject every row on event_missing_start_date. Dates come from each detail
--    page's data-time="<start>-<end>" unix pair. The page also carries JSON-LD,
--    but its date is "2026-9-30T18:00-4:00" — unpadded month/day AND a one-digit
--    offset — which new Date() reads as NaN, and still NaN if only the offset is
--    padded. The epoch is primary; the repaired JSON-LD is the fallback.
--
-- 2. The host RATE-LIMITS. Eight rapid sequential requests return 403; at 700 ms
--    spacing it recovers to 202 with real content. An unthrottled sweep lost 46
--    of 86 pages, and because a 403 looks like an ordinary fetch failure the
--    loss reads as "this source has no data" rather than "we asked too fast".
--    The function throttles, retries a 403 once, and caps the batch at 250
--    (~3 min). It also skips ids already in event_sources or ingestion_staging,
--    so only the first few runs pay for the backlog.
--
-- 3. Only ~15% of events have a usable city, and the rest CANNOT be geocoded
--    safely. pipeline-validate treats no-venue_id + no-city + no-coords as
--    E_NO_LOCATION, an ERROR, so those rows are rejected outright. EventON's own
--    data-latlng is not a way out: it places the LGBT Network Queens LGBT Center
--    — 18 of 66 sampled events — at 33.4894,-112.1343, which is downtown
--    PHOENIX, ARIZONA, because "35-11 35th Ave" has no city and the site's map
--    API matched Phoenix's 35th Avenue. The Hamptons centre lands on Staten
--    Island. Independently geocoding with a locality taken from the venue name
--    was tried and rejected too: "44 Union Street" + "Hamptons" resolves to
--    Union Square, Manhattan, and a state-level check cannot distinguish that
--    from a correct answer.
--
--    So a venue is accepted ONLY when its address states city AND state, and
--    events without one are dropped IN THE PARSER rather than staged — staging
--    them would bank ~2,000 rejected rows to learn what is knowable up front.
--    Expected yield is therefore ~350 events with real addresses, not 2,380 of
--    which 85% are rejected. A missing location is recoverable; a wrong one on a
--    queer venue is not.
--
-- EVENT_TYPE IS A FLAT 'other'. Reusing the shared title-inference ladder was
-- measured over 330 real titles and must not be used here: of the 37 it typed
-- `drag`, only 3 contain "drag" — the other 34 matched on "Queens", the NEW YORK
-- BOROUGH, and 26 of those are youth events ("Queens Queer Youth Group (13-18)").
--
-- EVENTS ONLY. at_biz_dir (103 rows) is a general business directory containing
-- e.g. a marketing agency, not a queer venue list.
--
-- CADENCE. Daily 03:30 — free, clear of the 02:xx ladder and the Monday 03:10 /
-- 03:20 weekly jobs. Daily because the backlog needs several runs to drain;
-- afterwards each run is the list plus only genuinely new events.
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
  'ev_fill_lgbtnetwork',
  'Fill NY events from LGBT Network',
  'Daily 03:30: source-lgbtnetwork walks lgbtnetwork.org''s WP REST event list, skips ids already seen, and fetches only new detail pages at 700ms spacing (the host 403s under load). Dates come from EventON''s data-time unix pair, not its malformed JSON-LD date. Events whose address does not state city AND state are DROPPED, not staged: their locations cannot be geocoded safely and pipeline-validate would reject them. event_type is a flat ''other'' because title inference mislabels youth events as drag. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','ev-fill-lgbtnetwork','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-lgbtnetwork',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_size":250}'::jsonb,
    timeout_milliseconds := 400000
  );
$$),
  '30 3 * * *'
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
    PERFORM cron.unschedule('ev-fill-lgbtnetwork');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'ev_fill_lgbtnetwork';

-- ----------------------------------------------------------------------------
-- ingestion_sources: the human-facing source registry the admin surfaces read.
-- ----------------------------------------------------------------------------
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
VALUES ('NY LGBT Network Calendar', 'lgbtnetwork', 'scraper', 'events', 'source-lgbtnetwork', true, false, '30 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      source_type   = EXCLUDED.source_type,
      target_table  = EXCLUDED.target_table,
      edge_function = EXCLUDED.edge_function,
      is_enabled    = EXCLUDED.is_enabled,
      schedule      = EXCLUDED.schedule,
      updated_at    = now();
