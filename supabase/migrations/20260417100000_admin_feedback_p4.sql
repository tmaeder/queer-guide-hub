-- Admin feedback overhaul — Phase 4 (analytics + API errors Sentry-like)
-- View powers the Analytics tab; trigger keeps api_error open when a resolved
-- row reappears; RPC returns SLA medians so the tab can hit one endpoint.

-- ── Daily volume view ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_feedback_analytics_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', submitted_at)::date AS day,
  content_type,
  feedback_status,
  data->>'category' AS category,
  priority,
  count(*)::int AS n
FROM community_submissions
WHERE submitted_at >= now() - interval '180 days'
  AND is_spam = false
GROUP BY 1, 2, 3, 4, 5;

-- ── SLA stats RPC ──────────────────────────────────────────────────
-- Returns median / p95 time-to-resolved per category × priority over the
-- last `days_window` days. Null durations excluded.
CREATE OR REPLACE FUNCTION feedback_sla_stats(p_days_window integer DEFAULT 90)
RETURNS TABLE (
  category text,
  priority smallint,
  resolved_n integer,
  median_seconds double precision,
  p95_seconds double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    coalesce(data->>'category', 'other')                               AS category,
    priority,
    count(*)::int                                                      AS resolved_n,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (resolved_at - submitted_at))) AS median_seconds,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (resolved_at - submitted_at))) AS p95_seconds
  FROM community_submissions
  WHERE content_type = 'feedback'
    AND is_spam = false
    AND resolved_at IS NOT NULL
    AND submitted_at >= now() - make_interval(days => p_days_window)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- ── Per-API-error daily occurrence view ────────────────────────────
-- Used for sparklines. Bucket by day, fill gaps client-side.
CREATE OR REPLACE VIEW v_api_error_daily
WITH (security_invoker = true)
AS
SELECT
  cs.id AS submission_id,
  cs.fingerprint,
  date_trunc('day', a.at)::date AS day,
  count(*)::int AS n
FROM community_submissions cs
JOIN community_submissions_audit a ON a.submission_id = cs.id
WHERE cs.content_type = 'api_error'
  AND a.at >= now() - interval '30 days'
GROUP BY 1, 2, 3;

-- ── Auto-reopen trigger ────────────────────────────────────────────
-- If `upsert_api_error` bumps a row that was marked done, flip it back to
-- 'new' so admins see the regression.
CREATE OR REPLACE FUNCTION tg_auto_reopen_api_error() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_type = 'api_error'
     AND OLD.content_type = 'api_error'
     AND NEW.occurrence_count > OLD.occurrence_count
     AND OLD.feedback_status = 'done' THEN
    NEW.feedback_status := 'new';
    NEW.resolved_at := NULL;
    NEW.resolution := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reopen_api_error ON community_submissions;
CREATE TRIGGER trg_auto_reopen_api_error
  BEFORE UPDATE ON community_submissions
  FOR EACH ROW EXECUTE FUNCTION tg_auto_reopen_api_error();

-- Allow authenticated admins/mods to read both analytics views. Views inherit
-- RLS from their base table (community_submissions), which already restricts
-- reads to admins/owners, so no extra policy needed. Grants do need explicit
-- setup though, matching other admin views.
GRANT SELECT ON v_feedback_analytics_daily TO authenticated;
GRANT SELECT ON v_api_error_daily TO authenticated;
