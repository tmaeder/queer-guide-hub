# Runbook — failed edge function

For ad-hoc edge function failures (a backfill crashes, a cron fn errors). For
failed pipeline DAG runs see [failed-pipelines.md](failed-pipelines.md).

## 1. Confirm and locate

- Live logs: `supabase functions logs <name> --project-ref xqeacpakadqfxjxjcewc`
  (or the Supabase dashboard → Edge Functions → logs).
- If the fn uses `withErrorReporting`: check **Sentry** and the
  `community_submissions` rows with `content_type='api_error'`
  (deduped, `occurrence_count` shows frequency).
- If it's a pipeline step: query `pipeline_errors` (`function_name`, `message`,
  `context`, `pipeline_run_id`) or the `pipeline_error_summary` matview.
- Aggregate view: invoke `function-monitor` `/errors` and `/status`.

## 2. Common causes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 401 `UNAUTHORIZED_NO_AUTH_HEADER` | cron hits a `verify_jwt=true` fn with no header | gateway 401; set the cron to pass auth, or flip `verify_jwt=false` + self-gate (see edge-fn gate notes in CLAUDE.md). |
| 401 from a self-gated fn | missing/!= `X-Webhook-Secret` (Vault secret) or `WEBHOOK_SECRET` env unset | set the env/secret; these fns now **fail closed** when the secret is unset. |
| 404 (PostgREST 42883) | fn calls a dropped RPC/table | restore the RPC or fix the call; check recent migrations. |
| Timeout / killed mid-batch | batch too large; CF/LLM circuit broke | lower batch size; check the circuit-breaker state; retry. |
| Silent no-op | `verify_jwt` defaulted back to `true` on redeploy | verify deployed flag via Management API; reconcile `config.toml`. |

## 3. Replay

- One-shot/backfill fns: re-invoke directly with the required header, e.g.
  `net.http_post(url, headers => '{"X-Webhook-Secret": <vault secret>}', ...)`
  or the documented `internal_invoke_secret` for internal-gated fns.
- Pipeline steps: re-enqueue via `enqueue_workflow()` (not raw `pgmq.send`).
- Dead-letter queue rows are **not** auto-replayed for sweep-based fns —
  re-trigger the sweep.

## 4. Rollback

Edge fns deploy independently (`supabase functions deploy <name>`); redeploy the
previous known-good version from git. See [emergency-rollback.md](emergency-rollback.md).
