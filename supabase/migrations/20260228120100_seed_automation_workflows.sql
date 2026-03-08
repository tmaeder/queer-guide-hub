-- ============================================================
-- Seed workflow definitions for automation modules
-- Applied: 2026-02-28
-- ============================================================

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload, schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds, is_enabled, priority, tags)
VALUES
  ('content-quality-check', 'Content Quality Check', 'Reviews content for encoding issues, broken HTML, duplicate fragments, and outdated text',
   'content-automation', 'content_processing', '{"module": "content-quality-checker"}', '0 4 * * *',
   2, 30, 1, 180, true, 3, ARRAY['cron', 'automation', 'quality']),

  ('link-validation-full', 'Link Validation (Full)', 'Validates all external links, removes tracking params, normalizes URLs, flags dead links',
   'content-automation', 'content_processing', '{"module": "link-validator", "full_scan": true}', '0 5 * * 0',
   2, 60, 1, 300, true, 4, ARRAY['cron', 'automation', 'links']),

  ('link-validation-incremental', 'Link Validation (Incremental)', 'Revalidates recently modified content links',
   'content-automation', 'content_processing', '{"module": "link-validator", "incremental": true, "batch_size": 50}', '0 */6 * * *',
   1, 30, 1, 120, true, 5, ARRAY['cron', 'automation', 'links']),

  ('geo-enrichment', 'Geographic Enrichment', 'Validates coordinates and assigns continent/country/region/city/queer-village',
   'content-automation', 'content_processing', '{"module": "geo-enricher"}', '30 3 * * *',
   2, 60, 1, 180, true, 5, ARRAY['cron', 'automation', 'geo']),

  ('date-normalization', 'Date & Timezone Normalization', 'Normalizes dates to UTC, detects timezone from location, validates event times',
   'content-automation', 'content_processing', '{"module": "date-normalizer"}', '0 2 * * *',
   1, 30, 1, 120, true, 6, ARRAY['cron', 'automation', 'dates']),

  ('auto-tag-classify', 'Auto-Tag & Classify', 'Assigns tags based on content, normalizes synonyms and spelling variants',
   'content-automation', 'content_processing', '{"module": "auto-tagger"}', '30 4 * * *',
   2, 30, 1, 150, true, 5, ARRAY['cron', 'automation', 'tagging']),

  ('contact-normalization', 'Contact Data Normalization', 'Validates and normalizes phone (E.164), email (RFC), websites, and social links',
   'content-automation', 'content_processing', '{"module": "contact-normalizer"}', '0 3 * * *',
   1, 30, 1, 120, true, 7, ARRAY['cron', 'automation', 'contacts']),

  ('ai-content-enhancement', 'AI Content Enhancement', 'Generates improved descriptions, removes redundancy, checks inclusive language',
   'content-automation', 'content_processing', '{"module": "ai-content-enhancer"}', NULL,
   2, 60, 1, 300, false, 8, ARRAY['manual', 'automation', 'ai'])
ON CONFLICT (name) DO NOTHING;
