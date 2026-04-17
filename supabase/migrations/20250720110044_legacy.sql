-- Add missing foreign key relationships for messaging system
-- Add foreign key from messages.sender_id to profiles.user_id (not profiles.id)
ALTER TABLE public.messages 
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key from conversation_participants.user_id to auth.users.id
ALTER TABLE public.conversation_participants 
ADD CONSTRAINT conversation_participants_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key from conversations to messages for last_message_id
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_last_message_id_fkey 
FOREIGN KEY (last_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

-- Add foreign key from message_reactions to messages
ALTER TABLE public.message_reactions 
ADD CONSTRAINT message_reactions_message_id_fkey 
FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

-- Add foreign key from message_reactions to auth.users
ALTER TABLE public.message_reactions 
ADD CONSTRAINT message_reactions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;