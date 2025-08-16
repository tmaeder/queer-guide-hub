-- Fix RLS policies performance by wrapping auth function calls in subqueries
-- This ensures auth functions are evaluated once per query instead of per row

-- Fix comment_likes table
ALTER POLICY "Comment likes access control" ON public.comment_likes
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Fix user_follows table policies
ALTER POLICY "Users can create their follows" ON public.user_follows
USING ((SELECT auth.uid()) = follower_id)
WITH CHECK ((SELECT auth.uid()) = follower_id);

ALTER POLICY "Users can delete their follows" ON public.user_follows
USING ((SELECT auth.uid()) = follower_id);

ALTER POLICY "Users can update their follows" ON public.user_follows
USING ((SELECT auth.uid()) = follower_id);

-- Fix user_photos table policies
ALTER POLICY "Users manage own photos" ON public.user_photos
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users view photos with privacy controls" ON public.user_photos
USING (
  (is_public = true) OR 
  ((SELECT auth.uid()) = user_id) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Fix user_passkeys table policies
ALTER POLICY "Users can create their own passkeys" ON public.user_passkeys
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can delete their own passkeys" ON public.user_passkeys
USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own passkeys" ON public.user_passkeys
USING ((SELECT auth.uid()) = user_id);

-- Fix message participants policies
ALTER POLICY "Participants can view message participants" ON public.message_participants
USING (is_conversation_participant(conversation_id, (SELECT auth.uid())));

-- Fix user_relationships policies  
ALTER POLICY "Users can create relationships" ON public.user_relationships
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their relationships" ON public.user_relationships
USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view their relationships" ON public.user_relationships
USING (
  ((SELECT auth.uid()) = user_id) OR 
  ((SELECT auth.uid()) = target_user_id)
);

-- Fix message_participants policies
ALTER POLICY "Users can manage their message participation" ON public.message_participants
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Fix messages policies
ALTER POLICY "Participants can view messages" ON public.messages
USING (is_conversation_participant(conversation_id, (SELECT auth.uid())));

ALTER POLICY "Users can send messages" ON public.messages
USING ((SELECT auth.uid()) = sender_id)
WITH CHECK ((SELECT auth.uid()) = sender_id);

-- Note: Tables like import_jobs, user_sessions, cron_job_logs, personalities, 
-- security_events, user_role_audit_log, and passkey_challenges were not found 
-- in the current schema or already have optimized policies