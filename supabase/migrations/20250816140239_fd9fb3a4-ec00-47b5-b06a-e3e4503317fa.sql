-- Fix RLS policies performance by wrapping auth function calls in subqueries
-- This migration only updates existing policies with proper command-specific expressions

-- Fix comment_likes table - this is an ALL policy so it supports both USING and WITH CHECK
ALTER POLICY "Comment likes access control" ON public.comment_likes
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);