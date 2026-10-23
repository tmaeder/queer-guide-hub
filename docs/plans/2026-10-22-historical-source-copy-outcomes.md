# Historical event source-copy outcomes

The all-source review count remains **122,178**, measured at 2026-10-22 20:30:53 UTC. The user's under-100 total is not achieved.

Two bounded, default-dry-run scripts record explicit native `accepted` outcomes for historical AgendaQ completeness findings. These are known source limitations, not repaired descriptions or verified content. Event data, quality scores, detector evidence and unrelated findings remain unchanged. No human reviewer is assigned.

- `accept-complete-historical-event-copy.sql`: accepted **2,719** original `DESCRIPTION_THIN` findings where the event already contains all meaningful source prose (20–79 characters), with matching occurrence identity, dates, canonical URL, source hash and finding evidence. Truncation, title-only text, boilerplate, other stored narrative and human-owned findings are excluded.
- `accept-historical-calendar-copy-absence.sql`: accepted **6,100** original `DESCRIPTION_MISSING` findings where both the stored event and complete known calendar payload provide no narrative. Unknown schema keys, other providers, available source text, current events, duplicate/archive records and human-owned findings are excluded.

Both scripts use `decide_event_quality_issue`, preserve source identity/hash and original evidence hash in structured resolution notes, require an internal actor and process at most 500 records per batch. Each converged to zero eligible cases. Separate production rollback trials of 50 cases each verified unchanged event rows, original evidence, scores and other findings before the actual runs.

Migration `99991792712257_historical_event_source_copy_outcomes.sql` adds bounded service-only reconcilers to the existing event-quality repair runner. Source or occurrence identity/copy changes reopen only these automation-owned accepted findings; unchanged or asset-only updates do not. Human decisions remain protected. The migration is **prepared for the normal ordered release and has not been applied manually** during the concurrent email release hold. The source-change triggers are therefore not yet live.

The disposable PostgreSQL 17 suite covers 62 fixtures, including default dry runs, zero/bounded batches, grants, schema drift, source alternatives, invalidation and human ownership. It passed against the prepared migration, including interactive-admin compatibility and direct internal-actor enforcement. All 2,465 migration files parse with the PostgreSQL 17 grammar. These isolated tests supplement the real native-RPC rollback checks; their native RPC stub is not a production integration test.
