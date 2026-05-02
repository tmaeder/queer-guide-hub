-- Add some sample group memberships for demonstration
-- This will add the group creator as a member of each group they created

INSERT INTO public.group_memberships (group_id, user_id, role, joined_at)
SELECT 
  id as group_id,
  created_by as user_id,
  'admin' as role,
  created_at as joined_at
FROM public.community_groups
WHERE created_by IS NOT NULL
ON CONFLICT (group_id, user_id) DO NOTHING;