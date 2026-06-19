-- Profile surfacing: list a user's group memberships, privacy-aware.
-- Public groups always visible; private groups only to the owner or a co-member.
-- SECURITY DEFINER so the co-member check does not re-enter group_memberships RLS.
CREATE OR REPLACE FUNCTION public.get_user_groups(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'description', left(coalesce(g.description,''), 200),
    'imageUrl',    g.image_url,
    'isPrivate',   g.is_private,
    'memberCount', g.member_count,
    'tags',        to_jsonb(g.tags),
    'role',        gm.role,
    'joinedAt',    gm.joined_at
  ) ORDER BY gm.joined_at DESC), '[]'::jsonb)
  FROM public.group_memberships gm
  JOIN public.community_groups g ON g.id = gm.group_id
  WHERE gm.user_id = p_user_id
    AND (
      g.is_private = false
      OR p_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.group_memberships me
        WHERE me.group_id = g.id AND me.user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_user_groups(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_groups(uuid) TO authenticated, anon;
