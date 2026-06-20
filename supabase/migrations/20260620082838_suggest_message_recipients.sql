-- Phase 6b: who-to-message suggestions (recently messaged, then recently active
-- people who opted into directory presence).
CREATE OR REPLACE FUNCTION public.suggest_message_recipients(p_user uuid, p_limit int DEFAULT 12)
RETURNS TABLE (user_id uuid, display_name text, avatar_url text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT DISTINCT ON (op.user_id)
      op.user_id, p.display_name, p.avatar_url,
      'recent'::text AS reason, c.last_message_at AS ts
    FROM public.conversation_participants me
    JOIN public.conversations c ON c.id = me.conversation_id
    JOIN public.conversation_participants op
      ON op.conversation_id = c.id AND op.user_id <> p_user
    JOIN public.profiles p ON p.user_id = op.user_id
    WHERE me.user_id = p_user
    ORDER BY op.user_id, c.last_message_at DESC NULLS LAST
  ),
  active AS (
    SELECT p.user_id, p.display_name, p.avatar_url, 'active'::text AS reason, p.last_active_at AS ts
    FROM public.profiles p
    WHERE p.user_id <> p_user
      AND p.last_active_at > now() - interval '7 days'
      AND COALESCE((p.presence_visibility->>'in_directory')::boolean, false) = true
      AND p.user_id NOT IN (SELECT user_id FROM recent)
    ORDER BY p.last_active_at DESC NULLS LAST
    LIMIT p_limit
  ),
  merged AS (
    SELECT * FROM recent
    UNION ALL
    SELECT * FROM active
  )
  SELECT m.user_id, m.display_name, m.avatar_url, m.reason
  FROM merged m
  ORDER BY (m.reason = 'recent') DESC, m.ts DESC NULLS LAST
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.suggest_message_recipients(uuid, int) TO authenticated;
