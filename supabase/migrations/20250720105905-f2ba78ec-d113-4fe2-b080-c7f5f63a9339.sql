-- Fix the infinite recursion issue properly using security definer functions
-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;

-- Create security definer functions to check participation without recursion
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM conversation_participants 
    WHERE conversation_id = conversation_id_param 
    AND user_id = user_id_param
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_id_param UUID)
RETURNS TABLE(conversation_id UUID)
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT cp.conversation_id 
  FROM conversation_participants cp 
  WHERE cp.user_id = user_id_param;
$$;

-- Create non-recursive policies using the security definer functions
CREATE POLICY "Users can view their own participant records" 
ON public.conversation_participants 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can view other participants in their conversations" 
ON public.conversation_participants 
FOR SELECT 
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can view their conversations" 
ON public.conversations 
FOR SELECT 
USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

CREATE POLICY "Users can view messages in their conversations" 
ON public.messages 
FOR SELECT 
USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversation_ids(UUID) TO authenticated;