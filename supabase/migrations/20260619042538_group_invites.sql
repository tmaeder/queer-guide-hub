-- Group invites: bring friends into a group + shareable invite links.
-- Mirrors group_join_requests (table + RLS + SECURITY DEFINER atomic RPCs).

-- Allow invite notifications to flow through the existing unified inbox.
ALTER TABLE public.group_notifications
  DROP CONSTRAINT IF EXISTS group_notifications_notification_type_check;
ALTER TABLE public.group_notifications
  ADD CONSTRAINT group_notifications_notification_type_check
  CHECK (notification_type IN (
    'mention','new_post','new_announcement','new_poll',
    'post_liked','comment_liked','group_invite'
  ));

CREATE TABLE IF NOT EXISTS public.group_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  invited_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text,
  token           text NOT NULL DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES auth.users(id),
  CONSTRAINT group_invites_target_chk CHECK (invited_user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS group_invites_token_uq ON public.group_invites (token);
CREATE UNIQUE INDEX IF NOT EXISTS group_invites_one_pending_user
  ON public.group_invites (group_id, invited_user_id)
  WHERE status = 'pending' AND invited_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS group_invites_group_status_idx ON public.group_invites (group_id, status);
CREATE INDEX IF NOT EXISTS group_invites_invited_user_idx
  ON public.group_invites (invited_user_id) WHERE invited_user_id IS NOT NULL;

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invitees and inviters read invites" ON public.group_invites;
CREATE POLICY "Invitees and inviters read invites"
ON public.group_invites FOR SELECT
USING (
  auth.uid() = invited_by
  OR auth.uid() = invited_user_id
  OR public.is_group_admin_or_mod(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Members create invites" ON public.group_invites;
CREATE POLICY "Members create invites"
ON public.group_invites FOR INSERT
WITH CHECK (
  auth.uid() = invited_by
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_invites.group_id AND gm.user_id = auth.uid()
  )
);

-- ---- Create one invite ----
CREATE OR REPLACE FUNCTION public.create_group_invite(
  p_group_id uuid,
  p_invited_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS public.group_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  inv public.group_invites;
  g_name text;
BEGIN
  IF p_invited_user_id IS NULL AND p_email IS NULL THEN
    RAISE EXCEPTION 'Invite needs a target user or email';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_memberships gm
                 WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only members can invite to this group';
  END IF;
  IF p_invited_user_id IS NOT NULL THEN
    IF p_invited_user_id = auth.uid() THEN
      RAISE EXCEPTION 'Cannot invite yourself';
    END IF;
    IF EXISTS (SELECT 1 FROM public.group_memberships gm
               WHERE gm.group_id = p_group_id AND gm.user_id = p_invited_user_id) THEN
      RAISE EXCEPTION 'User is already a member';
    END IF;
    -- reuse an existing pending invite if present
    SELECT * INTO inv FROM public.group_invites
      WHERE group_id = p_group_id AND invited_user_id = p_invited_user_id AND status = 'pending'
      LIMIT 1;
    IF FOUND THEN
      RETURN inv;
    END IF;
  END IF;

  INSERT INTO public.group_invites (group_id, invited_by, invited_user_id, email)
  VALUES (p_group_id, auth.uid(), p_invited_user_id, p_email)
  RETURNING * INTO inv;

  -- Surface to the invited user via the unified inbox.
  IF p_invited_user_id IS NOT NULL THEN
    SELECT name INTO g_name FROM public.community_groups WHERE id = p_group_id;
    INSERT INTO public.group_notifications
      (group_id, user_id, notification_type, triggered_by_user_id, content)
    VALUES (p_group_id, p_invited_user_id, 'group_invite', auth.uid(),
            'invited you to join ' || COALESCE(g_name, 'a group'));
  END IF;

  RETURN inv;
END;
$$;

-- ---- Bulk invite accepted friends ----
CREATE OR REPLACE FUNCTION public.invite_friends_to_group(
  p_group_id uuid,
  p_friend_ids uuid[]
)
RETURNS SETOF public.group_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  fid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.group_memberships gm
                 WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only members can invite to this group';
  END IF;

  FOREACH fid IN ARRAY p_friend_ids LOOP
    -- only accepted friends of the caller
    IF NOT EXISTS (
      SELECT 1 FROM public.user_relationships ur
      WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
        AND ((ur.user_id = auth.uid() AND ur.target_user_id = fid)
          OR (ur.target_user_id = auth.uid() AND ur.user_id = fid))
    ) THEN CONTINUE; END IF;
    -- skip existing members
    IF EXISTS (SELECT 1 FROM public.group_memberships gm
               WHERE gm.group_id = p_group_id AND gm.user_id = fid) THEN CONTINUE; END IF;

    RETURN QUERY SELECT * FROM public.create_group_invite(p_group_id, fid, NULL);
  END LOOP;
END;
$$;

-- ---- Accept an invite by token ----
CREATE OR REPLACE FUNCTION public.accept_group_invite(p_token text)
RETURNS public.group_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  inv public.group_invites;
  m   public.group_memberships;
BEGIN
  SELECT * INTO inv FROM public.group_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is no longer valid (status=%)', inv.status;
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.group_invites SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;
  IF inv.invited_user_id IS NOT NULL AND inv.invited_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This invite is for a different user';
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, role)
  VALUES (inv.group_id, auth.uid(), 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  SELECT * INTO m FROM public.group_memberships
    WHERE group_id = inv.group_id AND user_id = auth.uid();

  UPDATE public.group_invites
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = inv.id;

  RETURN m;
END;
$$;

-- ---- Revoke an invite ----
CREATE OR REPLACE FUNCTION public.revoke_group_invite(p_invite_id uuid)
RETURNS public.group_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  inv public.group_invites;
BEGIN
  SELECT * INTO inv FROM public.group_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF inv.invited_by <> auth.uid() AND NOT public.is_group_admin_or_mod(inv.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to revoke this invite';
  END IF;
  UPDATE public.group_invites SET status = 'revoked' WHERE id = p_invite_id RETURNING * INTO inv;
  RETURN inv;
END;
$$;

-- ---- Resolve a token (invite landing page) ----
CREATE OR REPLACE FUNCTION public.resolve_group_invite(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'inviteId',   i.id,
    'status',     CASE WHEN i.expires_at < now() AND i.status = 'pending' THEN 'expired' ELSE i.status END,
    'expiresAt',  i.expires_at,
    'group', jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', left(coalesce(g.description,''), 280),
      'imageUrl', g.image_url, 'isPrivate', g.is_private, 'memberCount', g.member_count),
    'invitedBy', jsonb_build_object(
      'displayName', p.display_name, 'avatarUrl', p.avatar_url),
    'alreadyMember', EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = i.group_id AND gm.user_id = auth.uid())
  )
  FROM public.group_invites i
  JOIN public.community_groups g ON g.id = i.group_id
  LEFT JOIN public.profiles p ON p.user_id = i.invited_by
  WHERE i.token = p_token;
$$;

-- ---- Pending invites for the current user ----
CREATE OR REPLACE FUNCTION public.get_my_pending_group_invites()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'inviteId', i.id, 'token', i.token, 'expiresAt', i.expires_at,
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'imageUrl', g.image_url,
                                'isPrivate', g.is_private, 'memberCount', g.member_count),
    'invitedBy', jsonb_build_object('displayName', p.display_name, 'avatarUrl', p.avatar_url)
  ) ORDER BY i.created_at DESC), '[]'::jsonb)
  FROM public.group_invites i
  JOIN public.community_groups g ON g.id = i.group_id
  LEFT JOIN public.profiles p ON p.user_id = i.invited_by
  WHERE i.invited_user_id = auth.uid() AND i.status = 'pending' AND i.expires_at > now();
$$;

-- ---- Nightly expiry of stale pending invites ----
CREATE OR REPLACE FUNCTION public.expire_group_invites()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.group_invites SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
$$;

REVOKE ALL ON FUNCTION public.create_group_invite(uuid, uuid, text)      FROM public, anon;
REVOKE ALL ON FUNCTION public.invite_friends_to_group(uuid, uuid[])      FROM public, anon;
REVOKE ALL ON FUNCTION public.accept_group_invite(text)                  FROM public, anon;
REVOKE ALL ON FUNCTION public.revoke_group_invite(uuid)                  FROM public, anon;
REVOKE ALL ON FUNCTION public.get_my_pending_group_invites()             FROM public, anon;
REVOKE ALL ON FUNCTION public.resolve_group_invite(text)                 FROM public;
REVOKE ALL ON FUNCTION public.expire_group_invites()                     FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_invite(uuid, uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_friends_to_group(uuid, uuid[])   TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_group_invite(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pending_group_invites()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_group_invite(text)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.expire_group_invites()                  TO service_role;

-- Nightly expiry cron (idempotent: cron.schedule upserts by job name).
SELECT cron.schedule('expire_group_invites', '0 4 * * *', $cron$select public.expire_group_invites();$cron$);
