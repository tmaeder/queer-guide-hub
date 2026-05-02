-- Add mentions column to community_posts if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'mentions' AND table_schema = 'public') THEN
        ALTER TABLE public.community_posts ADD COLUMN mentions jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Add mentions column to post_comments if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_comments' AND column_name = 'mentions' AND table_schema = 'public') THEN
        ALTER TABLE public.post_comments ADD COLUMN mentions jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Add tags column to community_posts if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'tags' AND table_schema = 'public') THEN
        ALTER TABLE public.community_posts ADD COLUMN tags text[] DEFAULT '{}'::text[];
    END IF;
END $$;

-- Create comment_likes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.comment_likes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(comment_id, user_id)
);

-- Enable RLS on comment_likes
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Create foreign key constraints for comment_likes if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'comment_likes_comment_id_fkey') THEN
        ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey 
        FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'comment_likes_user_id_fkey') THEN
        ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create RLS policies for comment_likes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comment_likes' AND policyname = 'Users can manage their own comment likes') THEN
        CREATE POLICY "Users can manage their own comment likes" 
        ON public.comment_likes 
        FOR ALL 
        USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comment_likes' AND policyname = 'Comment likes are viewable by everyone') THEN
        CREATE POLICY "Comment likes are viewable by everyone" 
        ON public.comment_likes 
        FOR SELECT 
        USING (true);
    END IF;
END $$;

-- Create function to increment comment likes
CREATE OR REPLACE FUNCTION public.increment_comment_likes(comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.post_comments 
  SET likes_count = COALESCE(likes_count, 0) + 1 
  WHERE id = comment_id;
END;
$$;

-- Create function to decrement comment likes
CREATE OR REPLACE FUNCTION public.decrement_comment_likes(comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.post_comments 
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = comment_id;
END;
$$;

-- Enable realtime for community posts, comments, and likes
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_likes;

-- Set replica identity for realtime updates
ALTER TABLE public.community_posts REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.post_likes REPLICA IDENTITY FULL;
ALTER TABLE public.comment_likes REPLICA IDENTITY FULL;