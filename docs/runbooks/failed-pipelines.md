# Handling Failed Pipelines

## Check pipeline health

Dashboard: `/admin/pipelines` (Builder tab shows DAG, Monitor tab shows runs)

Or query directly:
```sql
SELECT id, pipeline_id, status, error, started_at, completed_at
FROM workflow_runs
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 20;
```

## Dead letter queue

Failed items land in the `dead_letter` pgmq queue. The `pipeline-dlq-consumer` function processes them with exponential backoff.

Check DLQ depth:
```sql
SELECT count(*) FROM pgmq.q_dead_letter;
```

Manually retry all DLQ items:
```bash
curl -X POST "https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-dlq-consumer" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"retry_all": true}'
```

## Common failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `E_CIRCUIT_OPEN` | External API (OpenAI, Pexels) rate-limited | Wait for circuit to half-open (5min default) |
| `E_TIMEOUT` | Function hit 60s wall-clock | Check if batch_size is too large |
| `E_DUPLICATE_KEY` | Idempotency conflict | Usually benign — item already committed |
| `E_QUALITY_BELOW_THRESHOLD` | Content too thin | Review in staging tab, lower threshold or improve source |

## Manual re-run a pipeline

From admin UI: `/admin/pipelines?pipeline=<name>` > click "Run Now"

Or via workflow-dispatcher:
```sql
SELECT pgmq.send('scheduled_jobs', jsonb_build_object(
  'workflow_id', '<workflow-definition-id>',
  'trigger', 'manual'
));
```

## Source health

Sources auto-pause after 8 consecutive failures. Re-enable:
```sql
UPDATE news_sources SET paused = false, consecutive_failures = 0 WHERE id = '<source_id>';
```

## Tags ingestion reliability pilot

Start a single pilot run through the existing authenticated `pipeline-executor`
endpoint. Use a dry run first.

```json
{
  "action": "start",
  "pipeline_name": "tags-ingestion",
  "context": { "reliability_pilot": true, "dry_run": true }
}
```

Find the returned run ID in the pipeline monitor. The existing
`reap_stuck_pipeline_runs` schedule checks every five minutes. It redelivers
steps that go unclaimed for ten minutes and recovers expired claims. A claim
expires one minute after the pipeline's configured step timeout. The tag
commit step has three total attempts, with 30- and 60-second backoff. Publication, staging checkpoints, audit events and
downstream scheduling are committed together.

If the monitor reports **requires operator review**, inspect the failed step's
staging records or review proposals before starting another run. An interrupted
source or enrichment call may have written data before its response was lost.
The pilot marks that run failed and preserves the error on the step. To select
the standard execution path for a new run, set `context.reliability_pilot`
to `false`.
