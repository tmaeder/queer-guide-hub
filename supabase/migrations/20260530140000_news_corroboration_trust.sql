-- P2 — Trust: cross-source corroboration + integrity flags.
--
-- A news_story (existing clustering, cron */10) already groups articles about
-- the SAME event — including rewrites of one wire story across outlets. So the
-- number of DISTINCT independent sources in a story is exactly "how many
-- independent outlets corroborate this event". We surface that as a first-class
-- trust signal and flag single-source (uncorroborated) claims.
--
-- corroboration_count = THE trust number (# independent sources; <=1 = unverified).
-- integrity_flags     = qualitative concerns (satire / advertorial / sentiment_conflict).
--
-- Reuses live infra: news_stories, news_story_articles, news_articles.sentiment,
-- quality_decision.isSatire/isAdvertorial. No new embedding pipeline.
-- Roadmap: "News Data Quality — Closed-Loop Intelligence" (Pillar 2).

-- ───────────────────────────── 1. Columns ─────────────────────────────
ALTER TABLE public.news_stories
  ADD COLUMN IF NOT EXISTS corroboration_count      INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS corroborating_source_ids UUID[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS integrity_flags          TEXT[]  NOT NULL DEFAULT '{}';

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS corroboration_count INT    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS integrity_flags     TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.news_articles.corroboration_count IS
  '# of independent sources reporting this event (via its news_story). 1 = uncorroborated / single-source.';
COMMENT ON COLUMN public.news_articles.integrity_flags IS
  'Qualitative trust concerns: satire | advertorial | sentiment_conflict.';

CREATE INDEX IF NOT EXISTS idx_news_articles_corroboration ON public.news_articles (corroboration_count);
CREATE INDEX IF NOT EXISTS idx_news_stories_corroboration  ON public.news_stories  (corroboration_count);

-- ───────────────────────── 2. Refresh function ─────────────────────────
-- Recomputes corroboration + integrity for stories touched within p_window,
-- then propagates to their member articles. Idempotent.
CREATE OR REPLACE FUNCTION public.refresh_news_corroboration(
  p_window INTERVAL DEFAULT INTERVAL '21 days'
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_articles INT := 0;
BEGIN
  WITH stats AS (
    SELECT
      s.id AS story_id,
      count(DISTINCT a.source_id) AS src_count,
      array_agg(DISTINCT a.source_id) FILTER (WHERE a.source_id IS NOT NULL) AS src_ids,
      bool_or((a.quality_decision->>'isSatire')::boolean)      AS any_satire,
      bool_or((a.quality_decision->>'isAdvertorial')::boolean) AS any_advertorial,
      (bool_or(a.sentiment = 'positive') AND bool_or(a.sentiment = 'negative')) AS sentiment_conflict
    FROM public.news_stories s
    JOIN public.news_story_articles nsa ON nsa.story_id = s.id
    JOIN public.news_articles a         ON a.id = nsa.article_id
    WHERE s.last_updated_at > now() - p_window
    GROUP BY s.id
  ),
  flags AS (
    SELECT
      story_id,
      GREATEST(1, src_count) AS corroboration_count,
      coalesce(src_ids, '{}'::uuid[]) AS src_ids,
      (ARRAY[]::text[]
        || CASE WHEN any_satire         THEN ARRAY['satire']             ELSE ARRAY[]::text[] END
        || CASE WHEN any_advertorial    THEN ARRAY['advertorial']        ELSE ARRAY[]::text[] END
        || CASE WHEN sentiment_conflict THEN ARRAY['sentiment_conflict'] ELSE ARRAY[]::text[] END
      ) AS flags
    FROM stats
  ),
  upd_stories AS (
    UPDATE public.news_stories s
       SET corroboration_count      = f.corroboration_count,
           corroborating_source_ids = f.src_ids,
           integrity_flags          = f.flags
      FROM flags f
     WHERE s.id = f.story_id
       AND ROW(s.corroboration_count, s.corroborating_source_ids, s.integrity_flags)
           IS DISTINCT FROM ROW(f.corroboration_count, f.src_ids, f.flags)
    RETURNING s.id
  ),
  per_article AS (
    -- An article in multiple stories takes the max corroboration.
    SELECT
      nsa.article_id,
      max(f.corroboration_count) AS corroboration_count,
      bool_or('sentiment_conflict' = ANY(f.flags)) AS conflict
    FROM flags f
    JOIN public.news_story_articles nsa ON nsa.story_id = f.story_id
    GROUP BY nsa.article_id
  ),
  article_target AS (
    SELECT
      pa.article_id,
      pa.corroboration_count,
      (ARRAY[]::text[]
        || CASE WHEN (a.quality_decision->>'isSatire')::boolean      THEN ARRAY['satire']             ELSE ARRAY[]::text[] END
        || CASE WHEN (a.quality_decision->>'isAdvertorial')::boolean THEN ARRAY['advertorial']        ELSE ARRAY[]::text[] END
        || CASE WHEN pa.conflict                                     THEN ARRAY['sentiment_conflict'] ELSE ARRAY[]::text[] END
      ) AS flags
    FROM per_article pa
    JOIN public.news_articles a ON a.id = pa.article_id
  ),
  upd_articles AS (
    UPDATE public.news_articles a
       SET corroboration_count = t.corroboration_count,
           integrity_flags     = t.flags
      FROM article_target t
     WHERE a.id = t.article_id
       AND ROW(a.corroboration_count, a.integrity_flags)
           IS DISTINCT FROM ROW(t.corroboration_count, t.flags)
    RETURNING a.id
  )
  SELECT count(*) INTO v_articles FROM upd_articles;

  RETURN v_articles;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_news_corroboration(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_news_corroboration(INTERVAL) TO service_role;

-- ─────────────── 3. Convenience view: corroborated multi-source stories ───────────────
CREATE OR REPLACE VIEW public.news_corroborated_stories AS
SELECT id, slug, title, article_count, corroboration_count, corroborating_source_ids,
       integrity_flags, top_tags, country_ids, last_updated_at
FROM public.news_stories
WHERE corroboration_count >= 2
ORDER BY corroboration_count DESC, last_updated_at DESC;

ALTER VIEW public.news_corroborated_stories SET (security_invoker = true);
GRANT SELECT ON public.news_corroborated_stories TO authenticated, service_role;

-- ───────────────────────── 4. Cron: hourly at :35 ─────────────────────────
-- Runs after the */10 clustering has settled the latest stories.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-news-corroboration';
  PERFORM cron.schedule('refresh-news-corroboration', '35 * * * *', $f$
    SELECT public.refresh_news_corroboration();
  $f$);
END $$;

-- ───────────────────────── 5. One-time backfill (all history) ─────────────────────────
SELECT public.refresh_news_corroboration(INTERVAL '3650 days');
