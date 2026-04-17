-- First check if there are any existing constraints blocking us
ALTER TABLE public.content DROP CONSTRAINT IF EXISTS content_author_id_fkey;

-- Now create the foreign key constraint properly
ALTER TABLE public.content 
ADD CONSTRAINT content_author_id_fkey 
FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) 
ON DELETE SET NULL ON UPDATE CASCADE;