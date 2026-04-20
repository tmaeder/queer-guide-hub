-- Accent-insensitive, overlap-aware events search.
-- Fixes: "Zurich" vs "Zürich" mismatch, start-only date filter dropping
-- events that overlap the requested window, and TZ-boundary trimming
-- (callers now pass start-of-day / end-of-day ISO timestamps).
--
-- Returns rows as (total, event_json) where event_json is the full events
-- row plus a nested `venues` object so the caller gets the same shape as
-- the legacy `select('*, venues(...)')` query.

CREATE OR REPLACE FUNCTION public.search_events(
  p_city                     TEXT    DEFAULT NULL,
  p_event_type               TEXT    DEFAULT NULL,
  p_start                    TIMESTAMPTZ DEFAULT NULL,
  p_end                      TIMESTAMPTZ DEFAULT NULL,
  p_tags                     TEXT[]  DEFAULT NULL,
  p_accessibility_attributes TEXT[]  DEFAULT NULL,
  p_target_groups            TEXT[]  DEFAULT NULL,
  p_search                   TEXT    DEFAULT NULL,
  p_include_past             BOOLEAN DEFAULT FALSE,
  p_limit                    INT     DEFAULT 24,
  p_offset                   INT     DEFAULT 0
)
RETURNS TABLE (
  total BIGINT,
  event JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT e.*
    FROM public.events e
    WHERE e.status = 'active'
      AND (
        CASE
          WHEN p_include_past THEN e.start_date <= now()
          ELSE COALESCE(e.end_date, e.start_date) >= now()
        END
      )
      AND (
        p_city IS NULL
        OR public.immutable_unaccent(lower(e.city))
           ILIKE '%' || public.immutable_unaccent(lower(p_city)) || '%'
      )
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
      -- Overlap semantics: event window [start_date, coalesce(end_date,start_date)]
      -- intersects requested window [p_start, p_end].
      AND (p_end   IS NULL OR e.start_date                       <= p_end)
      AND (p_start IS NULL OR COALESCE(e.end_date, e.start_date) >= p_start)
      AND (p_accessibility_attributes IS NULL OR e.accessibility_attributes && p_accessibility_attributes)
      AND (p_target_groups IS NULL OR e.target_groups && p_target_groups)
      AND (
        p_search IS NULL
        OR e.title ILIKE '%' || p_search || '%'
        OR e.description ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (SELECT count(*)::BIGINT AS total FROM filtered),
  paged AS (
    SELECT f.*
    FROM filtered f
    ORDER BY f.featured DESC,
             CASE WHEN p_include_past THEN f.start_date END DESC,
             CASE WHEN NOT p_include_past THEN f.start_date END ASC
    LIMIT  GREATEST(COALESCE(p_limit, 24), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (SELECT total FROM counted) AS total,
    to_jsonb(p) || jsonb_build_object(
      'venues',
      CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',      v.id,
        'name',    v.name,
        'address', v.address,
        'city',    v.city,
        'state',   v.state,
        'country', v.country,
        'phone',   v.phone,
        'website', v.website,
        'email',   v.email
      ) END
    ) AS event
  FROM paged p
  LEFT JOIN public.venues v ON v.id = p.venue_id;
$$;

GRANT EXECUTE ON FUNCTION public.search_events(
  TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[], TEXT[], TEXT, BOOLEAN, INT, INT
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_events IS
  'Accent-insensitive city match, overlap-based date filter. Returns
   (total, event) rows where event is the full events row with nested
   venues object. total is constant across pages; paginate via p_limit/p_offset.';
