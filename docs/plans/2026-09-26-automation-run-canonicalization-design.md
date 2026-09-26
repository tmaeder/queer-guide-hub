# Automation Run Canonicalization and Backpressure Design

Date: 2026-09-26
Status: approved
Scope: scheduled HTTP automation run accounting, circuit-breaker state, state-change audit, and search reindex backpressure

## Problem

The automation registry has two competing run writers. The database opens and reaps a transport run for scheduled HTTP work, while several Edge Functions insert a second semantic run and update the registry directly. One execution can therefore produce both success and error rows, increment or reset the circuit breaker more than once, and leave an auto-paused job looking healthy after a later writer resets its counters.

The search reindex drain already prevents overlap with an advisory transaction lock, but a single slow entity can consume most of the 110-second statement budget. Because claimed queue rows and indexing happen in one transaction, a statement timeout rolls back the entire batch and retries the same expensive work on the next minute.

## Alternatives Considered

1. Patch only the currently noisy venue and hotel jobs. This is fast but preserves the competing-writer architecture and lets the same defect recur in other Edge Functions.
2. Treat HTTP status as the only result. This guarantees one row but loses semantic failures returned with HTTP 200 and makes circuit breaking less truthful.
3. Use one canonical run row with an idempotent semantic finalizer and a transport fallback. This keeps semantic detail, gives the circuit breaker one terminal transition, and remains safe when an Edge Function crashes before reporting. This is the selected approach.

## Canonical Run Contract

- `admin_automation_run_begin` creates the only run row for a scheduled HTTP execution.
- `automation_http_post` attaches the run id to the internal request in `X-Automation-Run-Id` while retaining request-id correlation in `admin_automation_run_requests`.
- `admin_automation_finalize_run` is service-role-only, locks the run row, validates its status and ownership, and changes `running` to one terminal state exactly once.
- Edge Functions that currently write `admin_automation_runs` finalize the supplied canonical row. Calls without a run id may create and finalize one self-owned row so manual/internal invocations remain observable.
- The response reaper remains the transport fallback. It finalizes only rows still marked `running`; a semantic result always wins if it landed first.
- Compatibility helpers update the run row only. They never update `admin_automations` directly.

## Circuit-Breaker Contract

- The `admin_automation_runs_after_finish` trigger is the sole writer of `consecutive_failures`, `last_run_at`, `last_run_status`, and automatic pause state.
- Only the first terminal transition counts.
- `error` increments the counter; `success` resets it; `partial` records visibility without claiming success and does not erase a preceding failure streak.
- Automatic pause also updates `lifecycle_state = 'auto_paused'` and unschedules the job immediately. Reconciliation cannot re-arm it while disabled.
- Manual enable/disable, maintenance transitions, and automatic pauses write append-only state events with actor, source, reason, and before/after values.

## Backpressure Contract

- Keep the search drain's non-blocking advisory lock.
- Bound each invocation by both row count and elapsed time, so the function stops claiming new entities with headroom before the statement timeout.
- Process smaller chunks ordered by queue id and keep per-entity exception isolation.
- Record skipped-overlap, elapsed-time stop, claimed, completed, failed, remaining, and oldest-queue-age signals in the singleton stats row.
- Do not slow productive marketplace image or quality jobs solely because they run frequently; cadence changes require queue-age evidence.

## Verification

- SQL regression tests prove idempotent finalization, one circuit-breaker update, semantic-result precedence, partial-run semantics, automatic pause lifecycle, and state-event creation.
- Static/function tests prove direct Edge Function writers use the canonical finalizer.
- Search-drain tests prove overlap and time-budget exits are non-errors and preserve queued work.
- Production verification checks duplicate mixed-status rows stop appearing, a rolled-back synthetic run cannot double-count, the search drain stays below its time budget, and the admin UI remains truthful.
- The final browser E2E exercises the production automation page without dispatching unrelated jobs.

## Rollout

Apply the database migration first, then deploy the affected Edge Functions, then reconcile cron commands. Existing historical duplicate rows remain immutable audit history; only new executions use the canonical contract.

