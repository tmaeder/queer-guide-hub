-- News text quality cleanup (2026-06-21)
-- 1. De-index pure stub sources (aggregator snippets, not real articles)
-- 2. Register the recurring news re-sanitization cron (pg_cron job + admin_automations row)
--
-- Idempotent end-to-end: safe to re-apply (CI db push re-runs this on merge).

-- De-index Google News and Reddit articles that are pure summaries (<200 chars).
-- These are aggregator snippets with no real article body, just headlines + 1-2 sentences.
-- Reversible: set seo_indexable = true to undo.
UPDATE news_articles
SET seo_indexable = false,
    updated_at = now()
WHERE publisher_name IN ('Google News LGBT Rights', 'Reddit LGBT')
  AND (content IS NULL OR length(content) < 200)
  AND duplicate_of_id IS NULL
  AND seo_indexable = true;

-- Recurring retroactive sanitizer: every 5 minutes, re-run the updated sanitizer
-- (iterative HTML strip + entity decode + junk-phrase removal) over any live news
-- article whose content still looks contaminated. Version-guarded + 300/batch, so it
-- is a cheap no-op once the backlog is clean. Public (seo_indexable) scope only — the
-- one-off hidden-article drain is triggered manually with {"include_unindexed": true}.
SELECT cron.schedule(
  'news_resanitize',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-resanitize-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := jsonb_build_object('batch_size', 300),
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);

-- Registry + admin kill-switch row mirroring the pg_cron job (matches the
-- marketplace_* edge-automation convention: action.type='edge', action.fn=<slug>).
INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'news_resanitize',
  'News re-sanitize sweep',
  'Every 5 minutes, re-run the updated sanitizer (iterative HTML strip + entity decode + junk-phrase removal) over contaminated live news articles. Version-guarded, 300/batch, public scope.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "pipeline-resanitize-news", "type": "edge"}'::jsonb,
  '*/5 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      managed_by  = EXCLUDED.managed_by,
      trigger     = EXCLUDED.trigger,
      action      = EXCLUDED.action,
      schedule    = EXCLUDED.schedule,
      updated_at  = now();
