# ARCH-3 step 5 — `news_articles` writer-guard trigger

**Status:** Design ready, awaiting operator execution.
**Source:** Tech-debt register row ARCH-3 (priority 24), step 5 of the original plan.

## Why this is a separate step

The frontend swap + edge-function deletion shipped in [PR #255](https://github.com/tmaeder/queer-guide-hub/pull/255). The writer-guard trigger is split out because it is a behaviour-changing migration on a live production table; per the autonomous-execution safety rule, production-write changes need explicit human approval before merging.

## What the trigger does

- Fires `BEFORE INSERT` on `public.news_articles`.
- If the inserter is a service-role and a session-level `app.pipeline_commit = 'true'` is **not** set, the trigger logs (or rejects) the insert.
- Legitimate inserts via `news_commit_staging_batch()` set the session var first, so they pass through cleanly.
- Catches future regressions: if anyone reintroduces a direct-upsert path (like the legacy `fetch-news`), it surfaces immediately.

## Rollout

Two-phase rollout. Each phase is its own migration applied days apart.

### Phase A — dry-run (logs only)

```sql
-- supabase/migrations/<timestamp>_news_articles_writer_guard_dry_run.sql

-- 1. Update the canonical commit RPC to set the session marker.
--    Use `ALTER FUNCTION ... SET` so the GUC is set as part of the
--    function's session — keeps the change atomic with the RPC, no
--    body rewrite needed.
ALTER FUNCTION public.news_commit_staging_batch(UUID, UUID, INT)
  SET app.pipeline_commit = 'true';

-- 2. Trigger function logs a NOTICE for inserts that bypass the canonical path.
CREATE OR REPLACE FUNCTION public.news_articles_no_legacy_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.pipeline_commit', true) IS DISTINCT FROM 'true' THEN
    RAISE NOTICE
      'news_articles writer-guard (dry-run): direct INSERT bypassing news_commit_staging_batch (pid=%, txn=%, role=%)',
      pg_backend_pid(), txid_current(), current_user;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_news_articles_no_legacy ON public.news_articles;
CREATE TRIGGER trg_news_articles_no_legacy
  BEFORE INSERT ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.news_articles_no_legacy_writes();
```

### Phase B — promote to EXCEPTION (after 24-72 h with zero notices)

```sql
-- supabase/migrations/<later-timestamp>_news_articles_writer_guard_enforce.sql

CREATE OR REPLACE FUNCTION public.news_articles_no_legacy_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.pipeline_commit', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'Direct INSERT into news_articles is forbidden. Use news_commit_staging_batch().'
      USING ERRCODE = '23514';  -- check_violation
  END IF;
  RETURN NEW;
END $$;
```

The trigger from Phase A stays attached; only the function body changes.

## Verification before promoting Phase B

1. **Watch postgres logs for 24-72 h after applying Phase A.** Filter for `news_articles writer-guard (dry-run)`. Zero matches = safe to promote.
2. **Check the staging cron actually commits in that window.** If `wf-news-pipeline` (cron `0 * * * *`) ran and committed rows, you should see fresh `news_articles` rows with `created_at` inside the window. If the trigger were misconfigured to ALSO fire NOTICEs on the canonical path, that would show up as a flood of NOTICEs in the same window.
3. **Manual smoke:** trigger an admin manual ingestion (`/admin/news-sources` → "trigger fetch") and confirm no NOTICEs land. The frontend now routes through `pipeline-executor` → `pipeline-commit` → `news_commit_staging_batch` (PR #255), so this should be a clean run.

## Rollback

If Phase B causes a regression:
```sql
ALTER FUNCTION public.news_articles_no_legacy_writes()
  -- (re-execute the Phase A body to revert to NOTICE)
```
or simply `DROP TRIGGER trg_news_articles_no_legacy ON public.news_articles;` to disable entirely.

## Why use `ALTER FUNCTION ... SET` instead of editing the RPC body

The plan suggested putting `SET LOCAL app.pipeline_commit = 'true';` at the top of the RPC body. That works but means re-creating the (very long) function definition. `ALTER FUNCTION ... SET` is equivalent for this purpose: every call to the function runs with that session var set, automatically reverting after return. Smaller diff, less chance of clobbering pending edits to the RPC body.

## Out of scope

This design covers only the `news_articles` table. The same pattern could later be applied to `marketplace_listings` (which has its own canonical commit path `commit_marketplace_staging_batch`) — track separately if that pipeline gets a similar legacy-path scare.
