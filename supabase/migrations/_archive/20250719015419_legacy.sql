-- Add group_id column to events table to link events to groups
ALTER TABLE public.events 
ADD COLUMN group_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_events_group_id ON public.events(group_id) WHERE group_id IS NOT NULL;

-- Update RLS policies for group events
CREATE POLICY "Group members can view group events" 
ON public.events 
FOR SELECT 
USING (
  group_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm 
    WHERE gm.group_id = events.group_id 
    AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can create group events" 
ON public.events 
FOR INSERT 
WITH CHECK (
  group_id IS NOT NULL 
  AND auth.uid() = created_by 
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm 
    WHERE gm.group_id = events.group_id 
    AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Group admins can update group events" 
ON public.events 
FOR UPDATE 
USING (
  group_id IS NOT NULL 
  AND (
    auth.uid() = created_by 
    OR EXISTS (
      SELECT 1 FROM public.group_memberships gm 
      WHERE gm.group_id = events.group_id 
      AND gm.user_id = auth.uid() 
      AND gm.role IN ('admin', 'moderator')
    )
  )
);

CREATE POLICY "Group admins can delete group events" 
ON public.events 
FOR DELETE 
USING (
  group_id IS NOT NULL 
  AND (
    auth.uid() = created_by 
    OR EXISTS (
      SELECT 1 FROM public.group_memberships gm 
      WHERE gm.group_id = events.group_id 
      AND gm.user_id = auth.uid() 
      AND gm.role IN ('admin', 'moderator')
    )
  )
);