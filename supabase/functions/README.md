# supabase/functions/

Deno edge functions — the backend data plane. This is the canonical location (not the repo-root `functions/`).

What lives here:
- `source-*` data fetchers and `pipeline-*` DAG stages (normalize → validate → dedupe → quality-score → review-gate → commit); webhooks (Stripe, Meta, Sentry, Turnstile); admin/ops endpoints; `_shared/` (cross-function helpers — supabase-client, consensus, ai-enrichment, …).
- Functions are wired into pipelines via `pipeline_definitions.nodes` and scheduled via `cron.job` — **the live DB is authoritative**, repo migrations only seed it.

Conventions:
- New function = new dir with `index.ts`; add a `[functions.<name>]` block in `supabase/config.toml` if it needs `verify_jwt = false`.
- Before deleting a function, confirm zero live references in `cron.job` + `pipeline_definitions` + `workflow_definitions`, then `supabase functions delete <name>` (repo deletion does not undeploy).
- Put reusable logic in `_shared/`, not copied across functions.
