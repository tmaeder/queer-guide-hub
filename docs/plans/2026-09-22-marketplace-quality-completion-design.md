# Marketplace quality completion design

## Objective

Finish the remaining production remediation without bypassing the reversible
claims, event ledger, domain throttling, or worker auto-pause controls already
deployed.

## Options considered

1. Keep the conservative schedules unchanged. This is operationally safe but
   leaves link freshness draining for roughly two weeks and does not repair the
   two paused workers.
2. Run direct bulk SQL rewrites. This is fast but bypasses source recovery,
   HTTP validation, image state transitions, per-listing events, and rollback.
3. Repair the worker lifecycle defects and temporarily accelerate the existing
   claim-based pipelines. This retains bounded concurrency and idempotency while
   completing the backlogs materially faster.

## Decision

Use option 3.

- Deploy taxonomy classification with gateway JWT verification disabled; the
  function continues to authenticate `X-Internal-Secret` or an administrator.
- Treat exhausted daily LLM budget as a deferred terminal outcome for run
  accounting, schedule description enhancement at a budget-compatible cadence,
  and automatically make it eligible again on the following UTC day.
- Re-enable the two workers only after production dry runs pass.
- Temporarily raise bounded worker cadence, preserving atomic `SKIP LOCKED`
  claims and per-domain serialization. Restore steady-state schedules when the
  corresponding backlog reaches its acceptance threshold.
- Correct rollout change counts, observed-rate ETA calculations, and stalled
  worker coverage. Alerts must include the taxonomy model and image optimizer.
- Recompute safety rating after taxonomy changes and rebuild affected search
  documents through the existing listing update path.

## Completion gates

- Taxonomy v4 rollout complete; `department='other'` below 2%.
- No known high-confidence adult/Safe Mode contradictions.
- All eligible listings visited by variant extraction.
- At least 95% of active listings have a healthy optimized image.
- At least 95% of eligible links are checked or feed-confirmed within 30 days.
- Description source recovery/generation worker is productive or every queued
  row has a recorded terminal/deferred reason.
- Worker metrics and alerts reflect actual examined, changed, terminal, failed,
  throughput, and ETA values.
- Database tests, build checks, production deployment, and marketplace E2E pass.
