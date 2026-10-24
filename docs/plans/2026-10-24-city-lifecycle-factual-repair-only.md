# Keep source-backed city repairs factual

The city lifecycle operator already verifies exact source identity, current names, settlement classes, country and coordinates, a native country polygon, ownership and before/after row invariants. Its final direct review-queue update duplicates scheduled reconciliation and contends with the ordinary city-quality run.

Remove that direct review update. Preserve the factual lifecycle/slug repair, source provenance, native geography evidence and repair audit. Publication stays disabled. Pending findings remain untouched until the native scheduled reconciler assesses current facts.

The disposable PostgreSQL suite now rejects every review insert/update/delete using a trigger, while the real operator still completes its positive factual repair. All 20 ownership/source cases, dry-run behavior, whole review-record preservation and idempotency pass.
