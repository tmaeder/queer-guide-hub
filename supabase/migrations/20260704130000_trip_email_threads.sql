-- Conversational trip-email threads (workstream B phase 1).
--
-- Every forwarded booking email (trip_inbox_items row) becomes its own thread
-- in the unified inbox: a 7th `tripmail` source in get_inbox_feed, a small
-- per-item chat log (trip_inbox_messages, mirroring the proven
-- trip_concierge_messages shape), and a per-item read marker. The user chats
-- with an assistant (edge fn trip-inbox-chat) to correct extracted fields;
-- Confirm reuses the existing trip-inbox-slot logic.

-- ---------------------------------------------------------------------------
-- 1. trip_inbox_messages — chat turns per inbox item.
--    trip_id denormalized for cheap RLS via is_trip_member (same predicate
--    the parent trip_inbox_items uses). Assistant rows are written by the
--    edge function with the service role (bypasses RLS); the user INSERT
--    policy only permits role='user'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.trip_inbox_items(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) <= 8000),
  -- Assistant's proposed field updates / entity suggestions for this turn.
  proposed jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_inbox_messages_item_idx
  ON public.trip_inbox_messages(item_id, created_at);

ALTER TABLE public.trip_inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_inbox_messages_select ON public.trip_inbox_messages;
DROP POLICY IF EXISTS trip_inbox_messages_insert ON public.trip_inbox_messages;

CREATE POLICY trip_inbox_messages_select ON public.trip_inbox_messages
  FOR SELECT USING (public.is_trip_member(trip_id, (SELECT auth.uid())));
-- Users may only append their own 'user' turns; assistant turns come from the
-- service role. No UPDATE/DELETE policies — the log is append-only for users.
CREATE POLICY trip_inbox_messages_insert ON public.trip_inbox_messages
  FOR INSERT WITH CHECK (
    role = 'user'
    AND created_by = (SELECT auth.uid())
    AND public.is_trip_member(trip_id, (SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 2. Per-item read marker (v1: shared across trip members — a junction table
--    per user is deliberate disk-cost deferral on a disk-constrained DB).
-- ---------------------------------------------------------------------------
ALTER TABLE public.trip_inbox_items
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Viewers can't UPDATE items under the existing can_edit_trip policy, so the
-- read marker gets its own SECURITY DEFINER RPC gated on membership.
CREATE OR REPLACE FUNCTION public.mark_trip_inbox_item_read(p_item uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.trip_inbox_items i
     SET read_at = now()
   WHERE i.id = p_item
     AND public.is_trip_member(i.trip_id, auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.mark_trip_inbox_item_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_trip_inbox_item_read(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_inbox_feed: add the `tripmail` source. Same signature + return shape
--    as 20260620074438 (no DROP needed — CREATE OR REPLACE keeps the type).
--    The 'trips' filter becomes real: tripmail threads + trip_nudge alerts
--    (the frontend previously aliased trips→alerts client-side).
-- ---------------------------------------------------------------------------
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
      COALESCE(NULLIF(cp.nickname, ''), c.title, op.display_name, 'Conversation') AS title,
      COALESCE(m.content, '')                            AS preview,
      op.avatar_url                                      AS avatar_url,
      COALESCE(c.last_message_at, c.updated_at)          AS ts,
      (cp.last_read_at IS NULL
        OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at) AS unread,
      '/messages?conversation=' || c.id::text            AS open_target,
      op.user_id                                         AS other_user_id,
      COALESCE(cp.is_muted, false)                       AS is_muted,
      COALESCE(cp.is_pinned, false)                      AS is_pinned,
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

-- ---------------------------------------------------------------------------
-- 4. Unread badge: count unread tripmail threads too.
-- ---------------------------------------------------------------------------
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
  + (SELECT count(*) FROM public.trip_inbox_items i
       WHERE public.is_trip_member(i.trip_id, p_user)
         AND i.parse_status <> 'dismissed'
         AND (i.read_at IS NULL OR EXISTS (
            SELECT 1 FROM public.trip_inbox_messages am
            WHERE am.item_id = i.id AND am.role = 'assistant'
              AND am.created_at > i.read_at)))
  INTO v_count;
  RETURN COALESCE(v_count, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime: thread turns + item field updates invalidate the feed.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trip_inbox_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_inbox_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trip_inbox_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_inbox_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Retention: chat turns fall under the same privacy window as raw bodies —
--    extend the nightly purge to delete thread logs 30d after trip end.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_trip_inbox_raw_bodies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH purged AS (
    UPDATE public.trip_inbox_items i
       SET raw_body_encrypted = NULL
      FROM public.trips t
     WHERE i.trip_id = t.id
       AND t.end_date IS NOT NULL
       AND t.end_date < (now() - interval '30 days')::date
       AND i.raw_body_encrypted IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM purged;

  DELETE FROM public.trip_inbox_messages m
   USING public.trips t
   WHERE m.trip_id = t.id
     AND t.end_date IS NOT NULL
     AND t.end_date < (now() - interval '30 days')::date;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_trip_inbox_raw_bodies() FROM public;
