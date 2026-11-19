# GayOut weekly backend sync

The approved design adds a dedicated `gayout-weekly-sync` pipeline to queer.guide's existing backend pipeline system. It runs every Monday at 03:00 UTC. The backend owns its schedule, checkpoints, retries and run history.

## Scope

Discover the complete GayOut venue and event sitemap inventories. Include organisation listings using the production organisation routing contract. Fetch factual names, locations, public business contacts and explicit event dates. Preserve source identities, occurrence identities, hashes and evidence. Do not copy reviews, ratings, photographs or editorial descriptions.

The initial population and later weekly updates use the same resumable flow. A page or batch limit bounds each invocation, rather than truncating the inventory. Unchanged payloads remain idempotent. Source disappearance alone never deletes a shared canonical record.

## Backend flow

Register a GayOut source node and a dedicated scheduled pipeline. Keep venue/organisation processing and event processing scoped to their appropriate targets and the current pipeline run. Reuse the existing validation, deduplication, review and commit stages. Keep ambiguous matches and incomplete records in review.

Persist inventory progress and per-URL fetch state in the database. Claim small batches with leases so retries and duplicate deliveries do not process the same work concurrently. Resume interrupted discovery and detail fetching from saved state. Use bounded continuations for stages that have more work; drain validation and commit batches before declaring completion. Run source branches in a controlled order to respect source limits and the pipeline engine's concurrency model.

Use existing backend extraction providers and credentials. Detect security challenge pages and exhausted provider quotas explicitly. A blocked fetch fails visibly and retains its checkpoint; it must never become a successful empty sync. Unknown event dates and city-centre placeholder coordinates are not invented or restored.

## Scheduling and access

Use the project's backend scheduler with cron expression `0 3 * * 1`. Allow one active sync at a time. Queue and checkpoint data are internal. Source endpoints require the existing internal-or-admin authentication, and credentials remain server-side. Apply least-privilege grants and row-level security to new exposed-schema tables.

## Verification

Test sitemap and detail parsing, challenge detection, recurring-event identities, idempotency, lease ownership, resumption and continuation boundaries. Verify that every stage remains source/run/target scoped. Check that unknown dates, ambiguous duplicates and incomplete locations remain outside automatic commit.

Deploy and read back the function and pipeline definitions. Verify the weekly job is enabled exactly once. Run a backend dry run and inspect its final run state, including truthful source-blocked behaviour when retrieval is unavailable. Run database advisors after schema changes.

## Approval and implementation tasks

- [x] Inspect repository and production pipeline state.
- [x] Compare a dedicated weekly pipeline with adding sources to existing ingestion pipelines.
- [x] Obtain explicit approval for the dedicated pipeline and Monday 03:00 UTC schedule.
- [x] Record the approved design in the repository's existing plans directory.
- [x] Implement and test the source adapter, checkpoints and bounded continuations.
- [x] Deploy, schedule and verify the backend pipeline.


## Deployment verification — 18 November 2026

The dedicated pipeline is enabled with 11 nodes, maximum concurrency one, and one active backend cron job (`2860`) scheduled `0 3 * * 1`. Its first scheduled execution is Monday 23 November 2026 at 03:00 UTC (04:00 Europe/Zurich).

Deployed function versions verified by read-back: `source-gayout` 493, `pipeline-executor` 1967 and `pipeline-commit` 1970. The shared executor and commit deployments preserved their live dependencies and unrelated pipeline changes.

The applied migration is `20261118181545_gayout_weekly_backend_sync.sql`. Its local text exactly matches the production migration history statement. The production migration hold arrived after this migration was applied; no subsequent DDL was executed. The scheduler was enabled through the repeatable DML script `scripts/data-quality/install-gayout-weekly-schedule.sql`.

Eight parser/provider/continuation tests passed. The pure helpers passed TypeScript checking. The SQL integration test passed in a transaction that rolled back fixtures, canonical writes and queue messages. It verified single-active-run behavior, exclusive step claims, stale-token rejection, inventory discovery, idempotent staging, target-scoped commit, organisation location storage, gap-only contact updates, successor readiness and duplicate completion rejection.

Production dry run `41d8ff59-972c-4093-9a93-c9b348c335f3` failed visibly at `source-places` with `E_GAYOUT_PROVIDER_QUOTA`: the configured Firecrawl backend account has no credits, following a blocked direct GayOut request. It staged no records and made no canonical changes. This verifies truthful failure handling, not a successful production import. Restoring provider credits or source access remains necessary for acquisition. After restoring access, start `gayout-weekly-sync` from the backend pipeline UI, or wait for its Monday schedule; checkpoints persist across later runs.

Database advisors reported no new GayOut performance warnings. The two new internal tables intentionally have RLS enabled with no public policies; public, anonymous and authenticated table/function access is revoked, and service-role access was verified. The corresponding RLS-with-no-policy notice reflects this deliberate internal-only access model.


## Native acquisition recovery

After the weekly deployment, the remaining missing-venue URL queue was fully attempted: 5,878 total URLs, 1,564 readable responses and 1,337 factual address candidates. The local evidence manifest is `gayout-import-20261118/native-detail-facts.json`. It contains 116 organisation listings, 1,028 published phone numbers and 945 published websites. Source map links supplied 1,312 coordinate pairs across this recovery effort; 1,231 candidate records passed city/proximity/centroid checks. The others retained addresses without unverified pins.

Recovery run `4804b521-3e2c-4471-85d9-96980447b110` staged the captured facts through the deployed URL leases and source-scoped staging RPCs, with organisations routed to `organizations`. It preserved existing human review holds and then entered the normal DAG validation/deduplication/commit sequence. This is a partial source recovery, not proof of complete site import.

The first production deduplication batch showed that 50 records could exceed the invocation budget under backend connection pressure. GayOut execution now caps duplicate-checking requests at five records, including older snapshots; the definition's deduplication batch sizes were adjusted through DML to match. The matching logic and review thresholds were retained. No database DDL was executed during the migration hold.


Recovery retry `acd1f72d-2881-44a6-90ab-ae22587a9544` reused all 1,337 completed URL checkpoints after the first run ended with a deduplication invocation timeout. The retry uses the five-record deduplication cap. Ninety existing quality holds passed the standard validator after their factual contacts/coordinates were enriched; 113 superseded validation flags were resolved across the approved cohort. A further 388 pending records reused an existing GayOut-to-venue identity only after corroborating Unicode-preserving name, country, address or coordinates, unique canonical target and distance guards; every decision has an audit record. Uncertain matches retain their review gates.


The existing GayOut mega-event adapter remains available under its original request contract. The dedicated DAG sends `gayout_weekly_sync: true` to the source endpoint, which dispatches to `source-gayout/weekly.ts`; other requests continue through the existing adapter. Source and executor deployment bundles were rebuilt without removing the original parser, ordering logic or legacy dependencies.

### Organisation query repair and account constraint

The follow-up request asks for working duplicate checks and an acquisition alternative using existing accounts. Production has roughly 110,000 organisations. The legacy candidate RPC repeatedly evaluates normalization wrappers with a function-local search path; every attempted organisation search in the recovery cohort exceeded PostgREST's eight-second limit. Those 108 uncommitted `unique` verdicts were audited and reset before resuming.

The GayOut organisation path now uses a parameterised direct read with materialised input and inline expressions equivalent to the existing immutable normalizers. All four candidate arms, score values, minimum-name lengths and result limits are retained. It runs as `service_role` with a 25-second statement limit, five-second lock limit and a closed single-connection pool. GayOut organisation batches are capped at two even for older run snapshots. Any query error still fails the stage and leaves the item pending. Other source policies are unchanged. No production DDL or new migration version is required.

Nine PostgreSQL fixture comparisons against the installed legacy query passed, covering domain corroboration, accents, spacing, absent matches, non-Latin names, empty input and result limits. The representative live query returned its expected two candidates in approximately 5.5 seconds. The backend recovery is processing the captured organisation facts through the standard matching and review gates.

The user does not want a new scraper account. Live probes found that Jina Reader returns a GayOut security challenge, the existing Cloudflare extraction worker returns HTTP403 or a challenge, and a dedicated Browser Run probe still returns a challenge after waiting for page completion. The temporary probe function and worker were deleted. These are failed acquisition probes, not completed imports. Firecrawl remains the last configured fallback; no unverified replacement or additional paid account was enabled. Completing acquisition needs usable source access or a source-provided feed/export within the user's existing-account constraint.

The coordinated production migration hold was subsequently released after PR #5378. Main was fetched and merged into this follow-up. The explanation seed was renamed, with identical SQL, to `99991795031297_gayout_weekly_pipeline_explanations.sql` and is already applied; the old `20261118190727` stamp must never be applied. The organisation repair still requires no DDL. Its production recovery completed all 116 checks, created 67 searchable organisations and retained 49 possible duplicates for review. Acquisition then failed explicitly at source-events because the configured Firecrawl account had no credits.
