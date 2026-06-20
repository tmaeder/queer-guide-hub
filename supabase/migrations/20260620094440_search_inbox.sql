-- Phase 6a (server): scoped message-body + title search across the user's own
-- conversations. No persistent index — joins conversation_participants first so
-- the scanned message set is bounded to the caller's threads.
CREATE OR REPLACE FUNCTION public.search_inbox(p_user uuid, p_query text, p_limit int DEFAULT 30)
RETURNS TABLE (
  id text, kind text, subtype text, title text, preview text, avatar_url text,
  ts timestamptz, unread boolean, open_target text, other_user_id uuid,
  is_muted boolean, is_pinned boolean, is_archived boolean, unread_count int,
  last_sender_is_me boolean, last_message_subtype text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN RETURN; END IF;
  q := '%' || coalesce(trim(p_query), '') || '%';
  IF length(q) <= 2 THEN RETURN; END IF;

  RETURN QUERY
  WITH my AS (
    SELECT cp.conversation_id, cp.last_read_at, cp.is_muted, cp.is_pinned,
           cp.is_archived, cp.nickname
    FROM public.conversation_participants cp
    WHERE cp.user_id = p_user AND COALESCE(cp.is_archived, false) = false
  ),
  other AS (
    SELECT m.conversation_id, p.user_id AS other_id, p.display_name, p.avatar_url
    FROM my m
    JOIN LATERAL (
      SELECT cp2.user_id FROM public.conversation_participants cp2
      WHERE cp2.conversation_id = m.conversation_id AND cp2.user_id <> p_user
      ORDER BY cp2.joined_at LIMIT 1
    ) op ON true
    JOIN public.profiles p ON p.user_id = op.user_id
  ),
  -- latest matching message per conversation (body match)
  msg AS (
    SELECT DISTINCT ON (mm.conversation_id)
      mm.conversation_id, mm.content, mm.created_at, mm.message_type, mm.sender_id
    FROM public.messages mm
    JOIN my ON my.conversation_id = mm.conversation_id
    WHERE mm.deleted_at IS NULL AND mm.content ILIKE q
    ORDER BY mm.conversation_id, mm.created_at DESC
  ),
  hits AS (
    SELECT my.conversation_id
    FROM my
    LEFT JOIN other o ON o.conversation_id = my.conversation_id
    LEFT JOIN public.conversations c ON c.id = my.conversation_id
    WHERE my.conversation_id IN (SELECT conversation_id FROM msg)
       OR my.nickname ILIKE q
       OR c.title ILIKE q
       OR o.display_name ILIKE q
  )
  SELECT
    'conv_' || c.id::text,
    'chat'::text,
    COALESCE(c.conversation_type, 'direct'),
    COALESCE(NULLIF(my.nickname, ''), c.title, o.display_name, 'Conversation'),
    COALESCE(msg.content, lm.content, ''),
    o.avatar_url,
    COALESCE(msg.created_at, c.last_message_at, c.updated_at),
    (my.last_read_at IS NULL OR COALESCE(c.last_message_at, c.updated_at) > my.last_read_at),
    '/messages?conversation=' || c.id::text,
    o.other_id,
    COALESCE(my.is_muted, false),
    COALESCE(my.is_pinned, false),
    COALESCE(my.is_archived, false),
    COALESCE((
      SELECT count(*)::int FROM public.messages mc
      WHERE mc.conversation_id = c.id AND mc.sender_id <> p_user
        AND (my.last_read_at IS NULL OR mc.created_at > my.last_read_at)
    ), 0),
    (COALESCE(msg.sender_id, lm.sender_id) = p_user),
    COALESCE(msg.message_type, lm.message_type, 'text')
  FROM hits
  JOIN my ON my.conversation_id = hits.conversation_id
  JOIN public.conversations c ON c.id = hits.conversation_id
  LEFT JOIN other o ON o.conversation_id = hits.conversation_id
  LEFT JOIN msg ON msg.conversation_id = hits.conversation_id
  LEFT JOIN public.messages lm ON lm.id = c.last_message_id
  ORDER BY COALESCE(msg.created_at, c.last_message_at, c.updated_at) DESC
  LIMIT GREATEST(p_limit, 1);
END $$;

GRANT EXECUTE ON FUNCTION public.search_inbox(uuid, text, int) TO authenticated;
