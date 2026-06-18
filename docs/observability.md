# Error Observability — routing map

Where backend errors go, and the known gaps. Audited 2026-06-18.

## Routing

| Surface | Sends to | DSN / config | Notes |
|---------|----------|--------------|-------|
| **Frontend** (React SPA) | Sentry | `VITE_SENTRY_DSN` | `src/sentry.ts`; strips user PII in `beforeSend`, replays off. |
| **Edge fns** wrapped with `withErrorReporting` (59 fns) | Sentry **+** `ingest-api-error` → `community_submissions` (`content_type='api_error'`, deduped by SHA-256 fingerprint, `occurrence_count`) | `SENTRY_DSN`, `API_ERROR_SECRET` | `_shared/report-api-error.ts`. Reports thrown errors and 5xx responses. |
| **Edge fns** pipeline steps with `logPipelineError` (14 fns) | `pipeline_errors` table **only** (not Sentry) | — | `_shared/pipeline-error-log.ts`; auto-pruned >30d; summarized in `pipeline_error_summary` matview. |
| **Edge fns** with neither (~140 fns) | `console.error` → Supabase function logs only | — | Not queryable in Sentry or DB. Gap. |
| **Workers** `search-proxy`, `ingest` | Sentry (Toucan) + CF tail | `SENTRY_DSN` (wrangler secret) | `new Toucan({...}).captureException(e)` in the catch. |
| **Workers** `assistant`, `image-cdn`, `image-ingest`, `snapshot-archiver`, `submit`, `trip-inbox` | `console.error` → CF tail only | — | `[observability] enabled = true` gives live tail, but no Sentry. Gap. |
| **Scraper** (Node) | Sentry | `SENTRY_DSN` | `scraper/src/utils/sentry.ts`. |

The same Sentry **`SENTRY_DSN`** is reused across all non-frontend surfaces (edge fns, workers, scraper); the browser uses the separate `VITE_SENTRY_DSN`.

## Admin surface

`function-monitor` edge function aggregates `/status`, `/health`, `/errors`, `/stats`, `/registry` from `workflow_runs`, `workflow_definitions`, `pipeline_errors`, and DLQ metrics — the closest thing to a single pane for pipeline/function health.

## Known gaps (tracked tech-debt #23)

1. **6 workers have no Sentry** (list above). They are not blind — CF tail logging is on — but errors don't reach Sentry.
2. **Pipeline errors never reach Sentry** — `pipeline_errors` table only, by design. Acceptable (admin dashboard reads the table), documented here so it isn't mistaken for a blind spot.
3. **~140 edge fns have no structured error reporting** — only `console.error`. Adopt `withErrorReporting` opportunistically when touching a function.

## Recipe — add Sentry to a worker

The pattern is already in `workers/search-proxy/src/index.ts` and `workers/ingest/src/index.ts`. To add it to one of the 6 gap workers:

1. `cd workers/<name> && npm install --save toucan-js@^4.1.1` (updates `package.json` + `package-lock.json`).
2. In `src/index.ts`:
   ```ts
   import { Toucan } from "toucan-js";
   // inside the catch:
   if (env.SENTRY_DSN) {
     new Toucan({ dsn: env.SENTRY_DSN, context: ctx, request,
       environment: env.SENTRY_ENV || "production" }).captureException(e);
   }
   ```
   Add `SENTRY_DSN?: string` (and optional `SENTRY_ENV`) to the worker's `Env` type.
3. `wrangler secret put SENTRY_DSN` for that worker (reuse the shared backend DSN). Init is a graceful no-op if the secret is unset, so deploy is safe before the secret lands.
4. Verify: `npx tsc --noEmit && wrangler deploy`, then throw a test error and confirm it appears in Sentry.

Do this per-worker with its own deploy + verification — do not batch all six in one untested change.
