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
