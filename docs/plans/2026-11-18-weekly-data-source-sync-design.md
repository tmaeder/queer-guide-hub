# Weekly data source sync

Approved by the user on 2026-11-18: one weekly parent pipeline covering all registered data sources, discovered dynamically, respecting enabled/paused settings, with individual outcomes and an editable Sunday 06:00 UTC schedule.

## Behavior

- Expose the pipeline through the existing backend Pipelines interface, with manual runs and normal run history.
- Snapshot all three registries at run start: scrape_sources, ingestion_sources, and news_sources. The current inventory is 488 entries, but registration changes must not require code changes.
- Execute enabled, unpaused sources through their existing adapters. Record disabled/paused entries as skipped and unsupported or unconfigured adapters as blocked with actionable, non-secret reasons.
- Bound concurrency, request durations, and per-source batches. Preserve backoff/rate limits and prevent overlapping weekly runs or duplicate processing after retries.
- Retain per-source success, skipped, blocked, and failed outcomes and honest fetched/staged/error totals. A partial failure must not silently become a wholly successful run or suppress unrelated sources.
- Send imported records through the existing staging, validation, deduplication, enrichment, and review rules. The weekly schedule does not grant publication approval.
- Keep credentials on the server; do not store secrets in pipeline snapshots, browser state, error messages, or run summaries.

## Approach

Reuse the native pipeline engine and source adapter contracts rather than add independent cron jobs for each source. One parent run gives admins one weekly audit trail. Three registry-specific pipelines would fragment that trail; a static source list would omit future registrations.

Implementation may add a registry planner and scoped source dispatcher where existing nodes do not support dynamic source identities. Preserve the normal pipeline editor and scheduler contracts. Commit database changes before production deployment; do not apply uncommitted production DDL or create production-only migration history.

## Execution details

Use one native pipeline run with a compact parent graph and an admin-only table of per-source jobs. Build the inventory transactionally in SQL, so Data API pagination cannot silently truncate it. Schedule at most three jobs through the existing pipeline_steps queue; service-only claim/finish RPCs own leases, retries, atomic totals, and final run status. Fast wakes may accelerate delivery, while the durable queue remains the fallback. Use a dedicated registered worker and route this pipeline's manual control to its entrypoint; preserve the shared executor and other pipelines' execution behavior.

Recheck each registry entry before dispatch, skip duplicate scraper/feed umbrella registrations, and keep source configuration out of snapshots and outcomes. Use the existing scoped source_id/source_ids adapter contracts. Detect per-source errors even when a legacy adapter returns HTTP 200. Expose paginated source results in the existing run detail view, including exact missing setting names without values. Recovery and schedule changes must use the established automation/cron conventions and preserve admin pause controls.

## Verification

Test complete paginated discovery, source identity/adapter routing, disabled/paused handling, missing settings, limits, retry/idempotency, partial failures, authorization, and credential redaction. Exercise real PostgreSQL scheduling/claim behavior where SQL owns concurrency or state transitions. Run required CI, deploy through the repository workflow, verify the editable schedule and a production run, and compare production migration versions with main after deployment.

Source-specific durable pipelines retain their own transaction starters, cursors and review gates. The parent reuses active runs, respects paused pipelines, and records a skip for a verified successful refresh within the last seven days. Otherwise it waits for the source run to finish and verifies its status and staging count. Waiting polls retain their concurrency slot and do not consume source import retries. The parent has a two-day timeout to accommodate full catalogue imports; cancellation clears outstanding parent jobs without cancelling independent child runs.

Function-specific configuration changes select only affected deployments. Global configuration or shared dependency edits still redeploy all functions. This prevents this release from rolling back separately deployed source importers whose recovery code is not yet on main.
