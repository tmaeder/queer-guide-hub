-- News text quality cleanup (2026-06-21)
-- 1. De-index pure stub sources (aggregator snippets, not real articles)
-- 2. Register pipeline-resanitize-news as a one-time admin automation

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

-- Register the retroactive re-sanitization as a one-time admin automation.
-- Disabled by default — trigger manually from /admin or via execute_sql.
INSERT INTO admin_automations (name, description, edge_function, cron_expression, is_enabled, config)
VALUES (
  'news_resanitize_backfill',
  'Re-run updated sanitizer (HTML strip + extended junk phrases) over live news articles with contaminated content.',
  'pipeline-resanitize-news',
  null,
  false,
  '{"batch_size": 200, "dry_run": false}'::jsonb
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      edge_function = EXCLUDED.edge_function,
      config = EXCLUDED.config,
      updated_at = now();
