-- Per-source quality health view for the admin Quality Review tab.
-- Lets admins spot which RSS feeds are producing the most rejected /
-- review-flagged content so they can disable bad sources.

CREATE OR REPLACE VIEW public.news_quality_source_health AS
SELECT
  v.id          AS source_id,
  v.name        AS source_name,
  count(a.*)    AS total,
  count(*) FILTER (WHERE a.quality_status = 'passed')   AS passed,
  count(*) FILTER (WHERE a.quality_status = 'review')   AS review,
  count(*) FILTER (WHERE a.quality_status = 'rejected') AS rejected,
  count(*) FILTER (WHERE a.quality_status IS NULL)      AS legacy,
  avg(a.quality_score)   FILTER (WHERE a.quality_score IS NOT NULL)   AS avg_quality,
  avg(a.relevance_score) FILTER (WHERE a.relevance_score IS NOT NULL) AS avg_relevance,
  -- Reject rate = rejected / (passed + review + rejected) — excludes legacy.
  CASE WHEN count(*) FILTER (WHERE a.quality_status IS NOT NULL) > 0
    THEN count(*) FILTER (WHERE a.quality_status = 'rejected')::numeric
       / count(*) FILTER (WHERE a.quality_status IS NOT NULL)::numeric
    ELSE NULL END AS reject_rate,
  max(a.last_quality_run_at) AS last_run_at
FROM public.venues v
JOIN public.news_articles a ON a.source_id = v.id
GROUP BY v.id, v.name
HAVING count(*) > 0;

GRANT SELECT ON public.news_quality_source_health TO authenticated;

COMMENT ON VIEW public.news_quality_source_health IS
  'Per-source quality breakdown for /admin/review?tab=news-quality. Sources with high reject_rate are candidates for disabling via admin.';
