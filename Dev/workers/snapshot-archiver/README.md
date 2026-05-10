# Snapshot Archiver Worker

Moves `scraper_snapshots` older than 30 days from Postgres to R2.

## What it does

1. Reads the `scraper_snapshots_archive_candidates` view from Supabase.
2. For each row: fetches the `content_gz` body via the `scraper_snapshot_body`
   RPC, puts it to R2 at `scraper-snapshots/<source>/<year>/<uuid>.gz`.
3. Calls `scraper_mark_snapshot_archived(id, r2_key)` — nulls the body
   columns in Postgres, sets `archived_at` and `r2_key`.

Runs weekly (Sunday 04:00 UTC) via the scheduled trigger, or manually via
`POST /` for backfill.

## Prerequisites

1. Apply migration `007_snapshot_archival.sql`.
2. Create the supporting RPC (not yet in the migration — add alongside 007 or
   separately):

   ```sql
   CREATE OR REPLACE FUNCTION scraper_snapshot_body(p_id UUID)
   RETURNS TEXT AS $$
     SELECT encode(content_gz, 'base64')::text
     FROM scraper_snapshots WHERE id = p_id;
   $$ LANGUAGE SQL STABLE;
   ```
3. Create the R2 bucket: `wrangler r2 bucket create queer-guide-scraper-snapshots`.

## Deploy

```bash
cd workers/snapshot-archiver
npm install
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# optional:
wrangler secret put ADMIN_SECRET
wrangler deploy
```

## Manual run

```bash
curl -X POST https://queer-guide-snapshot-archiver.<your>.workers.dev \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"limit": 1000}'
```

Returns `{ considered, archived, failed, skipped_empty, bytes_moved }`.

## Safety

- Bounded per invocation (default 500 rows).
- Each row committed independently — partial failures don't block the batch.
- Idempotent: the mark-archived RPC is a no-op on already-archived rows.
- No-op if the R2 bucket is unreachable (the `put` call will throw and the
  row's DB state is unchanged).
