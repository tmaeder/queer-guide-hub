-- ============================================================
-- Background Automation System Tables
-- Applied: 2026-02-28
-- ============================================================

-- 1. automation_modules — configurable automation modules
CREATE TABLE IF NOT EXISTS public.automation_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'content_quality', 'link_validation', 'geo_enrichment',
    'date_normalization', 'tagging', 'contact_normalization',
    'ai_enhancement'
  )),
  is_enabled BOOLEAN DEFAULT false,
  confidence_threshold NUMERIC(3,2) DEFAULT 0.85
    CHECK (confidence_threshold BETWEEN 0.0 AND 1.0),
  auto_approve BOOLEAN DEFAULT false,
  schedule TEXT,               -- cron expression
  batch_size INT DEFAULT 50,
  rate_limit_per_minute INT DEFAULT 60,
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  config JSONB DEFAULT '{}',   -- module-specific settings
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'partial', 'failed') OR last_run_status IS NULL),
  total_runs INT DEFAULT 0,
  total_items_processed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.automation_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_modules_select"
  ON public.automation_modules FOR SELECT USING (true);

CREATE POLICY "automation_modules_admin_all"
  ON public.automation_modules FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 2. content_flags — flagged content items pending review
CREATE TABLE IF NOT EXISTS public.content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  content_type TEXT NOT NULL,  -- venues, events, news_articles, etc.
  content_id UUID NOT NULL,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'quality_issue', 'broken_link', 'geo_mismatch', 'date_issue',
    'missing_tags', 'contact_invalid', 'ai_suggestion', 'duplicate',
    'encoding_issue', 'outdated'
  )),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  confidence NUMERIC(3,2) CHECK (confidence BETWEEN 0.0 AND 1.0),
  title TEXT NOT NULL,
  description TEXT,
  current_value JSONB,
  suggested_value JSONB,
  auto_approved BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'expired')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_flags_status ON public.content_flags(status);
CREATE INDEX idx_content_flags_module ON public.content_flags(module_name);
CREATE INDEX idx_content_flags_content ON public.content_flags(content_type, content_id);
CREATE INDEX idx_content_flags_severity ON public.content_flags(severity) WHERE status = 'pending';
CREATE INDEX idx_content_flags_created ON public.content_flags(created_at DESC);

ALTER TABLE public.content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_flags_select"
  ON public.content_flags FOR SELECT USING (true);

CREATE POLICY "content_flags_admin_all"
  ON public.content_flags FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Enable Realtime for content_flags so the dashboard can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_flags;

-- 3. link_validations — link checking results
CREATE TABLE IF NOT EXISTS public.link_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  field_name TEXT NOT NULL,          -- which field contained the URL
  original_url TEXT NOT NULL,
  normalized_url TEXT,               -- cleaned URL
  http_status INT,
  redirect_url TEXT,
  is_alive BOOLEAN,
  is_https BOOLEAN,
  had_tracking_params BOOLEAN DEFAULT false,
  stripped_params TEXT[],             -- which tracking params were removed
  response_time_ms INT,
  error_message TEXT,
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  check_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_link_validations_content ON public.link_validations(content_type, content_id);
CREATE INDEX idx_link_validations_alive ON public.link_validations(is_alive) WHERE is_alive = false;
CREATE INDEX idx_link_validations_url ON public.link_validations(original_url);
CREATE UNIQUE INDEX idx_link_validations_unique ON public.link_validations(content_type, content_id, field_name, original_url);

ALTER TABLE public.link_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "link_validations_select"
  ON public.link_validations FOR SELECT USING (true);

CREATE POLICY "link_validations_admin_all"
  ON public.link_validations FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 4. geo_validations — geographic enrichment results
CREATE TABLE IF NOT EXISTS public.geo_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  original_lat DOUBLE PRECISION,
  original_lng DOUBLE PRECISION,
  validated_lat DOUBLE PRECISION,
  validated_lng DOUBLE PRECISION,
  geocoded_address TEXT,
  continent TEXT,
  country TEXT,
  country_code TEXT,
  region TEXT,
  city TEXT,
  queer_village TEXT,
  timezone TEXT,
  confidence NUMERIC(3,2),
  has_mismatch BOOLEAN DEFAULT false,
  mismatch_details TEXT,
  source TEXT,                        -- 'nominatim', 'google', 'mapbox', etc.
  last_validated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_geo_validations_unique ON public.geo_validations(content_type, content_id);
CREATE INDEX idx_geo_validations_mismatch ON public.geo_validations(has_mismatch) WHERE has_mismatch = true;

ALTER TABLE public.geo_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geo_validations_select"
  ON public.geo_validations FOR SELECT USING (true);

CREATE POLICY "geo_validations_admin_all"
  ON public.geo_validations FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 5. automation_rules — custom validation rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'regex', 'length', 'required', 'format', 'range', 'custom'
  )),
  target_table TEXT NOT NULL,
  target_field TEXT NOT NULL,
  rule_config JSONB NOT NULL,    -- { pattern, min, max, format, etc. }
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_rules_select"
  ON public.automation_rules FOR SELECT USING (true);

CREATE POLICY "automation_rules_admin_all"
  ON public.automation_rules FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 6. Triggers for updated_at
CREATE TRIGGER set_automation_modules_updated_at
  BEFORE UPDATE ON public.automation_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

CREATE TRIGGER set_content_flags_updated_at
  BEFORE UPDATE ON public.content_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

-- 7. Seed automation modules
INSERT INTO public.automation_modules
  (name, display_name, description, category, is_enabled, confidence_threshold, auto_approve, schedule, batch_size, rate_limit_per_minute, priority, config)
VALUES
  ('content-quality-checker', 'Content Quality Checker',
   'Reviews content for encoding issues, broken HTML, duplicate fragments, and outdated text',
   'content_quality', true, 0.90, false, '0 4 * * *', 100, 120, 3,
   '{"check_encoding": true, "check_html": true, "check_duplicates": true, "min_description_length": 20}'),

  ('link-validator', 'Link Validator',
   'Validates all external links, removes tracking parameters, normalizes URLs, flags dead links',
   'link_validation', true, 0.95, true, '0 5 * * 0', 200, 30, 4,
   '{"strip_utm": true, "strip_fbclid": true, "enforce_https": true, "timeout_ms": 10000, "max_redirects": 5}'),

  ('geo-enricher', 'Geographic Enricher',
   'Validates coordinates, assigns continent/country/region/city, detects location mismatches',
   'geo_enrichment', true, 0.80, false, '30 3 * * *', 50, 30, 5,
   '{"geocoder": "nominatim", "detect_queer_villages": true, "auto_assign_timezone": true}'),

  ('date-normalizer', 'Date & Timezone Normalizer',
   'Auto-detects timezone from location, normalizes dates to UTC, validates event times',
   'date_normalization', true, 0.95, true, '0 2 * * *', 200, 120, 6,
   '{"normalize_to_utc": true, "detect_timezone_from_location": true, "flag_past_events": true}'),

  ('auto-tagger', 'Auto Tagger & Classifier',
   'Assigns tags based on content, normalizes synonyms and spelling variants',
   'tagging', true, 0.75, false, '30 4 * * *', 100, 60, 5,
   '{"normalize_synonyms": true, "normalize_plural": true, "min_confidence": 0.7, "max_tags_per_item": 15}'),

  ('contact-normalizer', 'Contact Data Normalizer',
   'Validates and normalizes phone numbers (E.164), emails (RFC), websites, and social links',
   'contact_normalization', true, 0.95, true, '0 3 * * *', 200, 120, 7,
   '{"phone_format": "E.164", "validate_email_mx": false, "normalize_social_urls": true}'),

  ('ai-content-enhancer', 'AI Content Enhancer',
   'Generates improved descriptions, removes redundancy, maintains inclusive language',
   'ai_enhancement', false, 0.70, false, NULL, 20, 10, 8,
   '{"model": "gpt-4o-mini", "max_tokens": 500, "temperature": 0.3, "inclusive_language_check": true}');
