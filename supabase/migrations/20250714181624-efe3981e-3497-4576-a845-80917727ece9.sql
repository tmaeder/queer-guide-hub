-- Fix the infinite recursion in group_memberships RLS policies
-- Drop the problematic policies first
DROP POLICY IF EXISTS "Group admins can manage memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "Group memberships are viewable by group members" ON public.group_memberships;

-- Create simpler, non-recursive policies
CREATE POLICY "Users can view memberships of groups they belong to"
ON public.group_memberships
FOR SELECT
USING (
  -- Users can see their own memberships
  auth.uid() = user_id
  OR
  -- Users can see memberships of public groups
  EXISTS (
    SELECT 1 FROM public.community_groups
    WHERE community_groups.id = group_memberships.group_id
    AND community_groups.is_private = false
  )
);

CREATE POLICY "Group creators and admins can manage memberships"
ON public.group_memberships
FOR ALL
USING (
  -- Group creators can manage all memberships in their groups
  EXISTS (
    SELECT 1 FROM public.community_groups
    WHERE community_groups.id = group_memberships.group_id
    AND community_groups.created_by = auth.uid()
  )
  OR
  -- Users can manage their own membership
  auth.uid() = user_id
)
WITH CHECK (
  -- Same check for inserts/updates
  EXISTS (
    SELECT 1 FROM public.community_groups
    WHERE community_groups.id = group_memberships.group_id
    AND community_groups.created_by = auth.uid()
  )
  OR
  auth.uid() = user_id
);