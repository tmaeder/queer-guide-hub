-- Admin feedback overhaul — Phase 6 (SLA auto-escalation)
-- Stale tickets auto-bump in priority so admins can't overlook them.
-- Runs nightly. Only touches feedback rows that are:
--   * open (not 'done')
--   * not spam, not duplicate
--   * older than 14 days
--   * priority still above 0 (headroom to bump)
--   * haven't moved in >= 7 days (so active triage isn't interrupted)

CREATE OR REPLACE FUNCTION auto_escalate_stale_feedback() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH last_touched AS (
    SELECT submission_id, max(at) AS last_at
    FROM community_submissions_audit
    GROUP BY submission_id
  ),
  eligible AS (
    SELECT cs.id
    FROM community_submissions cs
    LEFT JOIN last_touched lt ON lt.submission_id = cs.id
    WHERE cs.content_type = 'feedback'
      AND cs.is_spam = false
      AND cs.duplicate_of IS NULL
      AND cs.feedback_status <> 'done'
      AND cs.priority > 0
      AND cs.submitted_at < now() - interval '14 days'
      AND coalesce(lt.last_at, cs.submitted_at) < now() - interval '7 days'
  )
  UPDATE community_submissions cs
  SET priority = greatest(0, priority - 1),
      reviewed_at = now()
  FROM eligible e
  WHERE cs.id = e.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Schedule nightly at 03:27 UTC (off-the-hour to avoid contention with the
-- scraper at 03:15 and the duplicate detector at 03:17).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-escalate-stale-feedback');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-escalate-stale-feedback',
  '27 3 * * *',
  $cron$SELECT public.auto_escalate_stale_feedback()$cron$
);
