-- Milestone "merry-plotting-beacon" Phase 8 — cross-site integration glue.
-- Mirror of get_venue_social_signals for events.
--
-- Returns, per event_id:
--   friends_going    : count of the viewer's friends who RSVP'd as 'going' or 'interested'
--   attending_count  : total count of attendees marked 'going' or 'interested'
-- Anonymous viewer → friends_going = 0; attending_count still returned (public count).

CREATE OR REPLACE FUNCTION public.get_event_social_signals(
  p_event_ids uuid[],
  p_viewer_id uuid DEFAULT NULL
) RETURNS TABLE(
  event_id          uuid,
  friends_going     integer,
  attending_count   integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
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
    e.id AS event_id,
    COALESCE(fg.c, 0)::integer AS friends_going,
    COALESCE(ac.c, 0)::integer AS attending_count
  FROM unnest(p_event_ids) AS e(id)
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c
      FROM public.event_attendees ea
     WHERE ea.event_id = e.id
       AND ea.status IN ('going','interested')
       AND ea.user_id IN (SELECT friend_id FROM friends)
  ) fg ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c
      FROM public.event_attendees ea
     WHERE ea.event_id = e.id
       AND ea.status IN ('going','interested')
  ) ac ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_social_signals(uuid[], uuid) TO authenticated, anon;
COMMENT ON FUNCTION public.get_event_social_signals(uuid[], uuid) IS
  'Social-proof counts per event: friends going/interested + total attendees. Mirror of get_venue_social_signals.';
