-- Hub redesign, Phase 1 (cont'd) — surface group chat in the unified inbox.
--
-- Group conversations (conversation_type='group', linked via
-- community_groups.chat_conversation_id per 20260711100000) already flow
-- through the `chat` CTE below once conversation_participants mirrors
-- group_memberships — no new UNION branch needed. Two things do need
-- fixing:
--   1. The `op` LATERAL join picks "the other participant" (singular) for
--      title/avatar/other_user_id — correct for 1:1 chats, wrong for an
--      N-party group. Join community_groups back in and branch on
--      conversation_type instead of trusting the conversation's stored
--      title (avoids staleness if a group is renamed after its chat
--      conversation is created).
--   2. Add a real p_filter='groups' branch, mirroring the existing
--      p_filter='matches' pattern from 20260709110000.
--
-- Only the `chat` CTE and the final UNION's WHERE clause changed; every
-- other branch is untouched. CREATE OR REPLACE keeps the signature, so the
-- REVOKE/GRANT below are re-stated to preserve the authenticated-only grant.

CREATE OR REPLACE FUNCTION public.get_inbox_feed(
  p_user uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_cursor_id text DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id text,
  kind text,
  subtype text,
  title text,
  preview text,
  avatar_url text,
  ts timestamptz,
  unread boolean,
  open_target text,
  other_user_id uuid,
  is_muted boolean,
  is_pinned boolean,
  is_archived boolean,
  unread_count int,
  last_sender_is_me boolean,
  last_message_subtype text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR auth.uid() IS NULL OR p_user <> auth.uid() THEN
    RETURN; -- callers may only read their own feed
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user
  ),
  chat AS (
    SELECT
      'conv_' || c.id::text                            AS id,
      'chat'::text                                      AS kind,
      COALESCE(c.conversation_type, 'direct')           AS subtype,
      CASE WHEN c.conversation_type = 'group' THEN cg.name
           ELSE COALESCE(NULLIF(cp.nickname, ''), c.title, op.display_name, 'Conversation')
      END                                                AS title,
      COALESCE(m.content, '')                            AS preview,
      CASE WHEN c.conversation_type = 'group' THEN cg.image_url
           ELSE op.avatar_url
      END                                                AS avatar_url,
      COALESCE(c.last_message_at, c.updated_at)          AS ts,
      (cp.last_read_at IS NULL
        OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at) AS unread,
      '/messages?conversation=' || c.id::text            AS open_target,
      CASE WHEN c.conversation_type = 'group' THEN NULL::uuid ELSE op.user_id END AS other_user_id,
      COALESCE(cp.is_muted, false)                       AS is_muted,
      COALESCE(cp.is_pinned, false)                       AS is_pinned,
      COALESCE(cp.is_archived, false)                    AS is_archived,
      COALESCE((
        SELECT count(*)::int FROM public.messages mm
        WHERE mm.conversation_id = c.id
          AND mm.sender_id <> p_user
          AND (cp.last_read_at IS NULL OR mm.created_at > cp.last_read_at)
      ), 0)                                              AS unread_count,
      (m.sender_id = p_user)                             AS last_sender_is_me,
      COALESCE(m.message_type, 'text')                   AS last_message_subtype
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    LEFT JOIN public.messages m ON m.id = c.last_message_id
    LEFT JOIN public.community_groups cg ON cg.chat_conversation_id = c.id
    LEFT JOIN LATERAL (
      SELECT p.user_id, p.display_name, p.avatar_url
      FROM public.conversation_participants cp2
      JOIN public.profiles p ON p.user_id = cp2.user_id
      WHERE cp2.conversation_id = c.id AND cp2.user_id <> p_user
      ORDER BY cp2.joined_at
      LIMIT 1
    ) op ON true
    WHERE cp.user_id = p_user
      AND COALESCE(cp.is_archived, false) = false
  ),
  mail AS (
    SELECT
      'mail_' || e.id::text, 'mail'::text, e.direction, e.subject,
      COALESCE(e.snippet, ''), NULL::text, e.email_date, (NOT e.is_read),
      '/messages?email=' || e.id::text,
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
    FROM public.mailbox_emails e
    WHERE e.owner_id = p_user AND e.folder = 'inbox' AND e.deleted_at IS NULL
  ),
  notif AS (
    SELECT
      'notif_' || n.id::text AS id, 'notification'::text AS kind,
      n.type AS subtype, n.title,
      COALESCE(n.content, ''), NULL::text, n.created_at, (NOT n.read),
      COALESCE(n.action_url, '#'),
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
    FROM public.notifications n
    WHERE n.user_id = p_user
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
      '/groups/' || gn.group_id::text
        || COALESCE('?post=' || gn.related_post_id::text, ''),
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
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
      '/community/feed',
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
    FROM public.post_likes pl
    JOIN public.community_posts cp ON cp.id = pl.post_id
    LEFT JOIN public.profiles lk ON lk.user_id = pl.user_id
    WHERE cp.user_id = p_user AND pl.user_id <> p_user
    ORDER BY pl.created_at DESC
    LIMIT 20
  ),
  pcmt AS (
    SELECT
      'comment_' || pco.id::text, 'notification'::text, 'post_comment'::text,
      COALESCE(cm.display_name, 'Someone') || ' commented on your post',
      SUBSTRING(COALESCE(pco.content,'') FROM 1 FOR 100),
      cm.avatar_url, pco.created_at,
      (pco.created_at > COALESCE((SELECT post_engagement_seen_at FROM me), '1970-01-01'::timestamptz)),
      '/community/feed',
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
    FROM public.post_comments pco
    JOIN public.community_posts cp ON cp.id = pco.post_id
    LEFT JOIN public.profiles cm ON cm.user_id = pco.user_id
    WHERE cp.user_id = p_user AND pco.user_id <> p_user
    ORDER BY pco.created_at DESC
    LIMIT 20
  ),
  tripmail AS (
    SELECT
      'tripmail_' || i.id::text                          AS id,
      'trip_email'::text                                 AS kind,
      i.parse_status                                     AS subtype,
      COALESCE(i.parsed_title, i.raw_subject, 'Forwarded email') AS title,
      COALESCE(
        lastmsg.content,
        NULLIF(concat_ws(' · ', i.parsed_vendor,
                         to_char(i.parsed_start_at, 'Mon DD')), ''),
        COALESCE(i.raw_from, '')
      )                                                  AS preview,
      NULL::text                                         AS avatar_url,
      GREATEST(i.created_at, COALESCE(lastmsg.created_at, i.created_at)) AS ts,
      (i.read_at IS NULL
        OR EXISTS (
          SELECT 1 FROM public.trip_inbox_messages am
          WHERE am.item_id = i.id AND am.role = 'assistant'
            AND am.created_at > i.read_at
        ))                                               AS unread,
      '/messages?tripmail=' || i.id::text                AS open_target,
      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text
    FROM public.trip_inbox_items i
    LEFT JOIN LATERAL (
      SELECT tm.content, tm.created_at
      FROM public.trip_inbox_messages tm
      WHERE tm.item_id = i.id
      ORDER BY tm.created_at DESC
      LIMIT 1
    ) lastmsg ON true
    WHERE public.is_trip_member(i.trip_id, p_user)
      AND i.parse_status <> 'dismissed'
  ),
  unioned AS (
    SELECT * FROM chat   WHERE p_filter IN ('all','chats')
                            OR (p_filter = 'matches' AND chat.subtype = 'match')
                            OR (p_filter = 'groups'  AND chat.subtype = 'group')
    UNION ALL SELECT * FROM mail  WHERE p_filter IN ('all','mail')
    UNION ALL SELECT * FROM notif
      WHERE p_filter IN ('all','alerts')
         OR (p_filter = 'trips' AND notif.subtype = 'trip_nudge')
    UNION ALL SELECT * FROM grp   WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM plike WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM pcmt  WHERE p_filter IN ('all','alerts')
    UNION ALL SELECT * FROM tripmail WHERE p_filter IN ('all','trips')
  )
  SELECT u.id, u.kind, u.subtype, u.title, u.preview, u.avatar_url,
         u.ts, u.unread, u.open_target, u.other_user_id, u.is_muted,
         u.is_pinned, u.is_archived, u.unread_count, u.last_sender_is_me,
         u.last_message_subtype
  FROM unioned u
  WHERE p_cursor IS NULL OR (u.ts, u.id) < (p_cursor, p_cursor_id)
  ORDER BY u.ts DESC, u.id DESC
  LIMIT GREATEST(p_limit, 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, text, int) TO authenticated;
