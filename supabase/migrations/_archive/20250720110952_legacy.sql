-- Add foreign key constraint from conversation_participants to profiles
ALTER TABLE public.conversation_participants 
ADD CONSTRAINT conversation_participants_user_id_profiles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add foreign key constraint from messages to profiles  
ALTER TABLE public.messages 
ADD CONSTRAINT messages_sender_id_profiles_user_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add foreign key constraint from message_reactions to profiles
ALTER TABLE public.message_reactions 
ADD CONSTRAINT message_reactions_user_id_profiles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;