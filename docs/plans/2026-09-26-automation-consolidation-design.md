# Automation consolidation design

## Objective

Reduce scheduler load and operational ambiguity while preserving bounded work,
stage-level observability, idempotency, failure isolation, and emergency kill
switches. The `admin_automations` registry remains the source of truth.

## Chosen approach

Use a hybrid domain-consolidation model.

- Keep dedicated latency-sensitive workers for publishing, notifications,
  workflow dispatch, search indexing, and automation run accounting.
- Consolidate related batch stages behind domain supervisors for Events,
  Venues, Cities, News, Marketplace, People, and shared Maintenance.
- Each supervisor invokes existing bounded stages independently, records a
  stage result, and continues past non-critical stage failures. It must not
  turn several jobs into one opaque transaction or one failure domain.
- Retire superseded cron entries only after the replacement has run
  successfully and postconditions prove that no work source was stranded.
- Prefer queue/event-driven work for new data. Retain scheduled reconciliation
  as a safety net rather than the primary execution path.

## Production repair

1. Reconcile enabled registry entries that lack a matching `cron.job`.
2. Register or correctly associate cron jobs missing from the registry.
3. Diagnose each auto-paused automation and either repair and re-enable it or
   retire it with an explicit reason.
4. Preserve completed and retired rows for audit history, but keep them disabled
   and unscheduled.
5. Keep registry and live cron schedules identical and enforce that invariant.

## Logic audit

For every automation capture:

- domain and operational owner;
- trigger and cadence;
- input queue or selection predicate;
- output and side effects;
- dependency and ordering constraints;
- idempotency and overlap protection;
- timeout, retry, auto-pause, and recovery behavior;
- useful-work rate, failure rate, and execution cost;
- retirement or consolidation recommendation.

The audit must distinguish true idle work from sampled or unverifiable run
accounting. A zero `items_changed` value alone is not grounds for retirement.

## Scheduling policy

- Spread independent periodic jobs across the hour.
- Preserve explicit pipeline stage order.
- Keep projected concurrency below the configured pg_cron capacity with room
  for manual runs and delayed executions.
- Reduce cadence only when queue-age and user-visible latency requirements are
  known.
- Supervisor-managed schedules remain owned by their supervisor rather than
  being manually fought by a second reconciler.

## Admin interface

The default view shows operational work, not historical clutter.

- Status views: Active, Attention, Paused, All.
- Retired/completed rows are hidden from Active and visible under Paused/All.
- Search covers name, slug, description, and domain.
- Domain and owner filters make related jobs scannable.
- Summary counts expose enabled, attention, paused, auto-paused, and total.
- Attention includes auto-paused jobs and enabled jobs with failure counters.
- Existing row actions and the detail drawer remain available.

## Verification

- Database postconditions for registry/cron coverage and schedule equality.
- No enabled row may carry a retired/completed marker.
- No retired/completed row may remain scheduled.
- Every live cron job must be registered or explicitly allowlisted.
- Domain supervisors must expose per-stage outcomes.
- UI unit tests cover status filtering, search, counts, and retired-row hiding.
- Production verification checks recent run failures and observed concurrency.

