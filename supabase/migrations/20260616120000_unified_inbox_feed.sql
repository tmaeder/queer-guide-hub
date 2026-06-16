-- Unified inbox feed: merge conversations + mailbox_emails + notifications

-- Supporting indexes (regular, non-concurrent — runs inside migration txn)
-- idx_messages_conv_created dropped: RPCs only do PK lookup (WHERE m.id = c.last_message_id), not range scans on messages.
-- idx_conv_participants_user dropped: baseline already has idx_conversation_participants_user_id on (user_id) which covers cp.user_id = p_user.
CREATE INDEX IF NOT EXISTS idx_mailbox_owner_inbox
  ON public.mailbox_emails (owner_id, created_at DESC)
  WHERE folder = 'inbox' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Normalized feed
CREATE OR REPLACE FUNCTION public.get_inbox_feed(
  p_user uuid,
  p_cursor timestamptz DEFAULT NULL,
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
  open_target text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN; -- callers may only read their own feed
  END IF;

  RETURN QUERY
  WITH chat AS (
    SELECT
      'conv_' || c.id::text                         AS id,
      'chat'::text                                   AS kind,
      COALESCE(c.conversation_type, 'direct')        AS subtype,
      COALESCE(c.title, op.display_name, 'Conversation') AS title,
      COALESCE(m.content, '')                         AS preview,
      op.avatar_url                                   AS avatar_url,
      COALESCE(c.last_message_at, c.updated_at)       AS ts,
      (cp.last_read_at IS NULL
        OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at) AS unread,
      '/messages?conversation=' || c.id::text         AS open_target
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    LEFT JOIN public.messages m ON m.id = c.last_message_id
    LEFT JOIN LATERAL (
      SELECT p.display_name, p.avatar_url
      FROM public.conversation_participants cp2
      JOIN public.profiles p ON p.user_id = cp2.user_id
      WHERE cp2.conversation_id = c.id AND cp2.user_id <> p_user
      ORDER BY cp2.joined_at
      LIMIT 1
    ) op ON true
    WHERE cp.user_id = p_user
  ),
  mail AS (
    SELECT
      'mail_' || e.id::text                          AS id,
      'mail'::text                                    AS kind,
      e.direction                                     AS subtype,
      e.subject                                       AS title,
      COALESCE(e.snippet, '')                         AS preview,
      NULL::text                                      AS avatar_url,
      e.email_date                                    AS ts,
      (NOT e.is_read)                                 AS unread,
      '/messages?email=' || e.id::text                AS open_target
    FROM public.mailbox_emails e
    WHERE e.owner_id = p_user
      AND e.folder = 'inbox'
      AND e.deleted_at IS NULL
  ),
  notif AS (
    SELECT
      'notif_' || n.id::text                          AS id,
      'notification'::text                            AS kind,
      n.type                                          AS subtype,
      n.title                                         AS title,
      COALESCE(n.content, '')                         AS preview,
      NULL::text                                      AS avatar_url,
      n.created_at                                    AS ts,
      (NOT n.read)                                    AS unread,
      COALESCE(n.action_url, '#')                     AS open_target
    FROM public.notifications n
    WHERE n.user_id = p_user
  ),
  unioned AS (
    SELECT * FROM chat   WHERE p_filter IN ('all','chats')
    UNION ALL
    SELECT * FROM mail   WHERE p_filter IN ('all','mail')
    UNION ALL
    SELECT * FROM notif  WHERE p_filter IN ('all','alerts')
  )
  SELECT u.id, u.kind, u.subtype, u.title, u.preview, u.avatar_url,
         u.ts, u.unread, u.open_target
  FROM unioned u
  WHERE p_cursor IS NULL OR u.ts < p_cursor
  ORDER BY u.ts DESC
  LIMIT GREATEST(p_limit, 1);
END $$;

GRANT EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, int) TO authenticated;

-- Single unread count for the badge
CREATE OR REPLACE FUNCTION public.get_inbox_unread_count(p_user uuid)
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT
    (SELECT count(*) FROM public.conversation_participants cp
       JOIN public.conversations c ON c.id = cp.conversation_id
       WHERE cp.user_id = p_user
         AND (cp.last_read_at IS NULL
              OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at))
  + (SELECT count(*) FROM public.mailbox_emails e
       WHERE e.owner_id = p_user AND e.folder = 'inbox'
         AND e.deleted_at IS NULL AND e.is_read = false)
  + (SELECT count(*) FROM public.notifications n
       WHERE n.user_id = p_user AND n.read = false)
  INTO v_count;

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) TO authenticated;
