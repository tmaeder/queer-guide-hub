-- Seed pride events for 2027 by cloning the 2026 seed with a +1 year shift.
-- All 2027 dates are marked verification_status='unverified' because most
-- prides land on specific weekdays (last Saturday of June, etc.), so a naive
-- +365 day shift will mis-day events. Editorial refines verified dates per
-- year via a follow-up update.
--
-- Re-runnable: ON CONFLICT (slug) DO NOTHING.

INSERT INTO events (
  title, slug, event_type, start_date, end_date,
  city, country, city_id, country_id,
  latitude, longitude, timezone,
  data_source, verification_status, is_featured, status, is_public,
  description
)
SELECT
  REPLACE(title, '2026', '2027')                                          AS title,
  REPLACE(slug, '-2026', '-2027')                                         AS slug,
  'pride'                                                                 AS event_type,
  start_date + INTERVAL '1 year'                                          AS start_date,
  end_date + INTERVAL '1 year'                                            AS end_date,
  city, country, city_id, country_id,
  latitude, longitude, timezone,
  'seed:clone-from-2026'                                                  AS data_source,
  'unverified'                                                            AS verification_status,
  is_featured,
  'active'                                                                AS status,
  true                                                                    AS is_public,
  REPLACE(
    COALESCE(description, ''),
    '2026',
    '2027'
  )                                                                       AS description
FROM events
WHERE event_type = 'pride'
  AND data_source IN ('seed:wikipedia-prides-2026', 'editorial:confirmed-2026')
  AND start_date >= '2026-01-01'
  AND start_date < '2027-01-01'
ON CONFLICT (slug) DO NOTHING;
