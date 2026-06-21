-- Phase 2c: unread-DM email digest candidate selector. One digest per user per
-- day, gated on the DM re-engagement opt-in (dm_push_enabled), for unread DM
-- notifications older than p_min_age_hours.
CREATE OR REPLACE FUNCTION public.dm_digest_candidates(p_min_age_hours int DEFAULT 2)
RETURNS TABLE (
  user_id uuid, email text, display_name text,
  unread_count int, latest_title text, latest_preview text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.user_id, au.email::text, pr.display_name,
    count(*)::int AS unread_count,
    (array_agg(n.title ORDER BY n.created_at DESC))[1] AS latest_title,
    (array_agg(n.content ORDER BY n.created_at DESC))[1] AS latest_preview
  FROM public.notifications n
  JOIN auth.users au ON au.id = n.user_id
  JOIN public.profiles pr ON pr.user_id = n.user_id
  WHERE n.type = 'dm' AND n.read = false
    AND n.created_at < now() - make_interval(hours => p_min_age_hours)
    AND COALESCE(pr.dm_push_enabled, false) = true
    AND au.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.push_sent s
      WHERE s.user_id = n.user_id AND s.kind = 'dm_digest' AND s.day_bucket = current_date
    )
  GROUP BY n.user_id, au.email, pr.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.dm_digest_candidates(int) TO service_role;
