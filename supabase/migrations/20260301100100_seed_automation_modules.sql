-- ============================================================================
-- Seed automation_modules, workflow_definitions, and automation_rules
-- ============================================================================

-- ── 1. New workflow_definitions for automation pipelines ─────────────────────

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload, schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds, is_enabled, priority, tags)
VALUES
  ('automation-content-validator', 'Automation: Content Validator',
   'Validates content completeness, format, encoding, and quality',
   'automation-content-validator', 'content_processing', '{"automated":true}'::jsonb,
   '0 5 * * *', 2, 60, 1, 180, true, 6, ARRAY['automation','validation']),

  ('automation-link-sanitizer', 'Automation: Link Sanitizer',
   'Normalizes URLs, strips tracking params, validates format',
   'automation-link-sanitizer', 'content_processing', '{"automated":true}'::jsonb,
   '0 5 * * 1', 2, 60, 1, 180, true, 7, ARRAY['automation','links']),

  ('automation-data-normalizer', 'Automation: Data Normalizer',
   'Normalizes phone numbers, emails, country/city names, categories',
   'automation-data-normalizer', 'content_processing', '{"automated":true}'::jsonb,
   '0 6 * * *', 2, 60, 1, 180, true, 6, ARRAY['automation','normalization']),

  ('automation-geo-enricher', 'Automation: Geo Enricher',
   'Links content to cities/countries, validates coordinates, assigns continents',
   'automation-geo-enricher', 'content_processing', '{"automated":true}'::jsonb,
   '0 6 * * *', 2, 60, 1, 180, true, 5, ARRAY['automation','geo']),

  ('automation-auto-tagger', 'Automation: Auto Tagger',
   'AI-powered tag suggestions using embedding similarity',
   'automation-auto-tagger', 'import_jobs', '{"automated":true}'::jsonb,
   NULL, 2, 60, 1, 300, true, 5, ARRAY['automation','tagging','ai']),

  ('automation-ai-enhancer', 'Automation: AI Enhancer',
   'AI-generated content improvements for descriptions and summaries',
   'automation-ai-enhancer', 'import_jobs', '{"automated":true}'::jsonb,
   NULL, 1, 120, 1, 600, true, 8, ARRAY['automation','ai']);

-- ── 2. Seed automation_modules ──────────────────────────────────────────────

INSERT INTO public.automation_modules
  (slug, display_name, description, module_type, content_types,
   auto_approve_threshold, batch_size, rate_limit_per_hour, config)
VALUES
  ('content-validator', 'Content Validator',
   'Checks required fields, format validation, encoding issues, placeholder detection',
   'content_validation',
   ARRAY['venues','events','personalities','news_articles','cities','countries'],
   0.95, 100, 10, '{"min_description_length":50}'::jsonb),

  ('link-sanitizer', 'Link Sanitizer',
   'Normalizes URLs, strips tracking parameters, enforces HTTPS, validates format',
   'link_sanitization',
   ARRAY['venues','events','personalities','news_articles'],
   0.90, 200, 5, '{"strip_params":["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid","ref","mc_cid","mc_eid"]}'::jsonb),

  ('data-normalizer', 'Data Normalizer',
   'Normalizes phone numbers, emails, country/city names, whitespace, categories',
   'data_normalization',
   ARRAY['venues','events','personalities'],
   0.92, 100, 10, '{}'::jsonb),

  ('geo-enricher', 'Geo Enricher',
   'Links content to cities/countries, validates coordinates, assigns continents',
   'geo_enrichment',
   ARRAY['venues','events','personalities','news_articles'],
   0.85, 200, 5, '{}'::jsonb),

  ('auto-tagger', 'Auto Tagger',
   'Suggests tags using embedding cosine similarity against existing tag embeddings',
   'auto_tagging',
   ARRAY['venues','events','personalities','news_articles'],
   0.85, 50, 3, '{"min_similarity":0.7,"max_tags_per_item":8}'::jsonb),

  ('ai-enhancer', 'AI Enhancer',
   'AI-powered description improvement and missing field completion',
   'ai_enhancement',
   ARRAY['venues','events','personalities','cities'],
   1.01, 20, 2, '{"model":"gpt-4o-mini","max_tokens":500}'::jsonb);

-- ── 3. Link modules to workflow_definitions ─────────────────────────────────

UPDATE public.automation_modules m
SET workflow_definition_id = d.id
FROM public.workflow_definitions d
WHERE d.name = 'automation-' || m.slug;

-- ── 4. Seed automation_rules ────────────────────────────────────────────────

-- Content Validator rules
WITH cv AS (SELECT id FROM public.automation_modules WHERE slug = 'content-validator')
INSERT INTO public.automation_rules (module_id, name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order)
SELECT cv.id, r.*
FROM cv, (VALUES
  ('required_description', 'Description is required', 'venues', 'description', 'required', '{}'::jsonb, 'warning', false, 1),
  ('min_length_description', 'Description minimum 50 chars', 'venues', 'description', 'length', '{"min":50}'::jsonb, 'info', false, 2),
  ('required_description_events', 'Event description required', 'events', 'description', 'required', '{}'::jsonb, 'warning', false, 3),
  ('html_entities', 'Fix HTML entities in plain text', 'venues', 'description', 'sanitize', '{"fix":"html_entities"}'::jsonb, 'info', true, 4),
  ('html_entities_events', 'Fix HTML entities in event text', 'events', 'description', 'sanitize', '{"fix":"html_entities"}'::jsonb, 'info', true, 5),
  ('html_entities_personalities', 'Fix HTML entities in bio', 'personalities', 'bio', 'sanitize', '{"fix":"html_entities"}'::jsonb, 'info', true, 6),
  ('placeholder_text', 'Detect placeholder descriptions', 'venues', 'description', 'regex', '{"pattern":"(?i)(lorem ipsum|todo|tbd|placeholder|coming soon|test)","flag":true}'::jsonb, 'warning', false, 7),
  ('encoding_issues', 'Detect mojibake encoding', 'venues', 'description', 'sanitize', '{"fix":"encoding"}'::jsonb, 'error', true, 8),
  ('whitespace_trim', 'Trim excessive whitespace', 'venues', 'name', 'normalize', '{"fix":"trim"}'::jsonb, 'info', true, 9),
  ('required_name', 'Name is required', 'venues', 'name', 'required', '{}'::jsonb, 'critical', false, 10)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);

-- Link Sanitizer rules
WITH ls AS (SELECT id FROM public.automation_modules WHERE slug = 'link-sanitizer')
INSERT INTO public.automation_rules (module_id, name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order)
SELECT ls.id, r.*
FROM ls, (VALUES
  ('strip_tracking_params', 'Remove UTM and tracking parameters', 'venues', 'website', 'sanitize', '{"fix":"strip_params"}'::jsonb, 'info', true, 1),
  ('normalize_protocol', 'Add https:// if missing', 'venues', 'website', 'normalize', '{"fix":"add_protocol"}'::jsonb, 'info', true, 2),
  ('strip_trailing_slash', 'Remove trailing slashes', 'venues', 'website', 'normalize', '{"fix":"trailing_slash"}'::jsonb, 'info', true, 3),
  ('validate_url_format', 'Validate URL format', 'venues', 'website', 'url_valid', '{}'::jsonb, 'error', false, 4),
  ('news_url_tracking', 'Strip tracking from news URLs', 'news_articles', 'url', 'sanitize', '{"fix":"strip_params"}'::jsonb, 'info', true, 5),
  ('news_source_url_tracking', 'Strip tracking from source URLs', 'news_articles', 'source_url', 'sanitize', '{"fix":"strip_params"}'::jsonb, 'info', true, 6),
  ('event_url_sanitize', 'Sanitize event URLs', 'events', 'website', 'sanitize', '{"fix":"strip_params"}'::jsonb, 'info', true, 7)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);

-- Data Normalizer rules
WITH dn AS (SELECT id FROM public.automation_modules WHERE slug = 'data-normalizer')
INSERT INTO public.automation_rules (module_id, name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order)
SELECT dn.id, r.*
FROM dn, (VALUES
  ('email_lowercase', 'Lowercase email addresses', 'venues', 'email', 'normalize', '{"fix":"lowercase"}'::jsonb, 'info', true, 1),
  ('whitespace_cleanup', 'Clean excessive whitespace in names', 'venues', 'name', 'normalize', '{"fix":"whitespace"}'::jsonb, 'info', true, 2),
  ('whitespace_events', 'Clean whitespace in event titles', 'events', 'title', 'normalize', '{"fix":"whitespace"}'::jsonb, 'info', true, 3),
  ('whitespace_personalities', 'Clean whitespace in personality names', 'personalities', 'name', 'normalize', '{"fix":"whitespace"}'::jsonb, 'info', true, 4),
  ('country_name_normalize', 'Standardize country names', 'venues', 'country', 'normalize', '{"fix":"country_name"}'::jsonb, 'info', true, 5),
  ('phone_format_check', 'Validate phone number format', 'venues', 'phone', 'format', '{"pattern":"phone"}'::jsonb, 'warning', false, 6)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);

-- Geo Enricher rules
WITH ge AS (SELECT id FROM public.automation_modules WHERE slug = 'geo-enricher')
INSERT INTO public.automation_rules (module_id, name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order)
SELECT ge.id, r.*
FROM ge, (VALUES
  ('missing_city_id', 'Assign city_id from text city name', 'venues', 'city_id', 'geo_match', '{"source":"city"}'::jsonb, 'warning', true, 1),
  ('missing_country_id', 'Assign country_id from text country', 'venues', 'country_id', 'geo_match', '{"source":"country"}'::jsonb, 'warning', true, 2),
  ('event_missing_city', 'Assign city to events', 'events', 'city_id', 'geo_match', '{"source":"city"}'::jsonb, 'warning', true, 3),
  ('event_missing_country', 'Assign country to events', 'events', 'country_id', 'geo_match', '{"source":"country"}'::jsonb, 'warning', true, 4),
  ('personality_missing_country', 'Assign country from nationality', 'personalities', 'country_id', 'geo_match', '{"source":"nationality"}'::jsonb, 'info', true, 5)
) AS r(name, description, content_type, field_name, rule_type, rule_config, severity, auto_fix, sort_order);
