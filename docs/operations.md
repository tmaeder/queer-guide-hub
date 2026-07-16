# Operations runbook

What you need to keep queer.guide running for two weeks while the
maintainer is unavailable. Read top to bottom once; bookmark sections
2–4 for incident time.

## 1. The map

| What | Where | URL / path |
|---|---|---|
| Frontend | Cloudflare Pages | `queer-guide.pages.dev` (project `queer-guide`) |
| Database / Auth / Storage / Edge Functions | Supabase | project `xqeacpakadqfxjxjcewc` (eu-central-2) |
| Search | Postgres `search_documents` (hybrid keyword + vector + geo) | served via `search-proxy` worker |
| Cron / pipelines | Supabase pg_cron + Cloudflare Workers + GitHub Actions | see §3 |
| Status / health | Supabase dashboard + CF dashboard | (no centralized status page yet) |
| Sentry | Frontend (`src/sentry.ts`) + edge functions (via `_shared/report-api-error.ts`) | maedertobiassimon org, `javascript-react` project; separate "Edge Functions" DSN |
| Logs | Supabase function logs + CF Worker tail | `supabase functions logs <name>` / `wrangler tail <worker>` |

CF account: `7aa3765cc5f50f2b681b782eb4a8d296`.

## 2. Health checks (run weekly, or first thing on incident)

### News pipeline
- `/admin/pipelines?pipeline=news-ingestion` should show recent runs every hour, mostly green.
- DB sanity:
  ```sql
  SELECT count(*) FROM news_articles WHERE created_at > now() - interval '24 hours';
  -- expect > 50 on a normal day
  SELECT * FROM news_dedup_audit ORDER BY created_at DESC LIMIT 20;
  ```
- Sources stuck in error: `SELECT name, status, last_error FROM news_sources WHERE status = 'error';`

### Marketplace pipeline
- `/admin/pipelines?pipeline=marketplace-ingestion` runs daily 04:00 UTC.
- DB sanity:
  ```sql
  SELECT source_type, count(*) FROM marketplace_listings WHERE created_at > now() - interval '7 days' GROUP BY 1;
  SELECT * FROM marketplace_link_health WHERE checked_at > now() - interval '24 hours' AND http_status >= 400 LIMIT 20;
  ```

### Search (Postgres via search-proxy)
- Search runs entirely in Postgres via the `search_hybrid` / `search_facets` / `search_autocomplete` RPCs over the `search_documents` table; the `search-proxy` worker is the read path.
- If empty results: check (1) `search-proxy` worker logs (`wrangler tail search-proxy`), (2) the entity + `content_embeddings` triggers are keeping `search_documents` fresh (`SELECT max(updated_at) FROM search_documents;`), (3) the AI Gateway embedding endpoint is reachable.
- Meilisearch was decommissioned code-side (2026-06); `universal_search` / `algolia-sync` were dropped (migration `20260618150000`). No fallback path remains.

### Workflow dispatcher
- `workflow-dispatcher-health` cron runs daily 08:00. Failures land in `workflow_runs` with `status = 'failed'`.
  ```sql
  SELECT workflow_definition_id, status, error_message, created_at
  FROM workflow_runs
  WHERE status = 'failed' AND created_at > now() - interval '24 hours';
  ```

## 3. Cron schedule (47 jobs)

### High frequency (≤30 min)
| Job | Schedule | What |
|---|---|---|
| `pipeline-{venue,event}-{validate,dedup,commit}` | `*/5 * * * *` (staggered) | Live ingestion staging → published |
| `social-ingestion` | `*/10 * * * *` | Pull social posts |
| `data-ops-alerts` | `*/30 * * * *` | Notify on data anomalies |
| `push-subscriptions` | `2-59/5 * * * *` | Send push notifications |

### Hourly
- `wf-news-pipeline` `0 * * * *` — canonical news ingestion
- `source-quality-alerts` `5,35 * * * *`
- `geo-link-content` `30 * * * *`
- `advisor-sync-cron` / `refresh-source-reliability` `17 * * * *`

### Daily UTC (early morning window)
- 02:00 — `anonymize-location-data`, `import-foursquare-venues`, `import-ilga-data`, `date-normalizer`
- 03:00 — `run-automated-reviews`, `contact-normalizer`
- 03:15 — `event-occurrences-expansion`, GitHub Actions full scrape
- 03:27 — `suggest-story-from-ids-and-titler`
- 03:30 — `geo-enricher`
- 04:00 — `marketplace-ingestion`, `content-quality-checker`
- 04:30 — `detect-stale-venues`, `search-intelligence-reconcile`, `auto-tagger`
- 05:00 — `geo-validate`
- 05:00–05:40 — automation modules (staggered every 5 min)
- 06:00 — `legacy-cron` (purpose unclear — see §7), GH Actions `pipeline-health.yml`
- 06:15 — GH Actions `e2e-i18n.yml`
- 06:30 — GH Actions `a11y.yml`
- 08:00 — `workflow-dispatcher-health`
- 09:03 — `push-subscriptions-health`

### Weekly (Sundays)
- 04:00 — `snapshot-archiver` (CF Worker → R2)
- 04:00 — `sync-content-links`
- 04:30 — `validate-links`
- 05:00 — `tags-ingestion`, `link-validator-full`

### Other
- `validate-links-recheck` / `link-validator-incremental` every 6h
- GH Actions hourly events scrape

### Wrangler-side (CF Workers)
- `snapshot-archiver` — `0 4 * * SUN`
- `ingest-worker` — `* * * * *` (every minute — verify intent, see §7)

## 4. Common operations

### Retry a stuck workflow run
```sql
UPDATE workflow_runs
SET status = 'pending', retry_count = retry_count + 1, last_attempted_at = now()
WHERE id = '<run-id>' AND status IN ('failed', 'running');
```
Then call `workflow-dispatcher` manually:
```bash
supabase functions invoke workflow-dispatcher --body '{"force_dispatch": true}'
```

### Trigger a source manually (canonical path)
- News: open `/admin/pipelines?pipeline=news-ingestion`, hit "Run now".
- Other sources: same Builder UI for the corresponding pipeline.
- The legacy "Fetch Now" buttons in `/admin/news-sources` are flag-gated to `LEGACY_NEWS_TRIGGER_ENABLED` (env `VITE_LEGACY_NEWS_TRIGGER`); leave off in production.

### Add a new data source
1. Add a row to `news_sources` (or `data_sources` for non-news) with `source_type` matching an existing parser.
2. If new parser needed, see Phase 2 of the consolidation sprint — the per-source `import-*` and `source-*` functions are being consolidated into one parameterized `source-fetch`. Until that lands, copy the closest existing `source-*` function as a starting template.
3. Verify by triggering once via the pipeline UI and watching `ingestion_staging` for new rows.

### Roll back a bad edge function deploy
```bash
# Find the previous version
supabase functions list-versions <name>
# Redeploy from git history
git checkout <previous-sha> -- supabase/functions/<name>/
supabase functions deploy <name>
git checkout HEAD -- supabase/functions/<name>/
```

### Search returning empty results
1. Check `search-proxy` worker: `wrangler tail search-proxy` while triggering a search.
2. Check the index is fresh (entity + `content_embeddings` triggers keep it in sync):
   ```sql
   SELECT count(*), max(updated_at) FROM search_documents;
   ```
3. Check embeddings exist (semantic search):
   ```sql
   SELECT count(*) FROM content_embeddings WHERE created_at > now() - interval '7 days';
   ```
4. Verify RPCs directly: `SELECT * FROM search_hybrid('gay bar berlin', ...);` returns rows.

### Stripe payment failure
- `stripe-webhook` edge function handles all webhooks. Check logs:
  ```bash
  supabase functions logs stripe-webhook --tail
  ```
- Stripe dashboard → Developers → Webhooks for retry of failed events.

## 5. 410-stub deletion log (consolidation sprint)

Edge functions removed in the May-2026 consolidation sprint:

| Function | Removed | Why |
|---|---|---|
| `algolia-search` | 2026-05-01 | 410 stub since Apr 8; replaced by `/functions/v1/search` |
| `fetch-ilga-data` | 2026-05-01 | 410 stub since Apr 8; replaced by `source-ilga` |
| `algolia-sync` | 2026-05-01 | Algolia replaced by Meilisearch (Meili itself later decommissioned; search is now Postgres) |

Future deletion candidates (deferred):
- `background-import-manager` — 410 stub but 7 active call sites in `useBackgroundImports.tsx`
- `ingestion-pipeline` — 410 stub but 5+ active call sites in scrapers + `ingestion-review-api`

## 6. Sentry / monitoring

- **Frontend** is wired (`src/sentry.ts`, imported in `main.tsx`).
- **Edge functions** are wired via `supabase/functions/_shared/report-api-error.ts`, which calls `_shared/sentry.ts` to capture every error reported through `reportApiError(...)`. The 4 functions currently using `reportApiError` (workflow-dispatcher, pipeline-executor, pipeline-commit, stripe-webhook) gain Sentry capture automatically. New functions should call `reportApiError` in their top-level catch.
- The DSN lives in the Supabase secret `SENTRY_DSN` (`supabase secrets set --project-ref <ref> SENTRY_DSN=...`). All edge functions read it via `Deno.env.get('SENTRY_DSN')`. If the secret is unset, Sentry is a silent no-op.
- Errors are tagged `edge_function: <name>` for easy Sentry filtering; the DSN named "Edge Functions" makes it filterable by `dsn.public_key` too.
- For ad-hoc capture inside a function: `import { captureError } from "../_shared/sentry.ts"; captureError(err, { context })`.
- For wrapping a serve handler: `import { withSentry } from "../_shared/sentry.ts"; serve((req) => withSentry("my-fn", async () => { ... }))`.
- No PagerDuty / OpsGenie integration; Sentry alert rules go to email.

## 7. Known gaps / "stuff to ask about"

- **`legacy-cron` daily 06:00** — what does it actually do? Migration source unclear; investigate before disturbing.
- **`ingest-worker` cron `* * * * *`** — every minute is aggressive; verify intent or relax.
- **iCloud risk** — repo is NOT in iCloud per Phase 0 check, but if it ever moves, `.git` corruption risk returns.
- **No e2e tests run on every PR** — daily-only via GitHub Actions; PR-level coverage gap.
- **CMS BEFORE-triggers can null fields silently** — `events`, `venues`, `personalities` had `sanitize_website_field` triggers that null'd input. Check `pg_trigger` if a CMS field "doesn't save".

## 8. Where to find more

- **Architecture overview:** [CLAUDE.md](../CLAUDE.md) at repo root
- **News pipeline detail:** `CLAUDE.md` § News pipeline + `/admin/pipelines?pipeline=news-ingestion`
- **Search detail:** `docs/architecture/` (if present), `docs/search-intelligence/`
- **ADRs:** `docs/adrs/`
- **Email ingestion:** [docs/architecture/email-ingestion.md](architecture/email-ingestion.md)
