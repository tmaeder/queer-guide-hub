# Keep location wakeups from blocking profile repairs

A guarded Colgay Pride address/city repair rolled back on the singleton `entity_location_worker_lease` row. The profile trigger enqueued a location job, whose wake trigger waited for the global worker lease. This best-effort notification must not hold up the durable profile/job transaction.

Use `SELECT ... FOR UPDATE SKIP LOCKED` inside the existing wake function before updating its dispatch timestamp. Preserve the lease eligibility and 60-second debounce predicates, webhook and timeout, function ownership, ACL and security configuration. The existing active 50-second worker cron remains the recovery path for skipped notifications. Raising timeouts would retain contention; swallowing all exceptions would conceal unrelated failures.

Validate against the real historical function in a disposable PostgreSQL cluster. Hold the lease in another connection: demonstrate the old trigger blocks, then prove the migrated trigger inserts the queued job without waiting or dispatching. Verify later eligible dispatch, debounce, active-lease exclusion, migration idempotency and unchanged function privileges. Apply only after this fixture passes, read back the definition/metadata and retry the rolled-back profile repair.
