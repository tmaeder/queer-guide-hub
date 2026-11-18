# Pride Places backend pipeline release

The user approved every business category and all events, Sundays at 03:00 UTC.
The source function and schema are deployed. The coordinated migration hold was
released at main commit `bb65f03985f8bd088874b1546b1412e37561e4d2` after production
migration reconciliation. Scheduling remains paused until live collection passes.

## Operation

The authenticated source accepts POST bodies:

- `{ "action": "start", "batch_size": 4 }`: start or reuse this weekly scan.
- `{ "action": "continue", "run_id": "…", "batch_size": 4 }`: resume a bounded batch.
- `{ "action": "status", "run_id": "…" }`: return durable source coverage.
- `{ "dry_run": true }`: read-only index discovery sample; explicitly incomplete.
- `{ "action": "start", "force": true }`: an intentional additional manual scan.

Only internal callers and admins are authorized. Queue RPCs and tables are restricted
to service_role. Maximum batch size is eight pages, default four; fetches have a
20-second deadline and a three-megabyte response cap. Business profiles parse only
JSON-LD and their fallback heading. Leases expire after three minutes, work has at
most three attempts, and overlapping starts reuse the active scan. A six-hour limit
fails an incomplete scan rather than leaving it permanently active.

Source HTTP requests explicitly close their connection after use. The origin
advertises a five-second keep-alive window, and the first production scan showed
intermittent timeouts in the Edge worker despite fast independent page reads.
This scoped mitigation retains the same fetch deadline, retries and coverage gates;
its effect must be checked in the live scan rather than inferred from local tests.

The native automation registry contains `prideplaces_weekly_sync` (`0 3 * * 0`)
and `prideplaces_scan_continue` (once per minute, conditional on an active scan).
Both are installed disabled. `ingestion_sources.slug=prideplaces` exposes the adapter
to the shared weekly registry scheduler; a later parent dispatch reuses the completed
source scan from the same weekly period. The returned `source_run_id` is the source
coverage authority. A parent acknowledgement of a running scan is not completion.
The shared parent must use `prideplaces_start_scan(false)` as the transactional
starter and wait on its returned run UUID. Starting a generic one-node graph would
only acknowledge the first batch, so that wrapper is not the scan completion signal.

The separate `prideplaces-weekly-sync` pipeline run shows collection status, expected
and distinct business counts, event count, unchanged records, staged/review revisions,
pending work, missing known businesses and bounded source errors. Collection completion
does not mean downstream validation/review/commit has completed. Changed existing
businesses and known recurring event series require fresh conflict review. No canonical
records are deleted or archived when a source listing disappears.

## Verification performed

- Fifteen Deno tests: index discovery, short `/pro/…` identities, source restrictions,
  factual normalization, Facebook identifiers, incomplete profiles, visible event dates,
  missing times, DST gaps/folds, overnight events, hashes and bounded HTTP reads.
- Actual migration executed in isolated PostgreSQL 17: service-only privileges/RLS,
  disabled release switches, overlapping starts/claims, replay, lease expiry, scan deadlines, retries,
  legacy cache adoption, source reversions, organizer preservation, recurring-series
  conflicts, fresh validation gates and failed coverage.
- Full captured-corpus replay through the actual PostgreSQL queue: all 68 business
  index pages, 807 businesses and six events. Result: 802 unchanged, 11 Review revisions,
  zero failures, zero pending work. All 813 original staging payloads and statuses
  remained unchanged. This is an isolated replay, not a production deployment claim.
- Corpus parser replay: 807/807 businesses, six event listings; no parse errors.
  Business parse maximum approximately 70 ms locally after eliminating template DOMs.

Local queue verification:

```sh
QG_TEST_POSTGRES_BIN=/path/to/postgres/bin bash tests/sql/prideplaces-sync/run.sh
deno test --allow-net --allow-env --allow-read --node-modules-dir=none \
  supabase/functions/_shared/prideplaces-parse.test.ts \
  supabase/functions/source-prideplaces/runtime.test.ts
deno check --node-modules-dir=none supabase/functions/source-prideplaces/index.ts
```

## Production release after the hold is explicitly lifted

1. Rebase/merge current main and allocate this unapplied migration above current
   applied history using the repository allocator. Pass CI and migration-history checks.
2. Deploy the source function and migration through the existing release workflow.
   Keep the new registry and automation entries disabled initially.
3. Verify unauthenticated invocation is denied and authenticated dry-run is read-only.
4. Start a real full scan and continue bounded batches to terminal coverage. Verify
   distinct business count matches the current published total, event pagination is
   exhausted, errors are zero, and historical canonical/curated values are preserved.
5. Enable the Pride Places source registration, pipeline definition and both automation
   registry rows. Use native cron reconciliation / `admin_automation_effective_command`
   so the persisted commands retain their pause and recovery controls.
   `scripts/data-quality/install-prideplaces-weekly-schedule.sql` performs this in
   one transaction, rejecting active, failed, stale or incomplete scans and verifying
   weekly run reuse and exact cron readback. It reconciles only the two owned jobs.
6. Read back `cron.job`: the starter is active at `0 3 * * 0`, the continuation is
   active at `* * * * *`, and each uses its registry command. Confirm no overlapping
   source scan can be created by the shared weekly parent.

Do not rename any migration that has already been applied. Do not enable schedules
or claim live weekly synchronization before the real scan and cron readback succeed.
