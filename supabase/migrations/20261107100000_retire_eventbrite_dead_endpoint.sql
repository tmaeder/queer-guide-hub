-- Retire `ev_fill_eventbrite`. The Eventbrite endpoint it calls does not exist.
--
-- `source-eventbrite` calls `https://www.eventbriteapi.com/v3/events/search/`.
-- Probed 2026-08-30 with no credential and again with a bogus bearer token —
-- both return, byte-identically:
--
--   HTTP 404 {"status_code":404,"error":"NOT_FOUND",
--             "error_description":"The path you requested does not exist."}
--
-- The 404 is returned *before* auth is evaluated, so this is not an expired
-- key and no key can fix it: Eventbrite removed public event search from the
-- v3 API, and the remaining surface only serves events of organisations the
-- token owns. There is no successor endpoint to repoint at. Corroborated by
-- the breaker: `api_circuit_breakers.eventbrite` has `success_count = 0` and
-- `last_success_at IS NULL` since the row was created on 2026-03-30 — it has
-- never once succeeded.
--
-- ── Why this ran for months with nothing complaining ────────────────────────
--
-- `source-eventbrite/index.ts:54` wraps each `withCircuitBreaker` call in a
-- per-item `try/catch` that only `console.error`s. `recordFailure` has already
-- run inside the breaker by then, so the two layers disagree by construction:
--
--   api_circuit_breakers   500 failures, state=open, last_failure_at 12:30:04
--   admin_automation_runs  status='success', consecutive_failures=0, 12:32:00
--
-- both measured on prod today, from the same 12:30 cron firing. The run row
-- even stores the response verbatim — `{"success":true,"items":0,...}`. A 200
-- resets `consecutive_failures`, so `auto_pause_threshold = 3` is structurally
-- unreachable for this automation and always was. `mp_fill_awin` is the control
-- that proves the mechanism: identical adapter shape, but its breaker call is
-- NOT inside a per-item catch (`source-awin/index.ts:57`), the throw reaches the
-- handler, it returns 500 — and it auto-paused at 33 failures.
--
-- The swallow itself is fixed in the same PR (source-eventbrite now returns a
-- `skipped` response and never calls the retired endpoint; source-foursquare
-- stops classifying an invalid credential as an API outage). This migration
-- only retires the schedule.
--
-- ── Two callers, and the cron is only one of them ───────────────────────────
--
--   cron `ev-fill-eventbrite`            30 */6 * * *  ← retired here
--   DAG  `events-ingestion-bulletproof`   0 */6 * * *  ← node left in place
--
-- The DAG node is deliberately NOT surgically removed: editing `nodes`/`edges`
-- to excise one source risks the topology of a live, working events pipeline
-- for no gain. The function-level change makes that node a cheap no-op skip
-- instead, which `pipeline-executor` records as *skipped* rather than *failed*,
-- so the DAG stays green and the breaker stops being touched from either path.
--
-- Disable, never delete: branch (b) of `sync_automations_to_cron()` is a kill
-- switch that unschedules any job whose registry row is disabled, so this
-- cannot be re-armed. A DELETE would instead make the live job "unregistered",
-- which branch (a) reports and pointedly never auto-kills.

update admin_automations
set enabled = false,
    description = coalesce(description, '')
      || ' [RETIRED 2026-08-30: eventbriteapi.com/v3/events/search/ returns HTTP 404'
      || ' NOT_FOUND with and without credentials — Eventbrite removed public event'
      || ' search from the v3 API and there is no successor endpoint. Breaker'
      || ' success_count has been 0 since 2026-03-30. Kept disabled rather than'
      || ' deleted so sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'ev_fill_eventbrite'
  and enabled;

-- Idempotent, and after the registry update so no concurrent reconciler pass
-- can re-add it in the window between the two statements.
select cron.unschedule('ev-fill-eventbrite')
where exists (
  select 1 from cron.job where jobname = 'ev-fill-eventbrite'
);

-- Assert the retirement actually took. `20260820191944` issued a cron.schedule
-- that silently never applied, which is why this block exists at all: a
-- migration that "fixes" a schedule is not evidence the schedule changed.
do $$
declare
  v_enabled boolean;
  v_jobs    int;
begin
  select enabled into v_enabled from admin_automations where slug = 'ev_fill_eventbrite';
  select count(*)  into v_jobs   from cron.job where jobname = 'ev-fill-eventbrite';

  if v_enabled is null then
    raise exception 'ev_fill_eventbrite registry row is missing — expected a disabled row, not an absent one';
  end if;
  if v_enabled then
    raise exception 'ev_fill_eventbrite is still enabled after the update';
  end if;
  if v_jobs <> 0 then
    raise exception 'cron job ev-fill-eventbrite still present (% rows)', v_jobs;
  end if;
end $$;
