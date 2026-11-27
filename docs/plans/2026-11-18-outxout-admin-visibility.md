# Out x Out admin visibility

Show both deployed Out x Out jobs on the default Pipelines inventory and in the definitions overview. Use the existing admin typography, controls and table layout. Backend automation registry rows own the schedules; do not populate pipeline schedule fields and accidentally create additional cron jobs.

A fixed two-row summary reads current automation schedules and queries native runs separately for each pipeline, so unrelated busy jobs and cancelled dry-run probes cannot hide the last real result. Show enabled state, Zurich schedule/time, latest run status/counts, run errors, and separately expandable source warnings. Link to existing schedule management and pipeline history. Missing permissions/data produce a retryable failure, not a fabricated empty or healthy state.

Project only the six city error arrays from the private official-date ledger. Do not fetch full source captures or model payloads into this summary. Reuse the same query cache to correct schedules and latest native results in the definitions overview. No database DDL or schedule mutations.

Verification: production REST projection, loader and UI regression tests, lint/type checks, desktop/mobile browser rendering, and the normal frontend production deployment with smoke checks.
