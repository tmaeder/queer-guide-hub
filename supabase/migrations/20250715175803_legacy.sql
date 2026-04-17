-- Fix the conversation_participants RLS policy recursion issue
-- First, drop the problematic policy
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Create a new, non-recursive policy for viewing conversation participants
CREATE POLICY "Users can view participants of their conversations" 
ON public.conversation_participants 
FOR SELECT 
USING (
  -- User can see their own participation record
  user_id = auth.uid() OR
  -- User can see other participants if they are part of the same conversation
  conversation_id IN (
    SELECT conversation_id 
    FROM public.conversation_participants 
    WHERE user_id = auth.uid()
  )
);