-- ============================================================================
-- refresh_source_reliability(): skip the unattributed quality-distribution row.
--
-- The hourly cron has failed 24×/day with
--   null value in column "source_slug" of relation "source_reliability"
--   violates not-null constraint
--
-- public.pipeline_quality_distribution currently yields 76 rows, exactly ONE
-- of which has source_name IS NULL AND entity_type IS NULL (staging rows that
-- were never attributed to a source). That single row is enough to abort the
-- whole INSERT, so source_reliability has been going stale for every source.
--
-- The `events` CTE below already guards `s.source_name IS NOT NULL AND
-- s.entity_type IS NOT NULL`; the `quality` CTE — which is what actually
-- feeds the INSERT's source_slug/entity_type — was simply missing the same
-- guard. A reliability score for an unknown source is meaningless, so
-- dropping the row is the correct behaviour rather than synthesising a
-- placeholder slug. Body is otherwise byte-identical to the live definition.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_source_reliability()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows INT := 0;
BEGIN
  WITH quality AS (
    SELECT source_name AS source_slug, entity_type, n, score_p50, score_p25
    FROM public.pipeline_quality_distribution
    -- Unattributed staging rows cannot produce a source reliability score.
    WHERE source_name IS NOT NULL AND entity_type IS NOT NULL
  ),
  coverage AS (
    SELECT source_slug, AVG(coalesce(success_ratio, 0))::numeric AS coverage_ratio
    FROM public.coverage_gaps GROUP BY source_slug
  ),
  events AS (
    SELECT
      s.source_name AS source_slug, s.entity_type,
      COUNT(*) FILTER (WHERE e.stage='validate' AND e.new_status='rejected')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE e.stage='validate'), 0) AS rejection_rate,
      COUNT(*) FILTER (WHERE e.stage='source' AND e.new_status='failed')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE e.stage='source'), 0) AS block_rate
    FROM public.ingestion_events e
    JOIN public.ingestion_staging s ON s.id = e.staging_id
    WHERE e.created_at > now() - interval '30 days'
      AND s.source_name IS NOT NULL AND s.entity_type IS NOT NULL
    GROUP BY s.source_name, s.entity_type
  ),
  rolled AS (
    SELECT q.source_slug, q.entity_type, q.n AS sample_size,
           q.score_p50 AS quality_p50, q.score_p25 AS quality_p25,
           coalesce(c.coverage_ratio, 0.5) AS coverage_ratio,
           coalesce(e.rejection_rate, 0)   AS rejection_rate,
           coalesce(e.block_rate, 0)       AS block_rate
    FROM quality q
    LEFT JOIN coverage c ON c.source_slug = q.source_slug
    LEFT JOIN events   e ON e.source_slug = q.source_slug AND e.entity_type = q.entity_type
  )
  INSERT INTO public.source_reliability AS sr (
    source_slug, entity_type, weight,
    quality_p50, quality_p25, coverage_ratio, rejection_rate, block_rate,
    sample_size, computed_at
  )
  SELECT source_slug, entity_type,
    CASE WHEN sample_size < 50 THEN NULL
         ELSE GREATEST(0.05,
                0.50 * coalesce(quality_p50, 0)/100.0
              + 0.25 * coverage_ratio
              + 0.25 * (1 - rejection_rate)
              - GREATEST(0, block_rate - 0.20) * 0.50
         )::numeric(4,3)
    END,
    quality_p50, quality_p25, coverage_ratio::numeric(4,3),
    rejection_rate::numeric(4,3), block_rate::numeric(4,3),
    sample_size, now()
  FROM rolled
  ON CONFLICT (source_slug, entity_type) DO UPDATE SET
    weight=EXCLUDED.weight, quality_p50=EXCLUDED.quality_p50, quality_p25=EXCLUDED.quality_p25,
    coverage_ratio=EXCLUDED.coverage_ratio, rejection_rate=EXCLUDED.rejection_rate,
    block_rate=EXCLUDED.block_rate, sample_size=EXCLUDED.sample_size, computed_at=EXCLUDED.computed_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;
