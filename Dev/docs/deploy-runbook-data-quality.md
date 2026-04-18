# Deploy runbook — data-quality pipeline overhaul

Covers all infra steps needed to activate the code changes shipped in this
pass. Every step includes a quick rollback.

## Order matters

1. Apply migrations
2. Deploy edge functions
3. Wire the DAG
4. Deploy workers
5. GitHub Actions secrets
6. Smoke test
7. Enable the nightly archiver

## 1. Apply migrations

Two sets: scraper-side (run against the scraper's Postgres DB) and web-side
(run against Supabase).

### 1a. Scraper DB

```bash
cd scraper
DATABASE_URL=$PROD_SCRAPER_DB_URL npm run migrate
```

Files applied, in order:
- `002_data_quality.sql` — dedupe audit columns, functional `lower(city)`
  indexes, normalize-rejections table, nullable country.
- `003_field_coverage_metrics.sql` — coverage columns + `scraper_ingest_coverage` view.
- `004_snapshot_compression.sql` — `content_gz` bytea + CHECK.
- `005_reconciliation.sql` — `scraper_reconcile_orphans`, `scraper_prune_orphan_mappings`,
  `scraper_resolve_pending` RPCs.
- `006_language_tag.sql` — `language TEXT` column + partial indexes.
- `007_snapshot_archival.sql` — archival columns, view, `scraper_mark_snapshot_archived`,
  `scraper_snapshot_body` RPCs.

**Rollback:** each migration is additive — drop added columns / views / fns
to revert; data is preserved.

### 1b. Supabase

Apply via Supabase CLI or dashboard:
- `web/supabase/migrations/20260417120000_pipeline_quality_observability.sql`
  — `pipeline_quality_distribution` + `pipeline_quality_daily` views.

```bash
cd web
supabase db push
```

## 2. Deploy edge functions

Modified or new:
- `pipeline-quality-score` — `name ?? title ?? product_name` fallback.
- `pipeline-deduplicate` — docs / threshold alignment (no runtime behaviour change).
- `meilisearch-sync` — `hotels` + `festivals` in `ALL_TYPES`, new `reconcile` action.
- `pipeline-geocode` — NEW. Hoists Photon geocode out of `pipeline-normalize`.

```bash
cd web
supabase functions deploy pipeline-quality-score
supabase functions deploy meilisearch-sync
supabase functions deploy pipeline-geocode
```

**Rollback:** `supabase functions deploy <name>` against a previous commit.

## 3. Wire `pipeline-geocode` into the DAG

Go to `/admin/pipelines?tab=builder`. For each pipeline that processes items
needing coordinates:
- `news-ingestion` (if you geocode news city/country)
- `marketplace-ingestion` (unlikely — skip)
- Any venue/event pipeline

Insert `pipeline-geocode` as a node **after** `pipeline-normalize` and
**before** `pipeline-deduplicate`. Keep the default batch-size (50).

If you prefer not to change existing DAGs, a quick back-stop is fine — the
inline geocode in `pipeline-normalize` is still in place; the new function is
an additional, *faster* path.

## 4. Deploy workers

### 4a. Create the R2 bucket

```bash
wrangler r2 bucket create queer-guide-scraper-snapshots
```

### 4b. Deploy the archiver

```bash
cd workers/snapshot-archiver
npm install
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Optional admin-gate for manual runs:
wrangler secret put ADMIN_SECRET
wrangler deploy
```

The worker is bound to a weekly cron (`0 4 * * 0`). First run will archive
everything older than 30 days in batches of 500 per trigger until the
archive candidates view returns 0.

### 4c. Deploy the updated search proxy

```bash
cd workers/search-proxy
wrangler deploy
```

## 5. GitHub Actions secrets

Ensure the root workflow can publish to Supabase:

```bash
gh secret set SUPABASE_DB_URL -b "<your-supabase-postgres-uri>"
# Already present, but verify:
gh secret list | grep -E "DATABASE_URL|SCRAPER_USER_AGENT|SENTRY_DSN|SUPABASE_DB_URL"
```

The root `.github/workflows/scrape.yml` already sets `PUBLISH_TO_STAGING=1`
in both jobs.

## 6. Smoke test

### 6a. Scraper → staging

Manual dispatch with a tiny scope:

```bash
gh workflow run scrape.yml -f source=wikipedia -f type=place -f max_pages=5
```

Confirm in Supabase SQL editor:

```sql
-- Fresh rows landing in staging
SELECT source_type, source_name, COUNT(*)
FROM ingestion_staging
WHERE created_at > now() - interval '30 minutes'
GROUP BY source_type, source_name;

-- No duplicate payload hashes
SELECT payload_hash, COUNT(*)
FROM ingestion_staging
GROUP BY payload_hash HAVING COUNT(*) > 1;
```

### 6b. Admin UI

Open `/admin/pipelines?tab=scraper-health`. Confirm:
- Orphan mappings show zero (or manageable counts).
- Field coverage populated for the recent run.
- Quality-score distribution populated once pipeline-quality-score has run.

Open `/admin/pipelines?tab=dedup`. Confirm the table renders (may be empty).

### 6c. Meilisearch reconcile

```bash
# Against any index; starts with a small one to validate
curl -X POST "${SUPABASE_URL}/functions/v1/meilisearch-sync" \
  -H "authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{"action":"reconcile","type":"cities"}'
```

Expect `{ success, type, meili_count, source_count, deleted }`. A `deleted`
value > 0 is fine — those are stale docs from deleted rows.

## 7. Enable the nightly archiver

Already enabled by the wrangler.toml cron. To test manually:

```bash
curl -X POST https://queer-guide-snapshot-archiver.<your-subdomain>.workers.dev/ \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"limit": 10}'
```

Expected: `{ considered, archived, failed, skipped_empty, bytes_moved }`.

Watch in Supabase:

```sql
SELECT COUNT(*) archived, SUM(OCTET_LENGTH(COALESCE(content_gz, '\x'::bytea))) remaining_bytes
FROM scraper_snapshots
WHERE archived_at IS NOT NULL;
```

## Rollback sequence

If a deploy goes sideways, revert in reverse order:

1. Disable the archiver cron: `wrangler triggers delete 'weekly-archive'`.
2. Stop the DAG modifications (remove `pipeline-geocode` node via the Builder).
3. Re-deploy the previous edge function versions.
4. Revert migrations via compensating SQL (drop added columns / views / fns).
5. Flip `PUBLISH_TO_STAGING` back to `'0'` in `.github/workflows/scrape.yml` if staging table is misbehaving.

## What this does NOT do

- Does not migrate historical data. New coverage metrics and language tags
  are only populated on future runs.
- Does not archive snapshots written before migration 004 (those rows have
  `content TEXT` populated and `content_gz` NULL, so they're skipped by the
  candidates view). A one-off backfill script can re-encode them if needed.
- Does not enable the `scraper_*` entity-table deprecation. That's a
  multi-phase plan documented separately in
  `scraper/docs/deprecation-scraper-entity-tables.md`.
