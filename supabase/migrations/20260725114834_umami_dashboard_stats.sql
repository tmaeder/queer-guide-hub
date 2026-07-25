-- Umami dashboard: SQL-side aggregation.
--
-- The umami-dashboard edge function used to pull raw umami.website_event /
-- umami.session rows via PostgREST and aggregate in JS. PostgREST caps
-- responses at max_rows = 1000, so with ~32k pageviews/week every metric was
-- computed over only the newest 1000 rows — pageview totals froze at ~1000
-- and daily charts showed zeros for anything older than a few hours.
--
-- This RPC computes every dashboard aggregate in SQL over the full window.
-- service_role only: the edge function does requireAdmin first, then calls
-- this with the service client.

CREATE OR REPLACE FUNCTION public.umami_dashboard_stats(
  p_days int DEFAULT 7,
  p_device text DEFAULT NULL,
  p_country text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = umami, public
AS $$
DECLARE
  v_website_id uuid;
  v_start      timestamptz;
  v_prev_start timestamptz;
  v_days       int;
  result       jsonb;
BEGIN
  SELECT website_id INTO v_website_id
  FROM umami.website
  WHERE name = 'Queer Guide'
  LIMIT 1;

  IF v_website_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_days := GREATEST(1, LEAST(COALESCE(p_days, 7), 365));
  v_start := now() - make_interval(days => v_days);
  v_prev_start := v_start - INTERVAL '30 days';

  WITH sess AS (
    SELECT s.session_id, s.browser, s.os, s.device, s.screen, s.language,
           s.country, s.distinct_id, s.created_at
    FROM umami.session s
    WHERE s.website_id = v_website_id
      AND s.created_at >= v_start
      AND (p_device IS NULL OR s.device = p_device)
      AND (p_country IS NULL OR s.country = p_country)
  ),
  ev AS (
    SELECT e.event_id, e.session_id, e.url_path, e.page_title,
           e.event_name, e.event_type, e.created_at
    FROM umami.website_event e
    WHERE e.website_id = v_website_id
      AND e.created_at >= v_start
      AND (
        (p_device IS NULL AND p_country IS NULL)
        OR e.session_id IN (SELECT session_id FROM sess)
      )
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM ev WHERE event_type = 1) AS page_views,
      (SELECT count(*) FROM sess) AS sessions,
      (SELECT count(DISTINCT COALESCE(distinct_id, session_id::text)) FROM sess) AS visitors
  ),
  durations AS (
    -- Per-session duration over in-window events; sessions with < 2 events
    -- contribute nothing (matches prior behavior of only measurable sessions).
    SELECT e.session_id,
           EXTRACT(EPOCH FROM max(e.created_at) - min(e.created_at)) AS secs,
           count(*) FILTER (WHERE e.event_type = 1) AS pageviews
    FROM ev e
    WHERE e.session_id IN (SELECT session_id FROM sess)
    GROUP BY e.session_id
  ),
  returning_sess AS (
    SELECT count(*) AS cnt
    FROM sess s
    WHERE s.distinct_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM umami.session p
        WHERE p.website_id = v_website_id
          AND p.distinct_id = s.distinct_id
          AND p.created_at >= v_prev_start
          AND p.created_at < v_start
      )
  ),
  top_pages AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'path', url_path, 'views', views,
             'percentage', CASE WHEN t.page_views > 0
                                THEN round(views * 100.0 / t.page_views)
                                ELSE 0 END
           ) ORDER BY views DESC), '[]'::jsonb) AS j
    FROM (
      SELECT url_path, count(*) AS views
      FROM ev WHERE event_type = 1
      GROUP BY url_path
      ORDER BY views DESC
      LIMIT 10
    ) p, totals t
    GROUP BY t.page_views
  ),
  top_browsers AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'browser', browser, 'count', cnt,
             'percentage', CASE WHEN t.sessions > 0
                                THEN round(cnt * 100.0 / t.sessions) ELSE 0 END
           ) ORDER BY cnt DESC), '[]'::jsonb) AS j
    FROM (
      SELECT COALESCE(browser, 'Unknown') AS browser, count(*) AS cnt
      FROM sess GROUP BY 1 ORDER BY cnt DESC LIMIT 5
    ) b, totals t
    GROUP BY t.sessions
  ),
  top_countries AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'country', country, 'count', cnt,
             'percentage', CASE WHEN t.sessions > 0
                                THEN round(cnt * 100.0 / t.sessions) ELSE 0 END
           ) ORDER BY cnt DESC), '[]'::jsonb) AS j
    FROM (
      SELECT trim(country) AS country, count(*) AS cnt
      FROM sess WHERE country IS NOT NULL
      GROUP BY 1 ORDER BY cnt DESC LIMIT 5
    ) c, totals t
    GROUP BY t.sessions
  ),
  top_devices AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'device', device, 'count', cnt,
             'percentage', CASE WHEN t.sessions > 0
                                THEN round(cnt * 100.0 / t.sessions) ELSE 0 END
           ) ORDER BY cnt DESC), '[]'::jsonb) AS j
    FROM (
      SELECT COALESCE(device, 'desktop') AS device, count(*) AS cnt
      FROM sess GROUP BY 1 ORDER BY cnt DESC LIMIT 5
    ) d, totals t
    GROUP BY t.sessions
  ),
  top_languages AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'language', language, 'count', cnt,
             'percentage', CASE WHEN t.sessions > 0
                                THEN round(cnt * 100.0 / t.sessions) ELSE 0 END
           ) ORDER BY cnt DESC), '[]'::jsonb) AS j
    FROM (
      SELECT language, count(*) AS cnt
      FROM sess WHERE language IS NOT NULL
      GROUP BY 1 ORDER BY cnt DESC LIMIT 5
    ) l, totals t
    GROUP BY t.sessions
  ),
  top_screens AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'screen', screen, 'count', cnt,
             'percentage', CASE WHEN t.sessions > 0
                                THEN round(cnt * 100.0 / t.sessions) ELSE 0 END
           ) ORDER BY cnt DESC), '[]'::jsonb) AS j
    FROM (
      SELECT screen, count(*) AS cnt
      FROM sess WHERE screen IS NOT NULL
      GROUP BY 1 ORDER BY cnt DESC LIMIT 5
    ) sc, totals t
    GROUP BY t.sessions
  ),
  hourly AS (
    SELECT jsonb_agg(jsonb_build_object(
             'hour', lpad(h::text, 2, '0') || ':00',
             'views', COALESCE(hv.views, 0),
             'sessions', COALESCE(hs.sessions, 0)
           ) ORDER BY h) AS j
    FROM generate_series(0, 23) h
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS h, count(*) AS views
      FROM ev WHERE event_type = 1 GROUP BY 1
    ) hv USING (h)
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS h, count(*) AS sessions
      FROM sess GROUP BY 1
    ) hs USING (h)
  ),
  daily AS (
    SELECT jsonb_agg(jsonb_build_object(
             'date', to_char(day, 'Mon FMDD'),
             'views', COALESCE(dv.views, 0),
             'sessions', COALESCE(ds.sessions, 0),
             'visitors', COALESCE(ds.visitors, 0)
           ) ORDER BY day) AS j
    FROM (
      -- v_days + 1 buckets: the window starts mid-day, so both the partial
      -- first day AND today appear (the old JS version dropped today).
      SELECT ((v_start AT TIME ZONE 'UTC')::date + i) AS day
      FROM generate_series(0, v_days) i
    ) days
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS views
      FROM ev WHERE event_type = 1 GROUP BY 1
    ) dv USING (day)
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
             count(*) AS sessions,
             count(DISTINCT COALESCE(distinct_id, session_id::text)) AS visitors
      FROM sess GROUP BY 1
    ) ds USING (day)
  ),
  recent AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'event_id', e.event_id,
             'url_path', e.url_path,
             'page_title', e.page_title,
             'event_name', e.event_name,
             'event_type', e.event_type,
             'created_at', e.created_at,
             'session', jsonb_build_object(
               'session_id', s.session_id,
               'browser', s.browser,
               'os', s.os,
               'device', s.device,
               'country', trim(s.country),
               'created_at', s.created_at
             )
           ) ORDER BY e.created_at DESC), '[]'::jsonb) AS j
    FROM (
      SELECT * FROM ev ORDER BY created_at DESC LIMIT 20
    ) e
    LEFT JOIN umami.session s ON s.session_id = e.session_id
  ),
  live AS (
    SELECT count(DISTINCT session_id) AS cnt
    FROM umami.session
    WHERE website_id = v_website_id
      AND created_at > now() - INTERVAL '5 minutes'
  )
  SELECT jsonb_build_object(
    'totalPageViews', t.page_views,
    'totalSessions', t.sessions,
    'uniqueVisitors', t.visitors,
    'avgSessionDuration', COALESCE(
      (SELECT round(avg(secs)) FROM durations WHERE secs > 0), 0),
    'bounceRate', CASE WHEN t.sessions > 0
      THEN round((SELECT count(*) FROM durations WHERE pageviews = 1) * 100.0 / t.sessions)
      ELSE 0 END,
    'newVisitors', t.sessions - r.cnt,
    'returningVisitors', r.cnt,
    -- COALESCE: the aggregating CTEs yield zero rows (not '[]') when their
    -- source set is empty, and the frontend .map()s these.
    'topPages', COALESCE((SELECT j FROM top_pages), '[]'::jsonb),
    'topBrowsers', COALESCE((SELECT j FROM top_browsers), '[]'::jsonb),
    'topCountries', COALESCE((SELECT j FROM top_countries), '[]'::jsonb),
    'topDevices', COALESCE((SELECT j FROM top_devices), '[]'::jsonb),
    'topLanguages', COALESCE((SELECT j FROM top_languages), '[]'::jsonb),
    'topScreens', COALESCE((SELECT j FROM top_screens), '[]'::jsonb),
    'hourlyData', COALESCE((SELECT j FROM hourly), '[]'::jsonb),
    'dailyData', COALESCE((SELECT j FROM daily), '[]'::jsonb),
    'recentEvents', COALESCE((SELECT j FROM recent), '[]'::jsonb),
    'liveVisitors', (SELECT cnt FROM live)
  ) INTO result
  FROM totals t, returning_sess r;

  RETURN result;
END;
$$;

-- Admin data — service_role only (edge fn gates with requireAdmin first).
REVOKE EXECUTE ON FUNCTION public.umami_dashboard_stats(int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.umami_dashboard_stats(int, text, text) TO service_role;
