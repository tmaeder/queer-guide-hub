-- Update community posts policy to require authentication
DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON public.community_posts;

CREATE POLICY "Public posts are viewable by authenticated users" 
ON public.community_posts 
FOR SELECT 
TO authenticated
USING (visibility = 'public'::text);