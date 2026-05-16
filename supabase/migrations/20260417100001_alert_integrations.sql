-- Alert webhook integrations (Slack, Discord, generic)
CREATE TABLE IF NOT EXISTS alert_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('slack', 'discord', 'generic_webhook')),
  webhook_url text NOT NULL,
  min_severity text NOT NULL DEFAULT 'warn' CHECK (min_severity IN ('info', 'warn', 'error')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  last_error text,
  total_sent integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alert_integrations_enabled
  ON alert_integrations (enabled) WHERE enabled = true;

ALTER TABLE alert_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage integrations"
  ON alert_integrations FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin'));

-- Fan-out trigger on data_ops_alerts. Uses pg_net for non-blocking HTTP POST.
CREATE OR REPLACE FUNCTION notify_alert_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_integration alert_integrations;
  v_severity_order int;
  v_min_order int;
BEGIN
  v_severity_order := CASE NEW.severity WHEN 'info' THEN 1 WHEN 'warn' THEN 2 WHEN 'error' THEN 3 ELSE 0 END;

  FOR v_integration IN SELECT * FROM alert_integrations WHERE enabled = true LOOP
    v_min_order := CASE v_integration.min_severity WHEN 'info' THEN 1 WHEN 'warn' THEN 2 WHEN 'error' THEN 3 ELSE 0 END;
    IF v_severity_order < v_min_order THEN CONTINUE; END IF;

    BEGIN
      PERFORM net.http_post(
        url := v_integration.webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'text',
          format('[%s] %s (%s): %s',
            upper(NEW.severity),
            NEW.alert_kind,
            COALESCE(NEW.source_slug, '-'),
            NEW.detail::text
          )
        )
      );
      UPDATE alert_integrations
      SET last_triggered_at = now(), total_sent = total_sent + 1, last_error = NULL
      WHERE id = v_integration.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE alert_integrations SET last_error = SQLERRM WHERE id = v_integration.id;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_webhook_fanout ON data_ops_alerts;
CREATE TRIGGER alert_webhook_fanout
  AFTER INSERT ON data_ops_alerts
  FOR EACH ROW EXECUTE FUNCTION notify_alert_webhooks();
