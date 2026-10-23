# Index the staging quality worker's candidates

The live `ev_drain_quality` automation repeatedly returns HTTP 500 because `pipeline-quality-score` times out loading candidates. The unchanged SQL selector's production plan is a parallel full-table scan followed by sorting; a separate read found zero eligible event rows. It still scans history to establish that empty result.

Two partial indexes contain exactly the worker's current two enrichment arms and dedup/validation status guards. `(entity_type, created_at, id)` supports domain-specific drains and `(created_at, id)` supports unscoped pipeline calls. There is no change to row membership, scoring, minimum score, enrichment transitions, review state or authorization. The normal migration has a two-second lock timeout and waits for the coordinated schema release.

The disposable PostgreSQL regression loads 100,000 historical rows, 10,000 candidates from another domain and positive/negative controls including JSON null, zero score, unfinished enrichment, failed enrichment, duplicates and rejected validation. It checks exact candidate membership, both real query plans and candidate removal after a native status transition. Both shapes use their intended indexes; measured local execution was 0.029 ms unscoped and 0.017 ms scoped. These are fixture timings, not production performance claims.

Run `PG_BINDIR=/path/to/postgresql/bin python3 supabase/tests/isolated/run_staging_quality_indexes.py`. After normal release, verify the production plan and next native automation receipt. No queue reduction is credited to an unapplied index.
