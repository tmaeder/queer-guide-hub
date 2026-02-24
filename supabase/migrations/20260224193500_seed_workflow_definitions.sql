-- ============================================================
-- Phase 0: Seed workflow_definitions
-- 8 cron jobs + 16 manual/admin workflows
-- Applied: 2026-02-24
-- ============================================================

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload, schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds, is_enabled, priority, tags)
VALUES
  -- === SCHEDULED CRON JOBS (8) ===
  ('fetch-news', 'Fetch News', 'Fetch news from RSS/API sources (NewsAPI, NewsData, GNews, TheNewsAPI)',
   'fetch-news', 'scheduled_jobs', '{"automated": true}', '0 * * * *',
   3, 30, 1, 120, true, 3, ARRAY['cron', 'import', 'news']),

  ('import-foursquare-venues', 'Import Foursquare Venues', 'Import LGBTQ venues from Foursquare Places API (20 major cities, rotated by UTC hour)',
   'import-foursquare-venues', 'scheduled_jobs', '{"automated": true}', '0 2 * * *',
   3, 60, 1, 150, false, 5, ARRAY['cron', 'import', 'venues']),

  ('import-ilga-data', 'Import ILGA Data', 'Import LGBTQ rights data for 199 countries (smart batch, oldest-first rotation)',
   'import-ilga-data', 'scheduled_jobs', '{"automated": true}', '0 2 * * *',
   3, 60, 1, 150, true, 5, ARRAY['cron', 'import', 'countries']),

  ('geo-link-content', 'Geo-Link Content', 'Deterministic geo-linking of venues/events/personalities/news to cities/countries',
   'geo-link-content', 'scheduled_jobs', '{"batch_all": true, "batch_limit": 200}', '30 * * * *',
   2, 30, 1, 120, true, 4, ARRAY['cron', 'enrichment', 'geo']),

  ('run-automated-reviews', 'Run Automated Reviews', 'Content quality reviews for venues/events/personalities/news (batch 500)',
   'run-automated-reviews', 'scheduled_jobs', '{"automated": true}', '0 3 * * *',
   2, 60, 1, 150, true, 6, ARRAY['cron', 'quality', 'review']),

  ('sync-content-links', 'Sync Content Links', 'Scan all content for URLs and populate content_links table',
   'sync-content-links', 'scheduled_jobs', '{"automated": true}', '0 4 * * 0',
   2, 60, 1, 150, true, 7, ARRAY['cron', 'links', 'weekly']),

  ('validate-links-weekly', 'Validate Links (Weekly Full)', 'Full HTTP validation of all URLs in content_links',
   'validate-links', 'scheduled_jobs', '{"automated": true}', '30 4 * * 0',
   2, 60, 1, 150, true, 7, ARRAY['cron', 'links', 'validation', 'weekly']),

  ('validate-links-recheck', 'Validate Links (6h Recheck)', 'Recheck previously-validated links (batch 50)',
   'validate-links', 'scheduled_jobs', '{"recheck": true, "batch_size": 50}', '0 */6 * * *',
   1, 30, 1, 120, true, 8, ARRAY['cron', 'links', 'validation']),

  -- === MANUAL / ADMIN WORKFLOWS (16) ===
  ('populate-embeddings', 'Populate Embeddings', 'Generate 768-dim vector embeddings via CF Workers AI (BGE-base). Supports venues, events, cities, countries, news, personalities, tags, marketplace.',
   'populate-embeddings', 'import_jobs', '{}', NULL,
   3, 60, 1, 150, true, 4, ARRAY['manual', 'embeddings', 'ai']),

  ('auto-tag-content', 'Auto-Tag Content', 'AI-powered auto-tagging of content using OpenAI',
   'auto-tag-content', 'import_jobs', '{}', NULL,
   2, 30, 1, 120, true, 5, ARRAY['manual', 'tagging', 'ai']),

  ('clean-merge-duplicates', 'Clean & Merge Duplicates', '5-phase automated tag dedup: whitespace fix, exact merge, near-dupe merge, manual review, junction fix',
   'clean-merge-duplicates', 'import_jobs', '{"dry_run": false}', NULL,
   1, 30, 1, 300, true, 6, ARRAY['manual', 'tags', 'dedup']),

  ('import-rest-countries', 'Import REST Countries', 'Import country data from REST Countries API (safe UPSERT)',
   'import-rest-countries', 'import_jobs', '{}', NULL,
   3, 60, 1, 120, true, 5, ARRAY['manual', 'import', 'countries']),

  ('import-airports-data', 'Import Airports Data', 'Seed airports table from Travelpayouts reference data (9,253 airports)',
   'import-airports-data', 'import_jobs', '{}', NULL,
   2, 60, 1, 150, true, 7, ARRAY['manual', 'import', 'travel']),

  ('scrape-gaycities-events', 'Scrape GayCities Events', 'Scrape events from gaytravel4u.com (20 cities)',
   'scrape-gaycities-events', 'import_jobs', '{}', NULL,
   2, 30, 1, 150, true, 6, ARRAY['manual', 'import', 'events', 'scraper']),

  ('bulk-scrape-events', 'Bulk Scrape Events', 'Multi-source event scraping (Eventbrite, Ticketmaster)',
   'bulk-scrape-events', 'import_jobs', '{}', NULL,
   2, 30, 1, 150, true, 6, ARRAY['manual', 'import', 'events', 'scraper']),

  ('background-import-manager', 'Background Import Manager', 'Central import orchestrator supporting 23 import types',
   'background-import-manager', 'import_jobs', '{}', NULL,
   3, 30, 2, 150, true, 4, ARRAY['manual', 'import', 'orchestrator']),

  ('optimize-images-batch', 'Optimize Images Batch', 'Image compression and resize',
   'optimize-images-batch', 'import_jobs', '{}', NULL,
   2, 30, 1, 120, true, 7, ARRAY['manual', 'media', 'images']),

  ('send-bulk-email', 'Send Bulk Email', 'Templated bulk email via Resend API',
   'send-bulk-email', 'import_jobs', '{}', NULL,
   3, 60, 1, 120, true, 3, ARRAY['manual', 'email', 'notifications']),

  ('send-group-notifications', 'Send Group Notifications', 'Group activity notifications via Resend',
   'send-group-notifications', 'content_processing', '{}', NULL,
   3, 30, 2, 60, true, 3, ARRAY['event-driven', 'email', 'notifications']),

  ('generate-sitemap', 'Generate Sitemap', 'Generate and update sitemap.xml',
   'generate-sitemap', 'import_jobs', '{}', NULL,
   2, 30, 1, 60, true, 8, ARRAY['manual', 'seo']),

  ('compute-tag-similarities', 'Compute Tag Similarities', 'Recompute pgvector cosine tag relationships (batched 200 tags/batch)',
   'clean-merge-duplicates', 'import_jobs', '{"compute_similarities": true}', NULL,
   1, 60, 1, 600, true, 7, ARRAY['manual', 'tags', 'embeddings']),

  ('ingestion-pipeline', 'Ingestion Pipeline', 'Multi-stage import pipeline (fetch->validate->dedup->enrich->review->commit)',
   'ingestion-pipeline', 'import_jobs', '{}', NULL,
   3, 30, 2, 150, true, 4, ARRAY['manual', 'import', 'pipeline']),

  ('send-admin-alert', 'Send Admin Alert', 'Send alert email to admin about dead-letter queue or failures',
   'send-bulk-email', 'scheduled_jobs', '{"template": "admin_alert"}', NULL,
   3, 30, 1, 30, true, 1, ARRAY['system', 'alerting']),

  ('health-check', 'Health Check', 'Verify all scheduled workflows ran in the last 24h',
   'workflow-dispatcher', 'scheduled_jobs', '{"action": "health_check"}', '0 8 * * *',
   1, 30, 1, 30, true, 2, ARRAY['system', 'monitoring']);
