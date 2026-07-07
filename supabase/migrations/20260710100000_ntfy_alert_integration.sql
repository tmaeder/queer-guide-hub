-- Add ntfy (https://ntfy.sh) as a 4th alert_integrations kind, alongside
-- Slack/Discord/generic_webhook. ntfy's publish API expects a JSON body
-- posted to the SERVER ROOT (not the topic path) with a `topic` field —
-- pg_net's net.http_post always JSON-serializes its `body` param, so this
-- is the one shape that works without any raw-text-body support. The
-- `webhook_url` column keeps its existing meaning (paste the full topic
-- URL, e.g. https://ntfy.queer.guide/qg-ops or https://ntfy.sh/qg-ops) so
-- the admin UI stays identical across all four kinds; the trigger splits
-- origin from topic itself.

ALTER TABLE public.alert_integrations
  DROP CONSTRAINT IF EXISTS alert_integrations_kind_check;

ALTER TABLE public.alert_integrations
  ADD CONSTRAINT alert_integrations_kind_check
  CHECK (kind = ANY (ARRAY['slack'::text, 'discord'::text, 'generic_webhook'::text, 'ntfy'::text]));

ALTER TABLE public.alert_integrations
  ADD COLUMN IF NOT EXISTS auth_token text;

COMMENT ON COLUMN public.alert_integrations.auth_token IS
  'Optional bearer token for kind=ntfy, sent as Authorization: Bearer <token> when the topic is ACL-protected. Unused by slack/discord/generic_webhook.';

CREATE OR REPLACE FUNCTION public.notify_alert_webhooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_integration alert_integrations;
  v_severity_order int;
  v_min_order int;
  v_ntfy_origin text;
  v_ntfy_topic text;
  v_ntfy_priority int;
  v_ntfy_tags jsonb;
  v_headers jsonb;
BEGIN
  v_severity_order := CASE NEW.severity WHEN 'info' THEN 1 WHEN 'warn' THEN 2 WHEN 'error' THEN 3 ELSE 0 END;

  FOR v_integration IN SELECT * FROM alert_integrations WHERE enabled = true LOOP
    v_min_order := CASE v_integration.min_severity WHEN 'info' THEN 1 WHEN 'warn' THEN 2 WHEN 'error' THEN 3 ELSE 0 END;
    IF v_severity_order < v_min_order THEN CONTINUE; END IF;

    BEGIN
      IF v_integration.kind = 'ntfy' THEN
        -- Split "https://host[:port]/topic" into origin + topic.
        v_ntfy_origin := regexp_replace(v_integration.webhook_url, '^(https?://[^/]+).*$', '\1');
        v_ntfy_topic := regexp_replace(v_integration.webhook_url, '^https?://[^/]+/', '');

        v_ntfy_priority := CASE NEW.severity WHEN 'error' THEN 5 WHEN 'warn' THEN 4 ELSE 3 END;
        v_ntfy_tags := CASE NEW.severity
          WHEN 'error' THEN jsonb_build_array('rotating_light')
          WHEN 'warn' THEN jsonb_build_array('warning')
          ELSE jsonb_build_array('information_source')
        END;

        v_headers := '{"Content-Type": "application/json"}'::jsonb;
        IF v_integration.auth_token IS NOT NULL THEN
          v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_integration.auth_token);
        END IF;

        PERFORM net.http_post(
          url := v_ntfy_origin,
          headers := v_headers,
          body := jsonb_build_object(
            'topic', v_ntfy_topic,
            'title', format('[%s] %s', upper(NEW.severity), NEW.alert_kind),
            'message', format('(%s): %s', COALESCE(NEW.source_slug, '-'), NEW.detail::text),
            'priority', v_ntfy_priority,
            'tags', v_ntfy_tags
          )
        );
      ELSE
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
      END IF;

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
