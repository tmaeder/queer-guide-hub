-- Source-reliability rollup: aggregates per (source_slug, entity_type)
-- the signals already produced by other observability views/tables into a
-- single weight in [0,1]. Read by pipeline-review-gate to auto-downrank
-- items from unreliable sources (Step 3) and by the conflict-resolver
-- (Step 4) to weight cross-source field voting.
--
-- Sources of truth (already exist):
--   pipeline_quality_distribution  → quality_p50 per (entity_type, source_name)
--   pipeline_quality_daily         → quality_p50 trend (used in Step 2)
--   dedup_precision                → precision per match_type (cross-source)
--   coverage_gaps                  → success_ratio per (source_slug, city, ...)
--   ingestion_events               → rejection / block stats per source
--
-- We collapse these into one row per (source_slug, entity_type) with a
-- composite weight. Sample-size aware: weight is NULL when n < 50.

CREATE TABLE IF NOT EXISTS public.source_reliability (
  source_slug      TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  weight           NUMERIC(4,3),  -- 0..1, NULL when sample too small
  quality_p50      NUMERIC(5,2),
  quality_p25      NUMERIC(5,2),
  coverage_ratio   NUMERIC(4,3),  -- 0..1, from coverage_gaps
  rejection_rate   NUMERIC(4,3),  -- 0..1, share of staging rows rejected
  block_rate       NUMERIC(4,3),  -- 0..1, share of fetches blocked/HTTP-error
  sample_size      INT NOT NULL DEFAULT 0,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_slug, entity_type)
);

COMMENT ON TABLE public.source_reliability IS
  'Per-source reliability rollup. Refreshed hourly by refresh_source_reliability(). weight in [0,1] feeds review-gate downranking and conflict-resolver voting.';

CREATE INDEX IF NOT EXISTS idx_source_reliability_weight
  ON public.source_reliability (weight)
  WHERE weight IS NOT NULL;

ALTER TABLE public.source_reliability ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_reliability' AND policyname='source_reliability_admin_all') THEN
    CREATE POLICY "source_reliability_admin_all" ON public.source_reliability FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_reliability' AND policyname='source_reliability_service_read') THEN
    CREATE POLICY "source_reliability_service_read" ON public.source_reliability FOR SELECT TO service_role USING (true);
  END IF;
END $$;

GRANT SELECT ON public.source_reliability TO authenticated, service_role;

-- ─── Refresh function ──────────────────────────────────────────────
-- Reads quality_distribution + coverage_gaps + ingestion_events,
-- computes a composite weight, upserts.
--
-- Composite weight (when sample >= 50):
--   weight = 0.50 * (quality_p50 / 100)
--          + 0.25 * coverage_ratio
--          + 0.25 * (1 - rejection_rate)
--   penalty = max(0, block_rate - 0.20) * 0.50  -- block_rate above 20% bites
--   weight = greatest(0.05, weight - penalty)
--
-- Below sample threshold weight is NULL — callers must fall back to neutral.
CREATE OR REPLACE FUNCTION public.refresh_source_reliability()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INT := 0;
BEGIN
  WITH quality AS (
    SELECT
      source_name AS source_slug,
      entity_type,
      n,
      score_p50,
      score_p25
    FROM public.pipeline_quality_distribution
  ),
  coverage AS (
    SELECT
      source_slug,
      AVG(coalesce(success_ratio, 0))::numeric AS coverage_ratio
    FROM public.coverage_gaps
    GROUP BY source_slug
  ),
  events AS (
    -- ingestion_events has staging_id but no source_name/entity_type;
    -- join staging to attribute. rejection = validate->rejected,
    -- block = source-stage errors.
    SELECT
      s.source_name AS source_slug,
      s.entity_type,
      COUNT(*) FILTER (WHERE e.stage='validate' AND e.new_status='rejected')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE e.stage='validate'), 0) AS rejection_rate,
      COUNT(*) FILTER (WHERE e.stage='source' AND e.new_status='failed')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE e.stage='source'), 0) AS block_rate
    FROM public.ingestion_events e
    JOIN public.ingestion_staging s ON s.id = e.staging_id
    WHERE e.created_at > now() - interval '30 days'
      AND s.source_name IS NOT NULL
      AND s.entity_type IS NOT NULL
    GROUP BY s.source_name, s.entity_type
  ),
  rolled AS (
    SELECT
      q.source_slug,
      q.entity_type,
      q.n AS sample_size,
      q.score_p50 AS quality_p50,
      q.score_p25 AS quality_p25,
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
  SELECT
    source_slug,
    entity_type,
    CASE WHEN sample_size < 50 THEN NULL
         ELSE GREATEST(0.05,
                0.50 * coalesce(quality_p50, 0)/100.0
              + 0.25 * coverage_ratio
              + 0.25 * (1 - rejection_rate)
              - GREATEST(0, block_rate - 0.20) * 0.50
         )::numeric(4,3)
    END AS weight,
    quality_p50, quality_p25, coverage_ratio::numeric(4,3),
    rejection_rate::numeric(4,3), block_rate::numeric(4,3),
    sample_size, now()
  FROM rolled
  ON CONFLICT (source_slug, entity_type) DO UPDATE SET
    weight         = EXCLUDED.weight,
    quality_p50    = EXCLUDED.quality_p50,
    quality_p25    = EXCLUDED.quality_p25,
    coverage_ratio = EXCLUDED.coverage_ratio,
    rejection_rate = EXCLUDED.rejection_rate,
    block_rate     = EXCLUDED.block_rate,
    sample_size    = EXCLUDED.sample_size,
    computed_at    = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_source_reliability() TO service_role, authenticated;

-- ─── Convenience view ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.source_reliability_current AS
SELECT
  source_slug,
  entity_type,
  weight,
  quality_p50,
  coverage_ratio,
  rejection_rate,
  block_rate,
  sample_size,
  computed_at,
  CASE
    WHEN weight IS NULL              THEN 'insufficient_data'
    WHEN weight >= 0.75              THEN 'reliable'
    WHEN weight >= 0.50              THEN 'acceptable'
    WHEN weight >= 0.25              THEN 'degraded'
    ELSE                                  'unreliable'
  END AS tier
FROM public.source_reliability
ORDER BY weight NULLS LAST DESC, source_slug, entity_type;

GRANT SELECT ON public.source_reliability_current TO authenticated, service_role;
ALTER VIEW public.source_reliability_current SET (security_invoker=true);

-- ─── Cron: hourly refresh ──────────────────────────────────────────
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='refresh-source-reliability';
  PERFORM cron.schedule('refresh-source-reliability', '17 * * * *', $f$
    SELECT public.refresh_source_reliability();
  $f$);
END $$;

-- Initial seed run so the table is non-empty after migration.
SELECT public.refresh_source_reliability();
