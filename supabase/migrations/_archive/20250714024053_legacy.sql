-- Add missing foreign key constraints to existing tables
ALTER TABLE public.conversation_participants 
ADD CONSTRAINT fk_conversation_participants_user_id 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;