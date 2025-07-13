-- Create functions to handle post engagement counts
CREATE OR REPLACE FUNCTION increment_post_likes(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = COALESCE(likes_count, 0) + 1 
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_post_likes(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_post_comments(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.community_posts 
  SET comments_count = COALESCE(comments_count, 0) + 1 
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;