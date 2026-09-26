# Automation reliability remediation

## Goal

Make the production automation system secure, observable, and operationally
honest without rewriting healthy parameterized pipelines or manually firing
unsafe data-changing jobs.

## Approved approach

Use a staged hardening pass:

1. Close the unauthenticated `refresh-watched-urls` service-role path and make
   its scheduler call use the standard internal secret.
2. Treat enabled `partial` runs as attention-worthy and display them distinctly
   from healthy runs.
3. Repair scheduler prerequisites: missing secrets, unsuitable HTTP timeouts,
   and the largest same-minute request bursts.
4. Ensure Edge-backed jobs produce one canonical semantic run rather than a
   scheduler success row plus a second result row.
5. Resolve enabled-but-unreachable registry entries, consolidate the duplicate
   tag-category resync, and document lifecycle reasons.
6. Improve registry consistency, manual validation coverage, and semantic work
   metrics where this can be done safely in the same pass.
7. Deploy in dependency order and verify with unit/SQL tests, production
   registry queries, Edge logs, and a non-destructive browser E2E check.

## Safety constraints

- Preserve all unrelated worktree changes.
- Never expose service-role credentials to clients or registry metadata.
- Do not manually execute jobs that import, delete, merge, or publish content
  solely for testing.
- Prefer pausing an unreachable or misconfigured job with an explicit reason to
  leaving it enabled and misleading.
- Use queues, smaller batches, or staggered schedules for long-running work;
  increased timeouts are a bounded compatibility measure, not the only form of
  backpressure.
- Keep intentionally parameterized jobs separate even when they share an Edge
  Function.

## Verification criteria

- `refresh-watched-urls` rejects unauthenticated requests in production.
- Every enabled scheduled registry entry maps to one active cron job.
- Partial results appear in the Attention view and are not labelled Healthy.
- No enabled job depends on a missing Vault secret.
- No enabled registry entry is unreachable by both schedule and manual runner.
- Duplicate tag-category resync scheduling is removed with lifecycle history
  retained.
- Canonicalized Edge jobs write one authoritative terminal result per run.
- Production page loads and its active/attention/paused counts agree with direct
  database queries.
