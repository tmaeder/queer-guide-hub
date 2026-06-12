-- /venues leaderboard 401: 20260524500009 + 20260527100000 revoked anon/
-- authenticated SELECT on the leaderboard mat views (linter 0016,
-- materialized_view_in_api) but no replacement RPC was added — the widget and
-- /venues/leaderboard have been dead for everyone since. Expose the same rows
-- through a SECURITY DEFINER RPC so the mat views stay off the Data API.

CREATE OR REPLACE FUNCTION public.rpc_venue_leaderboard(
  p_city_id uuid DEFAULT NULL,
  p_limit   int  DEFAULT 100
)
RETURNS TABLE (
  user_id         uuid,
  venues_visited  int,
  total_checkins  int,
  points          int,
  rank            int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.user_id, l.venues_visited, l.total_checkins, l.points, l.rank
    FROM public.venue_leaderboard_city l
   WHERE p_city_id IS NOT NULL
     AND l.city_id = p_city_id
  UNION ALL
  SELECT g.user_id, g.venues_visited, g.total_checkins, g.points, g.rank
    FROM public.venue_leaderboard_global g
   WHERE p_city_id IS NULL
   ORDER BY rank ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.rpc_venue_leaderboard(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_venue_leaderboard(uuid, int) TO anon, authenticated;

COMMENT ON FUNCTION public.rpc_venue_leaderboard IS
  'Public venue check-in leaderboard (global when p_city_id IS NULL, else per-city). SECURITY DEFINER gateway to the venue_leaderboard_* mat views, which are not API-exposed.';
