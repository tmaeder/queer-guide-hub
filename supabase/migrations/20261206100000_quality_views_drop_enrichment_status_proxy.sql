-- ============================================================================
-- pipeline_quality_distribution / pipeline_quality_daily: stop keying on
-- ingestion_staging.enrichment_status = 'completed'.
-- ----------------------------------------------------------------------------
-- Both views state their intent in their own header: "Only rows that actually
-- reached the quality-score stage are considered". `enriched_data ? 'quality_score'`
-- says exactly that and is written by pipeline-quality-score itself, so the
-- extra `enrichment_status = 'completed'` predicate was only ever a PROXY for
-- the same fact — and a lossy one, because `enrichment_status` is overloaded:
-- it is simultaneously the enrichment state machine (pending -> enriched/failed,
-- written by apply_enrichment) and, until now, a progress marker stamped by
-- pipeline-quality-score.
--
-- That overload is what stranded 2,616 news + 929 personality staging rows
-- (measured on prod 2026-09-02, all at disposition='pending' carrying
-- quality_score with no quality_status). pipeline-quality-score is NOT
-- run-scoped — unlike pipeline-validate / pipeline-deduplicate it applies no
-- pipeline_run_id filter — so it sweeps ingestion_staging globally, oldest
-- first, and routinely reached a row before the enrich stages did. Stamping
-- 'completed' there removed the row from pipeline-enrich-* (which selects
-- 'pending') AND from pipeline-quality-enhance (which selects 'enriched'),
-- and for a run-less row quality-enhance is the only path to
-- news_commit_staging_batch. The row became unreachable by every live
-- consumer, permanently, while still counting as merely "stale pending".
--
-- The companion edge-function change makes pipeline-quality-score advance
-- enrichment_status ONLY for rows it picked up on the 'enriched' arm. A row
-- scored while still 'pending' now stays 'pending' so an enrich stage can
-- still claim it — which means 'completed' is no longer a reliable marker of
-- "has been scored", and these two views must stop asking for it or they
-- would silently under-count exactly the rows the fix keeps alive.
--
-- Behaviour preserved: `enriched_data ? 'quality_score'` is unchanged and is
-- the precise predicate; no row that belonged in these views drops out.
-- Deliberately NOT touched: news_commit_staging_batch, which never required
-- 'completed' (verified against the live definition — it gates on
-- quality_status plus a 2-hour grace window for 'enriched' rows), so commit
-- behaviour is unaffected in either direction.
-- ============================================================================

-- WITH (security_invoker = true) is RESTATED, not decoration: both views carry
-- it today (verified live), and CREATE OR REPLACE VIEW resets reloptions, so
-- omitting it here would silently flip them to definer-rights.
CREATE OR REPLACE VIEW pipeline_quality_distribution
WITH (security_invoker = true) AS
SELECT
  entity_type,
  source_name,
  COUNT(*)::int                                    AS n,
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
WHERE enriched_data ? 'quality_score'
  AND created_at > now() - interval '30 days'
GROUP BY entity_type, source_name
ORDER BY entity_type, source_name;

COMMENT ON VIEW pipeline_quality_distribution IS
  'Rolling 30-day quality-score distribution per (entity_type, source_name). Read by /admin/pipelines to spot per-source regressions. Membership is enriched_data ? quality_score — NOT enrichment_status, which is an overloaded column and not a reliable "has been scored" marker.';

CREATE OR REPLACE VIEW pipeline_quality_daily
WITH (security_invoker = true) AS
SELECT
  DATE_TRUNC('day', created_at)::date   AS day,
  entity_type,
  source_name,
  COUNT(*)::int                         AS n,
  percentile_cont(0.50) WITHIN GROUP
    (ORDER BY (enriched_data->>'quality_score')::numeric) AS score_p50,
  AVG((enriched_data->>'quality_score')::numeric)          AS score_avg
FROM ingestion_staging
WHERE enriched_data ? 'quality_score'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

COMMENT ON VIEW pipeline_quality_daily IS
  '90-day daily median/mean quality scores per (entity_type, source_name). Chart-friendly. Membership is enriched_data ? quality_score — see pipeline_quality_distribution.';
