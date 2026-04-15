-- Dedup precision view, coverage gaps view, alerts table + generator,
-- alert cron. Replays prod state applied via mcp on 2026-04-15.

CREATE OR REPLACE VIEW public.dedup_precision AS
SELECT
  rpc_match_type,
  count(*)::int                                                                AS decisions,
  count(*) FILTER (WHERE human_decision='confirmed_duplicate')::int            AS confirmed,
  count(*) FILTER (WHERE human_decision='not_duplicate')::int                  AS rejected,
  count(*) FILTER (WHERE human_decision='merge')::int                          AS merged,
  ROUND(
    count(*) FILTER (WHERE human_decision IN ('confirmed_duplicate','merge'))::numeric
    / NULLIF(count(*),0)
  , 3) AS precision,
  ROUND(avg(rpc_score)::numeric, 3)                                            AS avg_rpc_score,
  ROUND(avg(rpc_score) FILTER (WHERE human_decision='not_duplicate')::numeric, 3) AS avg_score_when_wrong,
  max(created_at)                                                              AS last_decision
FROM public.dedup_decisions_feedback
WHERE rpc_match_type IS NOT NULL
GROUP BY rpc_match_type
ORDER BY decisions DESC;
GRANT SELECT ON public.dedup_precision TO authenticated;
ALTER VIEW public.dedup_precision SET (security_invoker=true);

CREATE OR REPLACE VIEW public.coverage_gaps AS
SELECT
  t.source_slug, c.name AS city, t.accommodation_type,
  t.expected_count, t.actual_count, t.success_ratio, t.last_run_at,
  CASE
    WHEN t.last_run_at IS NULL                              THEN 'never_run'
    WHEN t.last_run_at < now() - interval '14 days'         THEN 'stale'
    WHEN coalesce(t.success_ratio, 0) < 0.4                 THEN 'under_target'
    WHEN coalesce(t.success_ratio, 0) < 0.7                 THEN 'partial'
    ELSE 'ok'
  END AS gap_kind
FROM public.source_coverage_targets t
LEFT JOIN public.cities c ON c.id = t.city_id
WHERE t.is_enabled
ORDER BY coalesce(t.success_ratio, 0) ASC, t.last_run_at NULLS FIRST;
GRANT SELECT ON public.coverage_gaps TO authenticated;
ALTER VIEW public.coverage_gaps SET (security_invoker=true);

CREATE TABLE IF NOT EXISTS public.data_ops_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_kind   TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error')),
  source_slug  TEXT,
  detail       JSONB NOT NULL,
  fingerprint  TEXT NOT NULL,
  acked_at     TIMESTAMPTZ,
  acked_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_alerts_open_fingerprint
  ON public.data_ops_alerts(fingerprint) WHERE acked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_open
  ON public.data_ops_alerts(severity, created_at DESC) WHERE acked_at IS NULL;
ALTER TABLE public.data_ops_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='data_ops_alerts' AND policyname='alerts_admin_all') THEN
    CREATE POLICY "alerts_admin_all" ON public.data_ops_alerts FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_data_ops_alerts()
RETURNS TABLE(alert_kind TEXT, fingerprint TEXT)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT source_slug, city, accommodation_type, expected_count, actual_count, success_ratio, gap_kind
    FROM public.coverage_gaps WHERE gap_kind IN ('under_target','never_run')
  LOOP
    INSERT INTO public.data_ops_alerts(alert_kind, severity, source_slug, detail, fingerprint)
    VALUES ('coverage_gap', 'warn', r.source_slug,
      jsonb_build_object('city', r.city, 'acc_type', r.accommodation_type,
        'expected', r.expected_count, 'actual', r.actual_count, 'ratio', r.success_ratio, 'kind', r.gap_kind),
      'cov:' || r.source_slug || ':' || coalesce(r.city,'-') || ':' || coalesce(r.accommodation_type,'-'))
    ON CONFLICT (fingerprint) WHERE acked_at IS NULL DO NOTHING;
    alert_kind := 'coverage_gap'; fingerprint := 'cov:' || r.source_slug; RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT rpc_match_type, decisions, precision FROM public.dedup_precision
    WHERE decisions >= 10 AND precision IS NOT NULL AND precision < 0.7
  LOOP
    INSERT INTO public.data_ops_alerts(alert_kind, severity, detail, fingerprint)
    VALUES ('dedup_precision_drift', 'error',
      jsonb_build_object('match_type', r.rpc_match_type, 'precision', r.precision, 'decisions', r.decisions),
      'dedup:' || r.rpc_match_type)
    ON CONFLICT (fingerprint) WHERE acked_at IS NULL DO NOTHING;
    alert_kind := 'dedup_precision_drift'; fingerprint := 'dedup:' || r.rpc_match_type; RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT source_slug, stage, status, items FROM public.dlq_summary
    WHERE (status='pending' AND items > 50) OR status='permanent_failed'
  LOOP
    INSERT INTO public.data_ops_alerts(alert_kind, severity, source_slug, detail, fingerprint)
    VALUES ('dlq_backlog',
      CASE WHEN r.status='permanent_failed' THEN 'error' ELSE 'warn' END,
      r.source_slug,
      jsonb_build_object('stage', r.stage, 'status', r.status, 'items', r.items),
      'dlq:' || coalesce(r.source_slug,'-') || ':' || r.stage || ':' || r.status)
    ON CONFLICT (fingerprint) WHERE acked_at IS NULL DO NOTHING;
    alert_kind := 'dlq_backlog'; fingerprint := 'dlq:' || coalesce(r.source_slug,'-'); RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_data_ops_alerts() TO service_role, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='data-ops-alerts';
  PERFORM cron.schedule('data-ops-alerts', '*/30 * * * *', $f$
    SELECT public.generate_data_ops_alerts();
  $f$);
END $$;
