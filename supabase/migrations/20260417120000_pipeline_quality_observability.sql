-- Pipeline quality-score distribution per (entity_type, source_name).
-- Reveals regressions early — e.g. if `source-awin` starts emitting entries
-- that score consistently < 40, we see the p50 drop on the dashboard before
-- the review queue clogs up.
--
-- Source: ingestion_staging.enriched_data->>'quality_score' written by
-- pipeline-quality-score. Only rows that actually reached the quality-score
-- stage are considered (enrichment_status = 'completed').

CREATE OR REPLACE VIEW pipeline_quality_distribution AS
SELECT
  entity_type,
  source_name,
  COUNT(*)::int                         AS n,
  MIN((enriched_data->>'quality_score')::numeric)  AS score_min,
  percentile_cont(0.25) WITHIN GROUP
    (ORDER BY (enriched_data->>'quality_score')::numeric) AS score_p25,
  percentile_cont(0.50) WITHIN GROUP
    (ORDER BY (enriched_data->>'quality_score')::numeric) AS score_p50,
  percentile_cont(0.75) WITHIN GROUP
    (ORDER BY (enriched_data->>'quality_score')::numeric) AS score_p75,
  MAX((enriched_data->>'quality_score')::numeric)  AS score_max,
  AVG((enriched_data->>'quality_score')::numeric)  AS score_avg
FROM ingestion_staging
WHERE enrichment_status = 'completed'
  AND enriched_data ? 'quality_score'
  AND created_at > now() - interval '30 days'
GROUP BY entity_type, source_name
ORDER BY entity_type, source_name;

COMMENT ON VIEW pipeline_quality_distribution IS
  'Rolling 30-day quality-score distribution per (entity_type, source_name). Read by /admin/pipelines to spot per-source regressions.';

-- Trend view: daily buckets so we can plot "score degradation over time"
-- per source.
CREATE OR REPLACE VIEW pipeline_quality_daily AS
SELECT
  DATE_TRUNC('day', created_at)::date   AS day,
  entity_type,
  source_name,
  COUNT(*)::int                         AS n,
  percentile_cont(0.50) WITHIN GROUP
    (ORDER BY (enriched_data->>'quality_score')::numeric) AS score_p50,
  AVG((enriched_data->>'quality_score')::numeric)          AS score_avg
FROM ingestion_staging
WHERE enrichment_status = 'completed'
  AND enriched_data ? 'quality_score'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

COMMENT ON VIEW pipeline_quality_daily IS
  '90-day daily median/mean quality scores per (entity_type, source_name). Chart-friendly.';
