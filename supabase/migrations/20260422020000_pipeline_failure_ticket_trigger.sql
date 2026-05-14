-- Trigger: when a pipeline_run transitions to 'failed':
-- 1. Insert row to pipeline_errors
-- 2. Upsert open alert in pipeline_health_alerts (tracks consecutive failures)
-- 3. If alert open >24h AND >=3 failures: escalate to community_submissions

CREATE OR REPLACE FUNCTION fn_pipeline_run_failure_handler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pipeline_name text;
  v_error_msg     text;
  v_consecutive   int;
  v_alert_id      uuid;
  v_first_seen    timestamptz;
  v_sub_id        uuid;
BEGIN
  -- Only fire on transition to 'failed'
  IF NEW.status <> 'failed' OR OLD.status = 'failed' THEN
    RETURN NEW;
  END IF;

  v_pipeline_name := NEW.pipeline_name;
  v_error_msg     := COALESCE(NEW.error_message, 'Pipeline failed');

  -- 1. Record error
  INSERT INTO pipeline_errors (function_name, severity, message, context, pipeline_run_id)
  VALUES (
    v_pipeline_name, 'error', v_error_msg,
    jsonb_build_object('pipeline_id', NEW.pipeline_id, 'run_id', NEW.id, 'items_failed', NEW.items_failed),
    NEW.id
  );

  -- 2. Count consecutive failures in last 24h
  SELECT count(*) INTO v_consecutive
  FROM pipeline_runs
  WHERE pipeline_name = v_pipeline_name
    AND status = 'failed'
    AND created_at > now() - interval '24 hours';

  -- 3. Upsert open alert
  INSERT INTO pipeline_health_alerts (kind, subject, detail, first_seen_at, last_seen_at)
  VALUES (
    'consecutive_failures', v_pipeline_name,
    jsonb_build_object('consecutive_failures', v_consecutive, 'last_error', v_error_msg, 'run_id', NEW.id),
    now(), now()
  )
  ON CONFLICT (kind, subject) WHERE resolved_at IS NULL
  DO UPDATE SET
    last_seen_at = now(),
    detail = pipeline_health_alerts.detail || jsonb_build_object(
      'consecutive_failures', v_consecutive,
      'last_error', v_error_msg,
      'run_id', NEW.id
    );

  -- 4. Escalate to community_submissions if alert open >24h and >=3 failures
  SELECT id, first_seen_at INTO v_alert_id, v_first_seen
  FROM pipeline_health_alerts
  WHERE kind = 'consecutive_failures' AND subject = v_pipeline_name AND resolved_at IS NULL;

  IF v_consecutive >= 3
     AND v_first_seen < now() - interval '24 hours'
     AND v_alert_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM community_submissions
       WHERE content_type = 'pipeline_failure'
         AND (data->>'pipeline_name') = v_pipeline_name
         AND feedback_status <> 'done'
     )
  THEN
    INSERT INTO community_submissions (content_type, status, feedback_status, data)
    VALUES (
      'pipeline_failure', 'pending', 'new',
      jsonb_build_object(
        'category',       'bug',
        'title',          'Pipeline ' || v_pipeline_name || ' failing',
        'body',           'Pipeline has failed ' || v_consecutive || '+ times in 24h. Last error: ' || v_error_msg,
        'source',         'pipeline-monitor',
        'pipeline_name',  v_pipeline_name,
        'alert_id',       v_alert_id,
        'auto_github_sync', true
      )
    )
    RETURNING id INTO v_sub_id;

    UPDATE pipeline_health_alerts
    SET escalated_submission_id = v_sub_id
    WHERE id = v_alert_id AND escalated_submission_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pipeline_run_failure ON pipeline_runs;
CREATE TRIGGER tg_pipeline_run_failure
  AFTER UPDATE ON pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION fn_pipeline_run_failure_handler();

-- Auto-resolve open pipeline_health_alerts when the same pipeline succeeds
CREATE OR REPLACE FUNCTION fn_pipeline_run_success_handler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE pipeline_health_alerts
  SET resolved_at = now()
  WHERE kind = 'pipeline_failure'
    AND subject = NEW.pipeline_name
    AND resolved_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pipeline_run_success ON pipeline_runs;
CREATE TRIGGER tg_pipeline_run_success
  AFTER UPDATE ON pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION fn_pipeline_run_success_handler();
