-- Safety spine (slice 4): enforce blocking consistently + a generic report path.
--
-- Until now a user block (user_relationships.relationship_type='block') only
-- affected the people-matching engine. Blocked users' posts/comments still
-- showed in the feed, and a blocked user could be invited to / could accept a
-- group invite. This migration:
--   1. adds a clean, general `is_blocked(a,b)` helper (the existing checker is
--      misleadingly named `intimate_is_blocked`);
--   2. bakes the block check into the community feed + comment SELECT policies;
--   3. adds block checks to the three group-invite RPCs;
--   4. adds a generic `report_content` RPC that files into `moderation_flags`
--      (the post "Report" menu was a dead stub).
-- Block is bidirectional (either party blocking hides the other).

-- =============================================================================
-- 1. Canonical, domain-neutral block helper.
-- =============================================================================
create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_relationships
    where relationship_type = 'block'
      and ((user_id = p_a and target_user_id = p_b)
        or (user_id = p_b and target_user_id = p_a))
  );
$$;

revoke all on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- =============================================================================
-- 2. Feed + comment visibility now excludes blocked authors (both directions).
--    Anonymous viewers (auth.uid() IS NULL) match neither side -> unchanged.
--    Own rows: is_blocked(self, self) is false -> still visible.
-- =============================================================================
drop policy if exists "Community posts read" on public.community_posts;
create policy "Community posts read" on public.community_posts
  for select using (
    (((select auth.uid()) = user_id) or (visibility = 'public'))
    and not public.is_blocked(user_id, (select auth.uid()))
  );

drop policy if exists "Comments are viewable by everyone" on public.post_comments;
create policy "Comments are viewable by everyone" on public.post_comments
  for select using (
    not public.is_blocked(user_id, (select auth.uid()))
  );

-- =============================================================================
-- 3. Group invites refuse blocked pairs (create, friend-bulk, accept).
-- =============================================================================
create or replace function public.create_group_invite(p_group_id uuid, p_invited_user_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
 returns group_invites
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
    IF public.is_blocked(auth.uid(), p_invited_user_id) THEN
      RAISE EXCEPTION 'Cannot invite a blocked user';
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
$function$;

create or replace function public.invite_friends_to_group(p_group_id uuid, p_friend_ids uuid[])
 returns SETOF group_invites
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
    -- skip blocked pairs
    IF public.is_blocked(auth.uid(), fid) THEN CONTINUE; END IF;
    -- skip existing members
    IF EXISTS (SELECT 1 FROM public.group_memberships gm
               WHERE gm.group_id = p_group_id AND gm.user_id = fid) THEN CONTINUE; END IF;

    RETURN QUERY SELECT * FROM public.create_group_invite(p_group_id, fid, NULL);
  END LOOP;
END;
$function$;

create or replace function public.accept_group_invite(p_token text)
 returns group_memberships
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
  IF inv.invited_by IS NOT NULL AND public.is_blocked(auth.uid(), inv.invited_by) THEN
    RAISE EXCEPTION 'Cannot accept an invite from a blocked user';
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
$function$;

-- =============================================================================
-- 4. Generic content report -> moderation_flags (wires the dead "Report" stub).
-- =============================================================================
create or replace function public.report_content(
  p_content_type text,
  p_content_id   uuid,
  p_reason       text,
  p_details      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to report';
  end if;
  if p_content_type is null or p_content_id is null or coalesce(btrim(p_reason), '') = '' then
    raise exception 'content type, id and reason are required';
  end if;
  v_reason := p_reason;
  if coalesce(btrim(p_details), '') <> '' then
    v_reason := p_reason || E'\n' || p_details;
  end if;
  insert into public.moderation_flags
    (flag_type, status, content_type, content_id, reason, reporter_user_id, source)
  values ('REVIEW', 'OPEN', p_content_type, p_content_id, v_reason, auth.uid(), 'user')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
