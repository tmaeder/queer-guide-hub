-- ============================================================
-- get_venue_social_signals — per-venue social proof counts used
-- in places-discovery UI (AddPlaceDialog, venue detail).
--
-- Returns, for each venue in p_venue_ids:
--   friends_saved: number of the viewer's friends who favourited
--                  this venue. "Friend" = accepted user_relationship
--                  OR mutual user_follows. NULL/anon viewer → 0.
--   trip_usage:    total count of times this venue appears in a
--                  public trip's itinerary. Public-only so private
--                  trip contents don't leak via aggregate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_venue_social_signals(
  p_venue_ids uuid[],
  p_viewer_id uuid DEFAULT NULL
) RETURNS TABLE(
  venue_id uuid,
  friends_saved integer,
  trip_usage integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friends AS (
    SELECT CASE WHEN ur.user_id = p_viewer_id THEN ur.target_user_id ELSE ur.user_id END AS friend_id
    FROM public.user_relationships ur
    WHERE p_viewer_id IS NOT NULL
      AND ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
      AND (ur.user_id = p_viewer_id OR ur.target_user_id = p_viewer_id)
    UNION
    SELECT f1.following_id AS friend_id
    FROM public.user_follows f1
    JOIN public.user_follows f2
      ON f1.following_id = f2.follower_id
     AND f1.follower_id = f2.following_id
    WHERE p_viewer_id IS NOT NULL
      AND f1.follower_id = p_viewer_id
  )
  SELECT
    v.id AS venue_id,
    COALESCE(fs.c, 0)::integer AS friends_saved,
    COALESCE(tu.c, 0)::integer AS trip_usage
  FROM unnest(p_venue_ids) AS v(id)
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c
    FROM public.venue_favorites vf
    WHERE vf.venue_id = v.id
      AND vf.user_id IN (SELECT friend_id FROM friends)
  ) fs ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c
    FROM public.trip_places tp
    JOIN public.trips t ON t.id = tp.trip_id
    WHERE tp.venue_id = v.id
      AND t.is_public = true
  ) tu ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_social_signals(uuid[], uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_venue_social_signals(uuid[], uuid) IS
  'Social-proof counts per venue: friends who saved + public trip usage. Powers "3 friends saved this" / "used in 12 trips" badges.';
