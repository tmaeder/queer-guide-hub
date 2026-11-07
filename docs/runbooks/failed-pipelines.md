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

Set `context.fast_step_wake` to `true` on a new pilot run to try faster
handoffs. The executor issues at most eight wake-ups per run and reserves up
to two slots at a time. The queue dispatcher still delivers the original
messages, and duplicate deliveries can safely acknowledge the existing
claim. Retries still follow the scheduled backoff.

To compare fast and scheduled runs, use the same pipeline snapshot and dry-run
inputs. Set `context.fast_step_wake` to `false` for the scheduled control. This
query measures handoff time for first attempts, grouped by snapshot version.
Track queue depth and fast-wake errors during the comparison.

```sql
WITH handoffs AS (
  SELECT r.pipeline_version,
    COALESCE(r.context->'fast_step_wake' = 'true'::jsonb, false) AS fast_wake,
    EXTRACT(EPOCH FROM ((node.state->>'started_at')::timestamptz - predecessor.finished_at)) AS seconds
  FROM public.pipeline_runs r
  CROSS JOIN LATERAL jsonb_each(r.node_states) node(id, state)
  CROSS JOIN LATERAL (
    SELECT max((r.node_states->(edge->>'source')->>'completed_at')::timestamptz) AS finished_at
    FROM jsonb_array_elements(r.pipeline_snapshot->'edges') edge
    WHERE edge->>'target' = node.id
  ) predecessor
  WHERE r.reliable_steps AND r.pipeline_name = 'tags-ingestion'
    AND r.status = 'completed' AND r.context->'dry_run' = 'true'::jsonb
    AND r.started_at >= now() - interval '14 days'
    AND node.state->>'attempt' = '1' AND predecessor.finished_at IS NOT NULL
)
SELECT pipeline_version, fast_wake, count(*) AS handoffs,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS p50_seconds,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY seconds) AS p95_seconds
FROM handoffs WHERE seconds >= 0
GROUP BY pipeline_version, fast_wake ORDER BY pipeline_version, fast_wake;
```

## Historical Equaldex timeline

The scraper returns `historical_timeline_not_news` for live attempts to stage
Equaldex timeline entries as news. This is a policy skip. A targeted dry run
can still preview the extracted timeline.
