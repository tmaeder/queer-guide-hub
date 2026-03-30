-- Content classifier automation module + new flag types for LGBTI relevance and sensitivity
-- Extends the existing automation system with classification capabilities

-- 1. Add classification_result column to ingestion_staging
ALTER TABLE public.ingestion_staging
  ADD COLUMN IF NOT EXISTS classification_result JSONB DEFAULT NULL;

COMMENT ON COLUMN public.ingestion_staging.classification_result IS
  'Full classification result from content-classifier: lgbti_relevance_score, sensitivity_flags, review_priority';

-- 2. Add classification columns to content tables for caching results on committed content
DO $$
BEGIN
  -- venues
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'lgbti_relevance_score') THEN
    ALTER TABLE public.venues ADD COLUMN lgbti_relevance_score NUMERIC(3,2) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'sensitivity_flags') THEN
    ALTER TABLE public.venues ADD COLUMN sensitivity_flags JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'classified_at') THEN
    ALTER TABLE public.venues ADD COLUMN classified_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- events
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'lgbti_relevance_score') THEN
    ALTER TABLE public.events ADD COLUMN lgbti_relevance_score NUMERIC(3,2) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'sensitivity_flags') THEN
    ALTER TABLE public.events ADD COLUMN sensitivity_flags JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'classified_at') THEN
    ALTER TABLE public.events ADD COLUMN classified_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- news_articles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news_articles' AND column_name = 'lgbti_relevance_score') THEN
    ALTER TABLE public.news_articles ADD COLUMN lgbti_relevance_score NUMERIC(3,2) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news_articles' AND column_name = 'sensitivity_flags') THEN
    ALTER TABLE public.news_articles ADD COLUMN sensitivity_flags JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news_articles' AND column_name = 'classified_at') THEN
    ALTER TABLE public.news_articles ADD COLUMN classified_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- personalities
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personalities' AND column_name = 'lgbti_relevance_score') THEN
    ALTER TABLE public.personalities ADD COLUMN lgbti_relevance_score NUMERIC(3,2) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personalities' AND column_name = 'sensitivity_flags') THEN
    ALTER TABLE public.personalities ADD COLUMN sensitivity_flags JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personalities' AND column_name = 'classified_at') THEN
    ALTER TABLE public.personalities ADD COLUMN classified_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- 3. Seed the content-classifier automation module
INSERT INTO public.automation_modules (
  id, slug, display_name, module_type, content_types, is_enabled,
  auto_approve_threshold, batch_size, rate_limit_per_hour, config
) VALUES (
  gen_random_uuid(),
  'content-classifier',
  'Content Classifier',
  'ai_check',
  ARRAY['venues', 'events', 'news_articles', 'personalities'],
  true,
  1.1,  -- never auto-approve classification flags (must be reviewed)
  50,
  4,    -- 4 runs/hour max (batch of 50 each = 200 items/hour)
  jsonb_build_object(
    'description', 'AI-powered LGBTI relevance scoring and sensitivity detection (legal, medical, NSFW)',
    'ai_model', 'gpt-4o-mini',
    'min_relevance_threshold', 0.7,
    'flag_categories', ARRAY['lgbti_relevance', 'sensitivity_legal', 'sensitivity_medical', 'sensitivity_nsfw']
  )
) ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  module_type = EXCLUDED.module_type,
  content_types = EXCLUDED.content_types,
  config = EXCLUDED.config;

-- 4. Seed classification rules
DO $$
DECLARE
  v_module_id UUID;
BEGIN
  SELECT id INTO v_module_id FROM public.automation_modules WHERE slug = 'content-classifier';

  -- LGBTI relevance check for each content type
  INSERT INTO public.automation_rules (id, module_id, name, description, content_type, field_name, rule_type, rule_config, severity, is_enabled, auto_fix, sort_order)
  VALUES
    (gen_random_uuid(), v_module_id, 'venue-lgbti-relevance', 'Check LGBTI relevance for venues', 'venues', 'lgbti_relevance_score', 'ai_check',
     '{"check": "lgbti_relevance", "threshold": 0.7}'::jsonb, 'warning', true, false, 10),
    (gen_random_uuid(), v_module_id, 'event-lgbti-relevance', 'Check LGBTI relevance for events', 'events', 'lgbti_relevance_score', 'ai_check',
     '{"check": "lgbti_relevance", "threshold": 0.7}'::jsonb, 'warning', true, false, 20),
    (gen_random_uuid(), v_module_id, 'news-lgbti-relevance', 'Check LGBTI relevance for news articles', 'news_articles', 'lgbti_relevance_score', 'ai_check',
     '{"check": "lgbti_relevance", "threshold": 0.7}'::jsonb, 'warning', true, false, 30),
    (gen_random_uuid(), v_module_id, 'personality-lgbti-relevance', 'Check LGBTI relevance for personalities', 'personalities', 'lgbti_relevance_score', 'ai_check',
     '{"check": "lgbti_relevance", "threshold": 0.7}'::jsonb, 'warning', true, false, 40),

    -- Sensitivity detection for each content type
    (gen_random_uuid(), v_module_id, 'venue-sensitivity', 'Detect legal/medical/NSFW content in venues', 'venues', 'sensitivity_flags', 'ai_check',
     '{"check": "sensitivity", "categories": ["legal", "medical", "nsfw"]}'::jsonb, 'warning', true, false, 50),
    (gen_random_uuid(), v_module_id, 'event-sensitivity', 'Detect legal/medical/NSFW content in events', 'events', 'sensitivity_flags', 'ai_check',
     '{"check": "sensitivity", "categories": ["legal", "medical", "nsfw"]}'::jsonb, 'warning', true, false, 60),
    (gen_random_uuid(), v_module_id, 'news-sensitivity', 'Detect legal/medical/NSFW content in news articles', 'news_articles', 'sensitivity_flags', 'ai_check',
     '{"check": "sensitivity", "categories": ["legal", "medical", "nsfw"]}'::jsonb, 'warning', true, false, 70),
    (gen_random_uuid(), v_module_id, 'personality-sensitivity', 'Detect legal/medical/NSFW content in personalities', 'personalities', 'sensitivity_flags', 'ai_check',
     '{"check": "sensitivity", "categories": ["legal", "medical", "nsfw"]}'::jsonb, 'warning', true, false, 80)
  ON CONFLICT DO NOTHING;
END $$;

-- 5. Partial index for unclassified content (batch processing)
CREATE INDEX IF NOT EXISTS idx_venues_unclassified ON public.venues (created_at)
  WHERE classified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_unclassified ON public.events (created_at)
  WHERE classified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_news_articles_unclassified ON public.news_articles (created_at)
  WHERE classified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personalities_unclassified ON public.personalities (created_at)
  WHERE classified_at IS NULL;

-- 6. Index on content_flags for the new flag types
CREATE INDEX IF NOT EXISTS idx_content_flags_classifier
  ON public.content_flags (content_type, flag_type, status)
  WHERE module_name = 'content-classifier';
