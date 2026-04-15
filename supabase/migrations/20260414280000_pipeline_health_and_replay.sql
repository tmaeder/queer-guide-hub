-- Pipeline health snapshot + dead-letter replay helpers.
-- Mirrors prod state 2026-04-14.

CREATE OR REPLACE VIEW public.pipeline_stuck_items AS
SELECT
  s.id,
  s.target_table,
  s.source_type,
  s.source_name,
  s.disposition,
  s.ai_validation_status,
  s.dedup_status,
  s.review_status,
  s.error_message,
  s.created_at,
  s.updated_at,
  extract(epoch FROM (now() - s.updated_at))::int AS stale_seconds,
  CASE
    WHEN s.disposition = 'pending' AND s.ai_validation_status = 'pending'
         AND s.normalized_data IS NULL
         AND now() - s.updated_at > interval '10 minutes' THEN 'stuck_at_normalize'
    WHEN s.normalized_data IS NOT NULL AND s.ai_validation_status = 'pending'
         AND now() - s.updated_at > interval '10 minutes' THEN 'stuck_at_validate'
    WHEN s.ai_validation_status = 'approved' AND s.dedup_status = 'pending'
         AND now() - s.updated_at > interval '10 minutes' THEN 'stuck_at_dedup'
    WHEN s.review_status = 'pending_review'
         AND now() - s.updated_at > interval '24 hours' THEN 'review_stale'
    WHEN s.disposition = 'pending' AND s.ai_validation_status = 'approved'
         AND s.dedup_status IN ('unique','duplicate','merge_candidate')
         AND s.review_status = 'approved'
         AND now() - s.updated_at > interval '10 minutes' THEN 'stuck_at_commit'
    WHEN s.disposition = 'rejected' AND s.error_message IS NOT NULL THEN 'rejected_with_error'
    ELSE 'other'
  END AS stuck_reason
FROM public.ingestion_staging s
WHERE s.disposition IN ('pending','approved','rejected')
  AND s.target_table IS NOT NULL;

GRANT SELECT ON public.pipeline_stuck_items TO authenticated;

-- Dead-letter replay: reset rejected items matching an error substring
CREATE OR REPLACE FUNCTION public.replay_rejected_staging(
  p_error_substring TEXT,
  p_target_table    TEXT DEFAULT NULL,
  p_limit           INT  DEFAULT 100
)
RETURNS TABLE(staging_id UUID, previous_error TEXT)
LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT x.id, x.error_message FROM public.ingestion_staging x
    WHERE x.disposition = 'rejected'
      AND x.error_message IS NOT NULL
      AND x.error_message ILIKE '%' || p_error_substring || '%'
      AND (p_target_table IS NULL OR x.target_table = p_target_table)
    ORDER BY x.updated_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ingestion_staging SET
      disposition   = 'pending',
      error_message = null,
      updated_at    = now()
    WHERE id = r.id;

    INSERT INTO public.ingestion_events (staging_id, stage, old_status, new_status, actor, payload)
    VALUES (r.id, 'replay', 'rejected', 'pending', 'replay_rejected_staging',
            jsonb_build_object('previous_error', r.error_message));

    staging_id := r.id; previous_error := r.error_message;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replay_rejected_staging(TEXT, TEXT, INT) TO authenticated, service_role;

-- Health snapshot RPC
CREATE OR REPLACE FUNCTION public.pipeline_health_snapshot()
RETURNS TABLE(
  target_table TEXT, total BIGINT, pending BIGINT, rejected BIGINT, review_pending BIGINT,
  stuck_normalize BIGINT, stuck_validate BIGINT, stuck_dedup BIGINT, stuck_commit BIGINT,
  review_stale BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    coalesce(s.target_table, 'unknown')::text,
    count(*)::bigint,
    count(*) FILTER (WHERE s.disposition   = 'pending')::bigint,
    count(*) FILTER (WHERE s.disposition   = 'rejected')::bigint,
    count(*) FILTER (WHERE s.review_status = 'pending_review')::bigint,
    count(*) FILTER (WHERE p.stuck_reason  = 'stuck_at_normalize')::bigint,
    count(*) FILTER (WHERE p.stuck_reason  = 'stuck_at_validate')::bigint,
    count(*) FILTER (WHERE p.stuck_reason  = 'stuck_at_dedup')::bigint,
    count(*) FILTER (WHERE p.stuck_reason  = 'stuck_at_commit')::bigint,
    count(*) FILTER (WHERE p.stuck_reason  = 'review_stale')::bigint
  FROM public.ingestion_staging s
  LEFT JOIN public.pipeline_stuck_items p ON p.id = s.id
  WHERE s.target_table IS NOT NULL
  GROUP BY 1
  ORDER BY count(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_health_snapshot() TO authenticated, service_role;

-- Per-source duplicate counts (referenced by VenueIngestStatsPanel)
CREATE OR REPLACE FUNCTION public.venue_duplicate_summary()
RETURNS TABLE(slug TEXT, duplicates BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT coalesce(data_source, 'unknown')::text, count(*)::bigint
  FROM public.venues
  WHERE duplicate_of_id IS NOT NULL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.venue_duplicate_summary() TO authenticated, service_role;
