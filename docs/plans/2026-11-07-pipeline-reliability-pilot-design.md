# Pipeline reliability pilot

Approved on 2026-11-07. Use Postgres as the authority for step ownership and
completion, and keep pgmq as the delivery mechanism. Queue visibility alone
cannot prevent two different messages from invoking the same step or recover a
handoff interrupted between two writes. A workflow engine would add a migration
and still require replay-safe side effects.

Pilot the existing tags-ingestion DAG with explicit opt-in for new runs. Keep
the existing monitor and node status model. Create the run, snapshot its graph,
and enqueue its roots in one transaction. Lock the run row briefly when claiming
a ready node, issue a lease and attempt token, and require the token when saving
the result. Save results, counters, and successor queue messages in the same
transaction. The existing watchdog schedule recovers abandoned deliveries and
expired leases.

Automatically retry the pilot tag commit with a bounded attempt count and
backoff. Put its publication, staging checkpoints, audit events, and DAG
handoff in the same transaction. Route interrupted stages with unverified side
effects to operator review. A late attempt cannot finalize a recovered step.

Validate concurrent claims, parallel predecessor completion, recovery after a
lost response or missing queue delivery, stale attempt rejection, duplicate-free
publication, and visible failure when retries run out. The ownership guarantee
is scoped to one step in one run. Separate requests to create runs have separate
identities.
