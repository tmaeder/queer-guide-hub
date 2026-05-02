-- Fix RLS policies performance by wrapping auth function calls in subqueries
-- Only update policies that actually exist in the current schema

-- Fix comment_likes table (ALL command supports both USING and WITH CHECK)
ALTER POLICY "Comment likes access control" ON public.comment_likes
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Fix user_photos policies if they exist
DO $$
BEGIN
  -- Only update if policy exists
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_photos' AND policyname = 'Users manage own photos') THEN
    EXECUTE 'ALTER POLICY "Users manage own photos" ON public.user_photos USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_photos' AND policyname = 'Users view photos with privacy controls') THEN
    EXECUTE 'ALTER POLICY "Users view photos with privacy controls" ON public.user_photos USING ((is_public = true) OR ((SELECT auth.uid()) = user_id) OR has_role((SELECT auth.uid()), ''admin''::app_role))';
  END IF;
END $$;

-- Fix user_passkeys policies if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_passkeys' AND policyname = 'Users can create their own passkeys') THEN
    EXECUTE 'ALTER POLICY "Users can create their own passkeys" ON public.user_passkeys USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_passkeys' AND policyname = 'Users can delete their own passkeys') THEN
    EXECUTE 'ALTER POLICY "Users can delete their own passkeys" ON public.user_passkeys USING ((SELECT auth.uid()) = user_id)';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_passkeys' AND policyname = 'Users can update their own passkeys') THEN
    EXECUTE 'ALTER POLICY "Users can update their own passkeys" ON public.user_passkeys USING ((SELECT auth.uid()) = user_id)';
  END IF;
END $$;