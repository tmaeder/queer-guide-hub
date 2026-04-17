-- Create a security definer function to check group membership and admin status
CREATE OR REPLACE FUNCTION public.is_group_member_or_admin(group_id uuid, check_admin boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_memberships.group_id = $1
    AND group_memberships.user_id = auth.uid()
    AND (
      CASE 
        WHEN $2 = true THEN group_memberships.role IN ('admin', 'moderator')
        ELSE true
      END
    )
  );
$$;

-- Drop and recreate the problematic policies for community_groups
DROP POLICY IF EXISTS "Group creators and admins can update groups" ON public.community_groups;
DROP POLICY IF EXISTS "Private groups are viewable by members" ON public.community_groups;

-- Create new policies using the security definer function
CREATE POLICY "Group creators and admins can update groups"
ON public.community_groups
FOR UPDATE
USING (
  auth.uid() = created_by 
  OR 
  public.is_group_member_or_admin(id, true)
);

CREATE POLICY "Private groups are viewable by members"
ON public.community_groups
FOR SELECT
USING (
  is_private = true 
  AND 
  (
    auth.uid() = created_by 
    OR 
    public.is_group_member_or_admin(id, false)
  )
);