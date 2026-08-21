-- P2 hardening fixes from the 2026-08-21 audit.

-- ---------------------------------------------------------------------------
-- hotels_top_cities: predates the hotel safety-gating layer (2026-07-26) and
-- was never updated to exclude gated hotels, unlike every other public
-- discovery aggregate (events_in_window, get_trending_entities, ...). A city
-- in a criminalizing country with several "LGBTQ+-friendly" hotels could
-- surface in this anon-reachable ranked directory with name/slug/image/
-- country. This RPC has no verified-JWT include_gated parameter (unlike
-- search_hybrid/get_recommendations), so it follows the simpler "always
-- exclude" convention rather than adding one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hotels_top_cities(result_limit integer DEFAULT 8)
RETURNS TABLE (
  city_id uuid,
  name text,
  slug text,
  country text,
  image_url text,
  hotel_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS city_id,
    c.name,
    c.slug,
    co.name AS country,
    c.image_url,
    COUNT(h.id) AS hotel_count
  FROM public.cities c
  JOIN public.hotels h ON h.city_id = c.id
  LEFT JOIN public.countries co ON co.id = c.country_id
  WHERE COALESCE(h.lgbtq_friendly, true) = true
    AND NOT COALESCE(h.safety_gated, false)
  GROUP BY c.id, c.name, c.slug, co.name, c.image_url
  ORDER BY COUNT(h.id) DESC, c.name ASC
  LIMIT GREATEST(1, LEAST(result_limit, 24));
$$;

-- ---------------------------------------------------------------------------
-- get_venue_safety_score: SECURITY DEFINER, granted to anon, reads
-- venue_safety_signals for a caller-supplied p_venue_id with no safety_gated
-- check — same class as hotels_top_cities above, but this one needs the
-- venue's own UUID to exploit (venues.RLS already keeps a gated venue's row
-- out of anon's search results, so this is defense-in-depth for a caller who
-- already holds the id — e.g. a stale/shared link — not a discovery leak).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_venue_safety_score(p_venue_id UUID)
RETURNS TABLE (
  question_slug    TEXT,
  prompt           TEXT,
  yes_weighted     NUMERIC,
  no_weighted      NUMERIC,
  n_responses      INT,
  score            NUMERIC,
  confidence_low   NUMERIC,
  confidence_high  NUMERIC,
  last_signal_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      q.slug,
      q.prompt,
      SUM(CASE WHEN s.answer       THEN exp(-ln(2.0) * EXTRACT(EPOCH FROM (now() - s.created_at)) / 86400.0 / 90.0) ELSE 0 END) AS yes_w,
      SUM(CASE WHEN NOT s.answer   THEN exp(-ln(2.0) * EXTRACT(EPOCH FROM (now() - s.created_at)) / 86400.0 / 90.0) ELSE 0 END) AS no_w,
      COUNT(*)::int AS n,
      SUM(CASE WHEN s.answer THEN 1 ELSE 0 END)::int AS k_yes,
      MAX(s.created_at) AS last_at
    FROM public.safety_signal_questions q
    LEFT JOIN public.venue_safety_signals s
      ON s.question_id = q.id
     AND s.venue_id   = p_venue_id
     AND s.flagged_at IS NULL
     AND s.created_at > now() - INTERVAL '365 days'
    WHERE q.active = true
    GROUP BY q.id, q.slug, q.prompt, q.sort_order
    ORDER BY q.sort_order
  ),
  wilson AS (
    SELECT
      slug,
      prompt,
      yes_w,
      no_w,
      n,
      last_at,
      CASE WHEN (yes_w + no_w) > 0 THEN yes_w / (yes_w + no_w) ELSE NULL END AS score_w,
      CASE WHEN n > 0 THEN k_yes::numeric / n ELSE NULL END AS phat
    FROM agg
  )
  SELECT
    slug,
    prompt,
    ROUND(yes_w::numeric, 4),
    ROUND(no_w::numeric, 4),
    n,
    ROUND(score_w::numeric, 4),
    CASE WHEN n >= 3 THEN
      GREATEST(0::numeric, ROUND(((phat + (1.96^2)/(2*n) - 1.96 * sqrt((phat*(1-phat) + (1.96^2)/(4*n)) / n)) / (1 + (1.96^2)/n))::numeric, 4))
    ELSE NULL END,
    CASE WHEN n >= 3 THEN
      LEAST(1::numeric, ROUND(((phat + (1.96^2)/(2*n) + 1.96 * sqrt((phat*(1-phat) + (1.96^2)/(4*n)) / n)) / (1 + (1.96^2)/n))::numeric, 4))
    ELSE NULL END,
    last_at
  FROM wilson
  WHERE NOT (
    auth.uid() IS NULL
    AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = p_venue_id AND v.safety_gated)
  );
$$;
