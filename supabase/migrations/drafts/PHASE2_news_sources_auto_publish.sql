-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — news_sources.auto_publish toggle
-- Lets editors flag trusted feeds for auto-publish; untrusted feeds always
-- route through the review queue (pipeline-review-gate).
-- DRAFT — review and apply via Supabase CLI when ready.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.news_sources.auto_publish IS
  'When true, items from this source skip the review queue. New sources should default to false; flip to true only after a vetting period (suggested: 24h).';

-- Optional: track when the source was first created so the pipeline can force
-- review-mode for the first 24h regardless of auto_publish flag.
ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS auto_publish_since TIMESTAMPTZ;

COMMENT ON COLUMN public.news_sources.auto_publish_since IS
  'Timestamp when auto_publish was last set to true. Used by pipeline-review-gate to enforce a probation window after promotion.';

-- Helper: apply when a row toggles auto_publish on.
CREATE OR REPLACE FUNCTION public.news_sources_track_auto_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.auto_publish = true AND (OLD.auto_publish IS DISTINCT FROM true) THEN
    NEW.auto_publish_since := now();
  ELSIF NEW.auto_publish = false THEN
    NEW.auto_publish_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_sources_track_auto_publish ON public.news_sources;
CREATE TRIGGER news_sources_track_auto_publish
  BEFORE UPDATE OF auto_publish ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.news_sources_track_auto_publish();
