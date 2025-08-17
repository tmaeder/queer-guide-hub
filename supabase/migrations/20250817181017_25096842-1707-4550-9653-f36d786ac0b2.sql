-- Create missing database functions for post and comment interactions

-- Function to increment post comments count
CREATE OR REPLACE FUNCTION public.increment_post_comments(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET comments_count = COALESCE(comments_count, 0) + 1
  WHERE id = post_id;
END;
$$;

-- Function to increment comment likes count
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

-- Function to decrement comment likes count
CREATE OR REPLACE FUNCTION public.decrement_comment_likes(comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.post_comments 
  SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
  WHERE id = comment_id;
END;
$$;

-- Function to increment post likes count
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = post_id;
END;
$$;

-- Function to decrement post likes count
CREATE OR REPLACE FUNCTION public.decrement_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
  WHERE id = post_id;
END;
$$;