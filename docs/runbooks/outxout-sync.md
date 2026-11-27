# Out x Out backend sync

The `outxout-catalogue-sync` pipeline owns a durable child run in Supabase. It
collects the public sitemap, city catalogues, paginated city-event API,
professional directory and sports CSV. It preserves the original `outxout`
source namespace and canonical identities.

## Schedule and execution

`admin_automations` owns the schedules:

- `outxout_weekly_sync`: Wednesday 08:00 Europe/Zurich. Cron wakes at 06:00 and
  07:00 UTC; `outxout_tick(true)` checks the local due time and current week's
  run before starting, so DST does not shift the requested hour or start twice.
- `outxout_sync_continue`: once per minute, active scans only. This recovers
  dropped HTTP wakes; successful batches also enqueue the next wake directly.

The pipeline has a 24-hour **whole-scan** timeout. Each worker claims a
110-second lease, fetches at most four public pages concurrently, and writes
20-record transactions. These are separate budgets. Three failed page attempts
fail that work item. Three interrupted processing attempts stop the run; failed
attempts back off for a minute. Work, leases and cursors live in Postgres.

Use the backend pipeline's Run action, or invoke `source-outxout` with an
authenticated admin/service request. The handler requires the project's
internal secret, service-role bearer or authenticated admin even though gateway
JWT verification is disabled for the cron entrypoint. GET cannot start a scan.

## Adapter contract

The `ingestion_sources` entry is `outxout`, function `source-outxout`. Events are
its primary registry target; `config.target_tables` also declares venues and
organisations. Its `execution_mode` is `durable_child_pipeline` and it owns
downstream processing. A parent dispatcher's `pipeline_run_id` is not adopted as
the child's run ID.

| Request | Behavior |
| --- | --- |
| `{}` | Start a catalogue scan, or join the already-active scan |
| `{"run_id":"<returned UUID>"}` | Process/resume one bounded batch |
| `{"dry_run":true}` | Read-only public-format preview |
| `{"scope":"canary"}` | Bounded sample of event, venue, practice and sports sources; never a complete-catalogue claim |

Responses return `run_id`, `pipeline_run_id` and `continuation_pending`. A parent
must retain the native `run_id` to follow a child to completion; an HTTP 200 with
`continuation_pending:true` is a checkpoint, not a completed import. The child
performs validation, deduplication, review routing and commits itself; a parent
must not independently commit the same staging cohort. The durable scan state
is authoritative for completion.

## Data and review safeguards

- Existing source IDs and native publisher IDs resolve before new staging or
  canonical inserts. Aliases share staging identity even before first commit.
- Stable factual comparisons exclude retrieval timestamps. Repeated unchanged
  input skips canonical writes. Changed uncommitted automatic staging facts
  re-enter validation; prior human review states are retained.
- Eligible source-owned fields can update only when the current canonical value
  still matches the prior source value, or is missing. Other conflicts enter
  review with the source proposal and field-level reasons.
- Missing/empty partial-page values never delete existing facts. Changed
  locations, media, tags and service scope are held for review. Reviewed dates,
  source-marked TBC dates, specific existing categories and independent field
  provenance have additional guards. Coordinates are not refilled from city or
  venue centroids by this adapter.
- Approved official date corrections and the original unconfirmed-date holds
  remain intact. The separate weekly official-date automation is independent.
- Professionals map to explicitly published employers/practices. New
  organisations need a verified country/city and exact deduplication before
  commit; newly created organisation rows start as drafts.
- Source listing URLs are provenance, never automatic ticket links or official
  business homepages. A missing listing does not close or cancel an entity.

## Inspecting runs

`pipeline_runs` provides backend history. The source-specific tables are
service-only (RLS enabled, no public/authenticated grants):

| Table | Purpose |
| --- | --- |
| `outxout_sync_runs` | Phase, lease, heartbeat, observation and review counters |
| `outxout_sync_work` | Page/API cursor tasks, retries, errors and completion |
| `outxout_sync_entities` | Stable source/native IDs and staging/canonical links |
| `outxout_sync_changes` | Source snapshots, actual applied patches and conflicts |

Later audit versions also retain the actual previous canonical row for changed
records. Reconciliation notes identify baseline-format corrections or restored
partial-page omissions. Run counters describe source processing; use individual
verified change rows to distinguish canonical changes from formatting changes,
held proposals and reconciled attempts.

Inspect a failure before resuming. Existing checkpoints allow an operator to
requeue only failed tasks after fixing the cause; preserve successful tasks and
the original source namespace. Paused/cancelled backend pipeline runs are
honoured by the worker and cron dispatcher. Never reset an unrelated pipeline,
replay the original one-off import scripts, or label an incomplete scan complete.

## Verification

- `node --test supabase/functions/source-outxout/parse.test.ts`
- `deno check --node-modules-dir=none supabase/functions/source-outxout/index.ts supabase/functions/pipeline-executor/index.ts`
- `scripts/data-quality/outxout-tests/guards.sql`: lease, permissions, existing alias and
  officially corrected-date regressions; run when no real scan is active.
- `scripts/data-quality/outxout-tests/commit.sql`: rollback-only canonical venue,
  event and organisation commits, new native aliases and repeat commits.

Live evidence and production migration snapshots are in the operator workspace
`outputs/outxout-import-2026-11-18/`. Migration files recovered from production
are already applied; do not replay them as new migration versions. The shared
executor was deployed by patching its current production files, preserving the
existing reliable-step implementation rather than replacing it with an older
checkout. Keep that distinction when deploying from a branch behind main.
