-- ============================================================
-- Scrape Sources & Scrape Runs
-- Centralised registry for scheduled web scraping targets.
-- Each source describes ONE website/feed. Scrape runs track
-- individual invocations and feed into the ingestion pipeline.
-- Applied: 2026-02-28
-- ============================================================

-- 1. scrape_sources — what to scrape
CREATE TABLE IF NOT EXISTS public.scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'products', 'events', 'accommodations', 'cities', 'news', 'countries', 'queer_villages'
  )),
  target_table TEXT NOT NULL CHECK (target_table IN (
    'venues', 'events', 'news_articles', 'cities', 'countries', 'marketplace_products'
  )),

  -- Scraping configuration
  scrape_method TEXT NOT NULL DEFAULT 'firecrawl' CHECK (scrape_method IN (
    'firecrawl', 'html_fetch', 'api', 'rss', 'sitemap'
  )),
  scrape_config JSONB NOT NULL DEFAULT '{}',
  -- scrape_config examples:
  --   { "limit": 500, "selectors": {...}, "pagination": {...} }
  --   { "api_url": "...", "api_key_env": "...", "params": {...} }

  -- Scheduling
  schedule_cron TEXT,                        -- null = manual only
  schedule_interval_hours INT DEFAULT 168,   -- fallback: every 7 days
  is_enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

  -- Status tracking
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  total_runs INT DEFAULT 0,
  total_items_fetched INT DEFAULT 0,
  consecutive_failures INT DEFAULT 0,

  -- Rate limiting / politeness
  rate_limit_ms INT DEFAULT 2000,
  max_pages_per_run INT DEFAULT 500,
  respect_robots_txt BOOLEAN DEFAULT true,
  user_agent TEXT DEFAULT 'QueerGuide/1.0 (+https://queer.guide/bot)',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scrape_sources_slug ON public.scrape_sources(slug);
CREATE INDEX idx_scrape_sources_enabled ON public.scrape_sources(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_scrape_sources_schedule ON public.scrape_sources(schedule_interval_hours)
  WHERE is_enabled = true AND schedule_cron IS NULL;
CREATE INDEX idx_scrape_sources_next_run ON public.scrape_sources(last_run_at NULLS FIRST)
  WHERE is_enabled = true;

ALTER TABLE public.scrape_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_sources_select"
  ON public.scrape_sources FOR SELECT USING (true);

CREATE POLICY "scrape_sources_admin_all"
  ON public.scrape_sources FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 2. scrape_runs — execution log per source
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.scrape_sources(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.import_jobs_enhanced(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'partial'
  )),

  -- Counts
  pages_crawled INT DEFAULT 0,
  items_found INT DEFAULT 0,
  items_staged INT DEFAULT 0,
  items_new INT DEFAULT 0,
  items_duplicate INT DEFAULT 0,
  items_error INT DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Details
  error_message TEXT,
  run_log JSONB DEFAULT '[]',
  run_config JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scrape_runs_source ON public.scrape_runs(source_id, created_at DESC);
CREATE INDEX idx_scrape_runs_status ON public.scrape_runs(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_scrape_runs_created ON public.scrape_runs(created_at DESC);

ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_runs_select"
  ON public.scrape_runs FOR SELECT USING (true);

CREATE POLICY "scrape_runs_admin_all"
  ON public.scrape_runs FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 3. Triggers for updated_at
CREATE TRIGGER set_scrape_sources_updated_at
  BEFORE UPDATE ON public.scrape_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_workflow_updated_at();

-- 4. Add columns to import_jobs_enhanced if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN source_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'pipeline_stage'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN pipeline_stage TEXT DEFAULT 'queued';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_fetched'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_fetched INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_ai_approved'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_ai_approved INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_ai_rejected'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_ai_rejected INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_needs_review'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_needs_review INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_deduplicated'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_deduplicated INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'items_committed'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN items_committed INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs_enhanced' AND column_name = 'ai_cost_usd'
  ) THEN
    ALTER TABLE public.import_jobs_enhanced ADD COLUMN ai_cost_usd NUMERIC(10,4) DEFAULT 0;
  END IF;
END $$;

-- 5. Create ingestion_staging if it doesn't exist
CREATE TABLE IF NOT EXISTS public.ingestion_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  target_table TEXT NOT NULL,

  -- Data
  raw_data JSONB NOT NULL DEFAULT '{}',
  normalized_data JSONB,
  enriched_data JSONB,

  -- Pipeline stages
  ai_validation_status TEXT DEFAULT 'pending'
    CHECK (ai_validation_status IN ('pending', 'approved', 'rejected', 'needs_review')),
  ai_confidence_score NUMERIC(4,3),
  ai_validation_result JSONB,
  ai_validated_at TIMESTAMPTZ,

  dedup_status TEXT DEFAULT 'pending'
    CHECK (dedup_status IN ('pending', 'unique', 'duplicate', 'merge_candidate')),
  dedup_match_id UUID,
  dedup_match_table TEXT,
  dedup_match_score NUMERIC(4,3),
  dedup_details JSONB,

  enrichment_status TEXT DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'enriched', 'skipped', 'failed')),

  -- Disposition
  disposition TEXT DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'inserted', 'updated', 'skipped', 'rejected', 'error')),
  target_record_id UUID,
  review_status TEXT DEFAULT 'auto'
    CHECK (review_status IN ('auto', 'pending_review', 'approved', 'rejected')),

  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ingestion_staging_job ON public.ingestion_staging(job_id);
CREATE INDEX idx_ingestion_staging_ai_status ON public.ingestion_staging(ai_validation_status)
  WHERE ai_validation_status = 'pending';
CREATE INDEX idx_ingestion_staging_dedup ON public.ingestion_staging(dedup_status)
  WHERE dedup_status = 'pending';
CREATE INDEX idx_ingestion_staging_disposition ON public.ingestion_staging(disposition)
  WHERE disposition = 'pending';

ALTER TABLE public.ingestion_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_staging_admin_all"
  ON public.ingestion_staging FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- Enable realtime on scrape_runs for live status
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_runs;
