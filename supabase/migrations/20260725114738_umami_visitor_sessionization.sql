-- Umami analytics: honest sessionization + real geography.
--
-- Before this migration umami.get_or_create_session matched sessions on
-- (website_id, hostname, last 30 min) only, so EVERY concurrent visitor on
-- queer.guide collapsed into a single session row (~93 events per "session"),
-- making session counts, bounce rate, durations and all per-session
-- breakdowns meaningless. Country also defaulted to 'US' because the tracker
-- never sent one, so geography read 100% US.
--
-- Fix: a privacy-safe daily-rotating visitor hash (sha256(date|ip|ua),
-- computed in the umami-analytics edge function — cookieless, Umami-style)
-- is stored as session.distinct_id and used as the sessionization key.
-- Country now flows from Cloudflare's edge geo via /api/track and defaults
-- to NULL (honest absence) instead of 'US'.

ALTER TABLE umami.session ADD COLUMN IF NOT EXISTS distinct_id text;

CREATE INDEX IF NOT EXISTS session_website_distinct_created_idx
  ON umami.session (website_id, distinct_id, created_at DESC);

-- Signature changes (new param) — drop the old function first.
DROP FUNCTION IF EXISTS umami.get_or_create_session(
  uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, bpchar);

CREATE OR REPLACE FUNCTION umami.get_or_create_session(
  p_website_id uuid,
  p_hostname character varying,
  p_browser character varying DEFAULT NULL,
  p_os character varying DEFAULT NULL,
  p_device character varying DEFAULT NULL,
  p_screen character varying DEFAULT NULL,
  p_language character varying DEFAULT NULL,
  p_country bpchar DEFAULT NULL,
  p_distinct_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'umami'
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  IF p_distinct_id IS NOT NULL THEN
    -- Per-visitor sessionization: same visitor hash within 30 minutes
    -- continues the same session.
    SELECT session_id INTO v_session_id
    FROM umami.session
    WHERE website_id = p_website_id
      AND distinct_id = p_distinct_id
      AND created_at > now() - INTERVAL '30 minutes'
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    -- Legacy fallback (no visitor hash supplied): old hostname bucketing.
    SELECT session_id INTO v_session_id
    FROM umami.session
    WHERE website_id = p_website_id
      AND hostname = p_hostname
      AND distinct_id IS NULL
      AND created_at > now() - INTERVAL '30 minutes'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO umami.session (
      website_id, hostname, browser, os, device, screen, language, country, distinct_id
    ) VALUES (
      p_website_id, p_hostname, p_browser, p_os, p_device, p_screen, p_language,
      p_country, p_distinct_id
    ) RETURNING session_id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;

-- track_umami_event: pass through visitor_id + country; country no longer
-- fabricates 'US' when absent.
CREATE OR REPLACE FUNCTION public.track_umami_event(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = umami, public
AS $$
DECLARE
  v_website_id   uuid;
  v_session_id   uuid;
  v_event_id     uuid;
  v_url          text;
  v_url_path     text;
  v_url_query    text;
  v_referrer     text;
  v_ref_path     text;
  v_ref_query    text;
  v_ref_domain   text;
  v_event_name   text;
  v_event_type   int;
  v_data         jsonb;
  v_key          text;
  v_val          jsonb;
  v_data_type    int;
  v_str_val      text;
  v_num_val      numeric;
BEGIN
  SELECT website_id INTO v_website_id
  FROM umami.website
  WHERE name = 'Queer Guide'
  LIMIT 1;

  IF v_website_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Website not found');
  END IF;

  v_session_id := umami.get_or_create_session(
    v_website_id,
    COALESCE(payload->>'hostname', 'localhost'),
    COALESCE(payload->>'browser', 'Unknown'),
    COALESCE(payload->>'os', 'Unknown'),
    COALESCE(payload->>'device', 'desktop'),
    COALESCE(payload->>'screen', '1920x1080'),
    COALESCE(payload->>'language', 'en'),
    NULLIF(payload->>'country', ''),
    NULLIF(payload->>'visitor_id', '')
  );

  v_url := COALESCE(payload->>'url', '/');
  v_url_path  := split_part(v_url, '?', 1);
  v_url_query := CASE WHEN position('?' in v_url) > 0
                      THEN '?' || split_part(v_url, '?', 2)
                      ELSE NULL END;

  v_referrer := NULLIF(payload->>'referrer', '');
  IF v_referrer IS NOT NULL THEN
    BEGIN
      v_ref_domain := (regexp_match(v_referrer, '^https?://([^/?#]+)'))[1];
      v_ref_path   := COALESCE((regexp_match(v_referrer, '^https?://[^/]+(/[^?#]*)'))[1], '/');
      v_ref_query  := CASE WHEN position('?' in v_referrer) > 0
                           THEN '?' || split_part(split_part(v_referrer, '?', 2), '#', 1)
                           ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN
      v_ref_domain := NULL; v_ref_path := NULL; v_ref_query := NULL;
    END;
  END IF;

  v_event_name := NULLIF(payload->>'name', '');
  v_event_type := CASE WHEN v_event_name IS NOT NULL THEN 2 ELSE 1 END;

  INSERT INTO umami.website_event (
    website_id, session_id, url_path, url_query,
    referrer_path, referrer_query, referrer_domain,
    page_title, event_type, event_name
  ) VALUES (
    v_website_id, v_session_id, v_url_path, v_url_query,
    v_ref_path, v_ref_query, v_ref_domain,
    COALESCE(payload->>'title', 'Unknown'), v_event_type, v_event_name
  )
  RETURNING event_id INTO v_event_id;

  v_data := payload->'data';
  IF v_event_name IS NOT NULL AND v_data IS NOT NULL AND jsonb_typeof(v_data) = 'object' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each(v_data)
    LOOP
      v_str_val := NULL; v_num_val := NULL; v_data_type := 1;
      IF jsonb_typeof(v_val) = 'number' THEN
        v_data_type := 2;
        v_num_val := (v_val)::text::numeric;
      ELSE
        v_str_val := CASE jsonb_typeof(v_val)
                       WHEN 'string' THEN v_val #>> '{}'
                       ELSE v_val::text
                     END;
      END IF;

      INSERT INTO umami.event_data (
        event_id, event_key, event_string_value, event_numeric_value, event_data_type
      ) VALUES (
        v_event_id, v_key, v_str_val, v_num_val, v_data_type
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_umami_event(jsonb) TO service_role, anon, authenticated;
