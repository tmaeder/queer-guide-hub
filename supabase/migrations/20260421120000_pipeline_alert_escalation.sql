-- Pipeline Alert Escalation
-- When a pipeline_health_alert stays open for 24h, escalate to community_submissions
-- so it becomes visible in /admin/feedback and eligible for GitHub sync.
-- Runs hourly via pg_cron.

ALTER TABLE public.pipeline_health_alerts
  ADD COLUMN IF NOT EXISTS escalated_submission_id UUID
    REFERENCES public.community_submissions(id) ON DELETE SET NULL;

-- Partial unique index on fingerprint for pipeline_failure rows. Required by
-- ON CONFLICT below. Existing idx_community_submissions_fingerprint is filtered
-- to content_type='api_error' and does not cover us.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_submissions_pipeline_failure_fp
  ON public.community_submissions (fingerprint)
  WHERE content_type = 'pipeline_failure' AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_health_alerts_unescalated
  ON public.pipeline_health_alerts(first_seen_at)
  WHERE resolved_at IS NULL AND escalated_submission_id IS NULL;

CREATE OR REPLACE FUNCTION public.escalate_pipeline_alerts_to_feedback()
RETURNS TABLE(escalated INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
  v_alert RECORD;
  v_fingerprint TEXT;
  v_submission_id UUID;
BEGIN
  FOR v_alert IN
    SELECT id, kind, subject, detail, first_seen_at, last_seen_at
    FROM public.pipeline_health_alerts
    WHERE resolved_at IS NULL
      AND escalated_submission_id IS NULL
      AND first_seen_at < now() - INTERVAL '24 hours'
  LOOP
    v_fingerprint := encode(
      extensions.digest('pipeline:' || v_alert.kind || ':' || v_alert.subject, 'sha256'),
      'hex'
    );

    -- Upsert on fingerprint: if a prior pipeline_failure ticket for same
    -- subject exists, bump occurrence_count instead of creating a duplicate.
    INSERT INTO public.community_submissions (
      content_type,
      data,
      fingerprint,
      occurrence_count,
      last_seen_at,
      feedback_status
    ) VALUES (
      'pipeline_failure',
      jsonb_build_object(
        'title', 'Pipeline down: ' || v_alert.subject,
        'description',
          'Pipeline health alert "' || v_alert.kind || '" for "' || v_alert.subject ||
          '" has been open since ' || to_char(v_alert.first_seen_at, 'YYYY-MM-DD HH24:MI') || ' UTC.',
        'category', 'bug',
        'source', 'pipeline_health',
        'alert_kind', v_alert.kind,
        'alert_subject', v_alert.subject,
        'alert_detail', v_alert.detail,
        'alert_first_seen_at', v_alert.first_seen_at,
        'pipeline_health_alert_id', v_alert.id
      ),
      v_fingerprint,
      1,
      now(),
      'new'
    )
    ON CONFLICT (fingerprint) WHERE content_type = 'pipeline_failure' AND fingerprint IS NOT NULL
    DO UPDATE
      SET occurrence_count = public.community_submissions.occurrence_count + 1,
          last_seen_at = now(),
          data = EXCLUDED.data
    RETURNING id INTO v_submission_id;

    UPDATE public.pipeline_health_alerts
      SET escalated_submission_id = v_submission_id
      WHERE id = v_alert.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_pipeline_alerts_to_feedback() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_pipeline_alerts_to_feedback() TO service_role;

-- Hourly escalation cron
DO $$
BEGIN
  PERFORM cron.unschedule('escalate-pipeline-alerts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-pipeline-alerts');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'escalate-pipeline-alerts',
  '17 * * * *',
  $cron$SELECT public.escalate_pipeline_alerts_to_feedback();$cron$
);

-- Auto-resolve the feedback ticket when the underlying alert is resolved.
CREATE OR REPLACE FUNCTION public.tg_close_feedback_on_alert_resolve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.resolved_at IS NOT NULL
     AND OLD.resolved_at IS NULL
     AND NEW.escalated_submission_id IS NOT NULL THEN
    UPDATE public.community_submissions
      SET feedback_status = 'resolved',
          data = data || jsonb_build_object(
            'auto_resolved_at', now(),
            'resolution_note', 'Pipeline health alert auto-resolved'
          )
      WHERE id = NEW.escalated_submission_id
        AND feedback_status <> 'resolved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_feedback_on_alert_resolve
  ON public.pipeline_health_alerts;

CREATE TRIGGER trg_close_feedback_on_alert_resolve
  AFTER UPDATE OF resolved_at ON public.pipeline_health_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_close_feedback_on_alert_resolve();

COMMENT ON FUNCTION public.escalate_pipeline_alerts_to_feedback() IS
  'Escalates pipeline_health_alerts open > 24h into community_submissions (category=bug, content_type=pipeline_failure). Runs hourly via pg_cron. Auto-closes the feedback ticket when the alert is resolved.';
