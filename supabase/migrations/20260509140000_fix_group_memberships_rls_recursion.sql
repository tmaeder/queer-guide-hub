-- Fix infinite recursion in group_memberships RLS policies.
-- The original policies referenced group_memberships within their own
-- SELECT/INSERT/UPDATE/DELETE checks, causing PostgREST 500 errors.
-- Solution: SECURITY DEFINER helper function bypasses RLS for the role check.

-- 1. Create helper function
CREATE OR REPLACE FUNCTION public.is_group_admin_or_mod(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role IN ('admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_admin_or_mod(uuid, uuid) TO authenticated;

-- 2. Replace all group_memberships policies to use the helper

DROP POLICY IF EXISTS "Group memberships read access" ON group_memberships;
CREATE POLICY "Group memberships read access" ON group_memberships FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM community_groups WHERE id = group_id AND created_by = auth.uid())
  OR public.is_group_admin_or_mod(group_id, auth.uid())
  OR EXISTS (SELECT 1 FROM community_groups WHERE id = group_id AND is_private = false)
);

DROP POLICY IF EXISTS "Group memberships insert" ON group_memberships;
CREATE POLICY "Group memberships insert" ON group_memberships FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM community_groups WHERE id = group_id AND created_by = auth.uid())
  OR public.is_group_admin_or_mod(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Group memberships update" ON group_memberships;
CREATE POLICY "Group memberships update" ON group_memberships FOR UPDATE USING (
  EXISTS (SELECT 1 FROM community_groups WHERE id = group_id AND created_by = auth.uid())
  OR public.is_group_admin_or_mod(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Group memberships delete" ON group_memberships;
CREATE POLICY "Group memberships delete" ON group_memberships FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM community_groups WHERE id = group_id AND created_by = auth.uid())
  OR public.is_group_admin_or_mod(group_id, auth.uid())
);
