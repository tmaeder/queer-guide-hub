-- News Quality Enhancement Pipeline
-- Adds: originals snapshot table, per-article decision metadata,
-- backfill job queue, entity-link review queue, supporting indexes.

-- ---------------------------------------------------------------
-- 1. news_articles: per-article decision metadata
-- ---------------------------------------------------------------

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS quality_score          NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS quality_score_before   NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS relevance_score        NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS sentiment              TEXT,
  ADD COLUMN IF NOT EXISTS quality_decision       JSONB,
  ADD COLUMN IF NOT EXISTS quality_pipeline_version TEXT,
  ADD COLUMN IF NOT EXISTS last_quality_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_publish_blocked_reasons TEXT[],
  ADD COLUMN IF NOT EXISTS image_attribution      TEXT,
  ADD COLUMN IF NOT EXISTS quality_status         TEXT;

DO $$ BEGIN
  ALTER TABLE public.news_articles
    ADD CONSTRAINT news_articles_sentiment_check
    CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','mixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.news_articles
    ADD CONSTRAINT news_articles_quality_status_check
    CHECK (quality_status IS NULL OR quality_status IN ('pending','passed','review','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS news_articles_quality_run_idx
  ON public.news_articles (quality_pipeline_version, last_quality_run_at);

CREATE INDEX IF NOT EXISTS news_articles_quality_status_idx
  ON public.news_articles (quality_status)
  WHERE quality_status IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. news_articles_originals — reversible backfill snapshots
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.news_articles_originals (
  article_id        UUID PRIMARY KEY REFERENCES public.news_articles(id) ON DELETE CASCADE,
  original_title    TEXT,
  original_content  TEXT,
  original_excerpt  TEXT,
  original_image_url TEXT,
  original_tags     JSONB,
  original_status   TEXT,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pipeline_version  TEXT NOT NULL
);

ALTER TABLE public.news_articles_originals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin read originals" ON public.news_articles_originals
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'moderator'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- 3. quality_backfill_jobs — throttled archive reprocessing
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quality_backfill_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','skipped')),
  mode          TEXT NOT NULL DEFAULT 'backfill',
  dry_run       BOOLEAN NOT NULL DEFAULT TRUE,
  decision      JSONB,
  error         TEXT,
  attempts      INT NOT NULL DEFAULT 0,
  pipeline_version TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS quality_backfill_jobs_status_idx
  ON public.quality_backfill_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS quality_backfill_jobs_article_idx
  ON public.quality_backfill_jobs (article_id);

ALTER TABLE public.quality_backfill_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin manage backfill jobs" ON public.quality_backfill_jobs
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- 4. entity_link_review — ambiguous entity candidates
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.entity_link_review (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL
                  CHECK (entity_type IN
                    ('country','city','region','venue','event','personality','organisation')),
  candidate_id    UUID,
  candidate_name  TEXT NOT NULL,
  score           NUMERIC(3,2),
  context_snippet TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  resolved_by     UUID REFERENCES auth.users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_link_review_status_idx
  ON public.entity_link_review (status, created_at);

CREATE INDEX IF NOT EXISTS entity_link_review_article_idx
  ON public.entity_link_review (article_id);

ALTER TABLE public.entity_link_review ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin manage entity review" ON public.entity_link_review
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'moderator'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
             OR public.has_role(auth.uid(), 'moderator'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- 5. snapshot_news_article_original — capture-once helper
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_news_article_original(
  p_article_id UUID,
  p_pipeline_version TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  INSERT INTO public.news_articles_originals
    (article_id, original_title, original_content, original_excerpt,
     original_image_url, original_status, pipeline_version)
  SELECT a.id, a.title, a.content, NULL, a.image_url, a.moderation_status, p_pipeline_version
    FROM public.news_articles a
   WHERE a.id = p_article_id
  ON CONFLICT (article_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_news_article_original(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_news_article_original(UUID, TEXT) TO service_role;

COMMENT ON TABLE public.news_articles_originals IS
  'Pre-mutation snapshots for the news quality pipeline. Captured once per article via snapshot_news_article_original().';
COMMENT ON TABLE public.quality_backfill_jobs IS
  'Throttled queue for re-running the quality pipeline over existing news articles. dry_run=true writes decisions without mutating articles.';
COMMENT ON TABLE public.entity_link_review IS
  'Candidate entity links flagged as ambiguous by pipeline-quality-enhance. Admins approve/reject before linking is applied.';
