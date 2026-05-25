-- ARCH-3 step 5 (Phase A) — news_articles writer-guard, dry-run mode.
-- Design: docs/plans/ARCH-3-news-articles-writer-guard.md
--
-- Catches any future regression that reintroduces a direct-upsert path
-- into public.news_articles (like the legacy fetch-news). In dry-run
-- mode the trigger only RAISE NOTICEs; promote to RAISE EXCEPTION via
-- a separate Phase B migration after 24-72h of zero notices in the
-- postgres logs.

-- 1. Mark the canonical commit RPC with the session GUC. Every call
--    runs with `app.pipeline_commit = 'true'`, automatically reverting
--    on function return. Smaller diff than rewriting the long body.
ALTER FUNCTION public.news_commit_staging_batch(UUID, UUID, INT)
  SET app.pipeline_commit = 'true';

-- 2. Trigger function. In dry-run, logs but does not block.
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

-- 3. Attach BEFORE INSERT trigger. Trigger stays attached across Phase
--    A → B promotion; only the function body changes in Phase B.
DROP TRIGGER IF EXISTS trg_news_articles_no_legacy ON public.news_articles;
CREATE TRIGGER trg_news_articles_no_legacy
  BEFORE INSERT ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.news_articles_no_legacy_writes();

COMMENT ON FUNCTION public.news_articles_no_legacy_writes() IS
  'ARCH-3 writer-guard: NOTICE-only in dry-run. Promote to EXCEPTION in Phase B. Rollback: DROP TRIGGER trg_news_articles_no_legacy ON public.news_articles.';
