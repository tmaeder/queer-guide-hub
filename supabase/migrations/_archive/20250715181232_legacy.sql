-- Fix the foreign key relationship between content and profiles tables
-- The content.author_id should reference profiles.user_id

-- First, ensure the foreign key constraint exists
ALTER TABLE public.content 
ADD CONSTRAINT content_author_id_fkey 
FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) 
ON DELETE SET NULL;