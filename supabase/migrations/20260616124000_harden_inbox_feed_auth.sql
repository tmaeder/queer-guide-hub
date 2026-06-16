-- SECURITY FIX for 20260616120000_unified_inbox_feed.sql
-- The inbox RPCs failed OPEN for NULL auth.uid() (anon): `p_user <> auth.uid()`
-- is NULL when auth.uid() is NULL, so the guard's IF did not fire and the
-- function returned the requested user's data to an unauthenticated caller
-- (anon has EXECUTE via the default PUBLIC grant). Fix: explicitly reject NULL
-- auth.uid(), AND revoke the default PUBLIC/anon EXECUTE so only signed-in
-- users can call these at all (defense-in-depth).

CREATE OR REPLACE FUNCTION public.get_inbox_feed(
  p_user uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_cursor_id text DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id text, kind text, subtype text, title text, preview text,
  avatar_url text, ts timestamptz, unread boolean, open_target text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR auth.uid() IS NULL OR p_user <> auth.uid() THEN
    RETURN; -- callers may only read their OWN feed; reject anon (NULL auth.uid())
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user
  ),
  chat AS (
    SELECT
      'conv_' || c.id::text AS id, 'chat'::text AS kind,
      COALESCE(c.conversation_type, 'direct') AS subtype,
      COALESCE(c.title, op.display_name, 'Conversation') AS title,
      COALESCE(m.content, '') AS preview, op.avatar_url AS avatar_url,
      COALESCE(c.last_message_at, c.updated_at) AS ts,
      (cp.last_read_at IS NULL OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at) AS unread,
      '/messages?conversation=' || c.id::text AS open_target
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    LEFT JOIN public.messages m ON m.id = c.last_message_id
    LEFT JOIN LATERAL (
      SELECT p.display_name, p.avatar_url
      FROM public.conversation_participants cp2
      JOIN public.profiles p ON p.user_id = cp2.user_id
      WHERE cp2.conversation_id = c.id AND cp2.user_id <> p_user
      ORDER BY cp2.joined_at LIMIT 1
    ) op ON true
    WHERE cp.user_id = p_user
  ),
  mail AS (
    SELECT
      'mail_' || e.id::text, 'mail'::text, e.direction, e.subject,
      COALESCE(e.snippet, ''), NULL::text, e.email_date, (NOT e.is_read),
      '/messages?email=' || e.id::text
    FROM public.mailbox_emails e
    WHERE e.owner_id = p_user AND e.folder = 'inbox' AND e.deleted_at IS NULL
  ),
  notif AS (
    SELECT
      'notif_' || n.id::text, 'notification'::text, n.type, n.title,
      COALESCE(n.content, ''), NULL::text, n.created_at, (NOT n.read),
      COALESCE(n.action_url, '#')
    FROM public.notifications n WHERE n.user_id = p_user
  ),
  grp AS (
    SELECT
      'group_' || gn.id::text, 'notification'::text, gn.notification_type,
      COALESCE(tb.display_name, 'Someone') ||
        CASE gn.notification_type
          WHEN 'mention' THEN ' mentioned you'
          WHEN 'new_post' THEN ' posted in your group'
          WHEN 'new_announcement' THEN ' posted an announcement'
          WHEN 'new_poll' THEN ' created a poll'
          WHEN 'post_liked' THEN ' liked your post'
          WHEN 'comment_liked' THEN ' liked your comment'
          ELSE ' sent you a notification'
        END,
      COALESCE(gn.content, ''), tb.avatar_url, gn.created_at, (gn.read_at IS NULL),
      '/groups/' || gn.group_id::text || COALESCE('?post=' || gn.related_post_id::text, '')
    FROM public.group_notifications gn
    LEFT JOIN public.profiles tb ON tb.user_id = gn.triggered_by_user_id
    WHERE gn.user_id = p_user
  ),
  plike AS (
    SELECT
      'like_' || pl.id::text, 'notification'::text, 'post_like'::text,
      COALESCE(lk.display_name, 'Someone') || ' liked your post', ''::text,
      lk.avatar_url, pl.created_at,
      (pl.created_at > COALESCE((SELECT post_engagement_seen_at FROM me), '1970-01-01'::timestamptz)),
      '/community/feed'
    FROM public.post_likes pl
    JOIN public.community_posts cp ON cp.id = pl.post_id
    LEFT JOIN public.profiles lk ON lk.user_id = pl.user_id
    WHERE cp.user_id = p_user AND pl.user_id <> p_user
    ORDER BY pl.created_at DESC LIMIT 20
  ),
  pcmt AS (
    SELECT
      'comment_' || pco.id::text, 'notification'::text, 'post_comment'::text,
      COALESCE(cm.display_name, 'Someone') || ' commented on your post',
      SUBSTRING(COALESCE(pco.content,'') FROM 1 FOR 100), cm.avatar_url, pco.created_at,
      (pco.created_at > COALESCE((SELECT post_engagement_seen_at FROM me), '1970-01-01'::timestamptz)),
      '/community/feed'
    FROM public.post_comments pco
    JOIN public.community_posts cp ON cp.id = pco.post_id
    LEFT JOIN public.profiles cm ON cm.user_id = pco.user_id
    WHERE cp.user_id = p_user AND pco.user_id <> p_user
    ORDER BY pco.created_at DESC LIMIT 20
  ),
  unioned AS (
    SELECT * FROM chat   WHERE p_filter IN ('all','chats')
    UNION ALL SELECT * FROM mail   WHERE p_filter IN ('all','mail')
    UNION ALL SELECT * FROM notif  WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM grp    WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM plike  WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM pcmt   WHERE p_filter IN ('all','alerts')
  )
  SELECT u.id, u.kind, u.subtype, u.title, u.preview, u.avatar_url, u.ts, u.unread, u.open_target
  FROM unioned u
  WHERE p_cursor IS NULL OR (u.ts, u.id) < (p_cursor, p_cursor_id)
  ORDER BY u.ts DESC, u.id DESC
  LIMIT GREATEST(p_limit, 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_inbox_unread_count(p_user uuid)
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_user IS NULL OR auth.uid() IS NULL OR p_user <> auth.uid() THEN
    RETURN 0; -- reject anon (NULL auth.uid()) and cross-user reads
  END IF;
  SELECT
    (SELECT count(*) FROM public.conversation_participants cp
       JOIN public.conversations c ON c.id = cp.conversation_id
       WHERE cp.user_id = p_user
         AND (cp.last_read_at IS NULL OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at))
  + (SELECT count(*) FROM public.mailbox_emails e
       WHERE e.owner_id = p_user AND e.folder = 'inbox' AND e.deleted_at IS NULL AND e.is_read = false)
  + (SELECT count(*) FROM public.notifications n WHERE n.user_id = p_user AND n.read = false)
  + (SELECT count(*) FROM public.group_notifications gn WHERE gn.user_id = p_user AND gn.read_at IS NULL)
  + (SELECT count(*) FROM public.post_likes pl
       JOIN public.community_posts cp ON cp.id = pl.post_id
       WHERE cp.user_id = p_user AND pl.user_id <> p_user
         AND pl.created_at > COALESCE((SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user), '1970-01-01'::timestamptz))
  + (SELECT count(*) FROM public.post_comments pco
       JOIN public.community_posts cp ON cp.id = pco.post_id
       WHERE cp.user_id = p_user AND pco.user_id <> p_user
         AND pco.created_at > COALESCE((SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user), '1970-01-01'::timestamptz))
  INTO v_count;
  RETURN COALESCE(v_count, 0);
END $$;

-- Remove the default PUBLIC grant (which anon inherits); keep only authenticated.
REVOKE EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_alerts_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_alerts_read() TO authenticated;
