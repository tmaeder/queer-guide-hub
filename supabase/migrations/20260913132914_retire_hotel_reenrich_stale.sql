-- Retire `hotel_reenrich_stale`. It has never worked, it cannot work against
-- the endpoint it targets, and the need it was created for no longer exists.
--
-- IT CANNOT WORK
--
-- The command posts `{"venue_ids":[...50 uuids],"reason":"scheduled_reenrich"}`
-- to `enrich-venue`. That function takes `{venueName, currentData}` — ONE venue,
-- by NAME — so every run since it was created has answered
-- `400 {"error":"Venue name is required"}`.
--
-- Reshaping the body would not fix it, which is the whole reason this is a
-- retirement and not a patch. `enrich-venue` contains no `.from()`, `.insert`,
-- `.update`, `.upsert` or `.rpc` anywhere: it queries Foursquare / Google /
-- TomTom / TripAdvisor and RETURNS the merged result for the admin UI to
-- preview. It writes nothing. pg_net discards response bodies. A "fixed" body
-- would buy a cron that returns 200, burns four external API quotas per call,
-- and persists nothing — a green cron doing no work, which is strictly worse
-- than a red one because it stops anyone looking. Nothing else in the codebase
-- accepts `venue_ids` for venue re-enrichment either; `amenity-truth-backfill`
-- does, but that is the amenity engine, with its own daily cron and its own
-- coverage-based selector.
--
-- THE NEED IS GONE
--
-- Measured on prod 2026-08-19: 339 live accommodation venues, EVERY one with a
-- non-null `last_refreshed_at`, and exactly ONE older than the 90 days this job
-- selects on. The Venue Truth Engine landed 2026-05-30, six weeks AFTER this
-- cron (20260415140000), and its daily `venue-ingestion-unified` consensus pass
-- stamps `venues.last_refreshed_at` on every venue it touches. That drained the
-- queue this job was built to drain.
--
-- The targeted per-venue re-fetch this job was reaching for is still unbuilt:
-- `venues_due_for_refresh()` exists but has ZERO callers outside migrations,
-- generated types and docs. If it is ever built, it needs a new endpoint that
-- writes — not this row re-enabled.
--
-- DISABLED, NOT DELETED — and the row was already disabled, so the point of
-- this migration is INTENT, not mechanism.
--
-- Auto-pause had already set enabled=false on 2026-08-19 at
-- consecutive_failures=3. That state is indistinguishable from a job that is
-- merely broken and awaiting a fix, and it is exactly the state a future
-- "un-pause the auto-paused jobs" sweep would reverse. Recording the decision
-- in `description` + `last_run_status='retired'` and zeroing the counter makes
-- the disablement deliberate and legible instead of an artifact.
--
-- Deleting the row is the wrong move for the reason 20260813100000 established:
-- branch (b) of `sync_automations_to_cron` is a kill switch that unschedules any
-- job whose registry row is disabled, so a disabled row makes resurrection
-- impossible rather than merely undone. A DELETE would instead make any future
-- live job "unregistered", which branch (a) reports and pointedly never
-- auto-kills. Nothing in the schema can re-enable this on its own — the only
-- writers of `enabled=true` are the admin-gated `admin_automation_set_enabled`
-- and hand-written migrations.

update public.admin_automations
set enabled = false,
    last_run_status = 'retired',
    consecutive_failures = 0,
    description = coalesce(description, '')
      || ' [RETIRED 2026-08-19: posts {venue_ids} to enrich-venue, which takes'
      || ' {venueName} for a single venue and writes nothing (preview endpoint for'
      || ' the admin UI) — every run 400''d since 20260415140000 and it has never'
      || ' recorded a success. Superseded by the Venue Truth Engine consensus pass,'
      || ' which stamps venues.last_refreshed_at: 339 live accommodation venues, 1'
      || ' older than 90 days. Do NOT re-enable — a targeted re-fetch needs a new'
      || ' endpoint that WRITES, driven by venues_due_for_refresh() (currently'
      || ' callerless). Kept disabled rather than deleted so branch (b) of'
      || ' sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'hotel_reenrich_stale'
  -- Not `and enabled` (the 20260813100000 guard): auto-pause already disabled
  -- this row, so that predicate would make the whole migration a silent no-op.
  and coalesce(description, '') not like '%[RETIRED%';

-- Guarded unschedule. Auto-pause's kill switch already removed the job, so this
-- is belt-and-braces for idempotency and for any environment where it survived.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hotel-reenrich-stale') then
    perform cron.unschedule('hotel-reenrich-stale');
  end if;
end $$;
