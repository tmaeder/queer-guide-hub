-- Performance Optimization: Fix RLS Policies to Wrap auth.uid() in Subqueries
-- This prevents auth functions from being re-evaluated for every row

-- 1. public.import_jobs
ALTER POLICY "Admins can manage import jobs" ON public.import_jobs
USING ((SELECT auth.uid()) IS NOT NULL AND ... existing expression ...);

-- Update WITH CHECK if it exists
ALTER POLICY "Admins can manage import jobs" ON public.import_jobs
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND ... existing expression ...);

-- 2. public.user_sessions  
ALTER POLICY "Admins can view all sessions for monitoring" ON public.user_sessions
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 3. public.cron_job_logs
ALTER POLICY "Admins can view cron job logs" ON public.cron_job_logs
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 4. public.personalities - Policy 1
ALTER POLICY "Admins can manage all personalities" ON public.personalities
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

ALTER POLICY "Admins can manage all personalities" ON public.personalities
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 4. public.personalities - Policy 2  
ALTER POLICY "Authenticated users can create personalities" ON public.personalities
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND ... existing expression ...);

-- 4. public.personalities - Policy 3
ALTER POLICY "Users can update their own personalities" ON public.personalities
USING ((SELECT auth.uid()) = created_by AND ... existing expression ...);

-- 4. public.personalities - Policy 4
ALTER POLICY "Users can view their own personalities" ON public.personalities
USING ((SELECT auth.uid()) = created_by AND ... existing expression ...);

-- 5. public.security_events
ALTER POLICY "Only admins can access security events" ON public.security_events
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

ALTER POLICY "Only admins can access security events" ON public.security_events
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 6. public.profiles - Policy 1
ALTER POLICY "Maximum security profile DELETE" ON public.profiles
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 6. public.profiles - Policy 2
ALTER POLICY "Maximum security profile INSERT" ON public.profiles
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 6. public.profiles - Policy 3
ALTER POLICY "Maximum security profile SELECT" ON public.profiles
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 6. public.profiles - Policy 4
ALTER POLICY "Maximum security profile UPDATE" ON public.profiles
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

ALTER POLICY "Maximum security profile UPDATE" ON public.profiles
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 7. public.comment_likes
ALTER POLICY "Comment likes access control" ON public.comment_likes
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

ALTER POLICY "Comment likes access control" ON public.comment_likes
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 8. public.user_follows - Policy 1
ALTER POLICY "Users can create their follows" ON public.user_follows
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 8. public.user_follows - Policy 2
ALTER POLICY "Users can delete their follows" ON public.user_follows
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 8. public.user_follows - Policy 3
ALTER POLICY "Users can update their follows" ON public.user_follows
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

ALTER POLICY "Users can update their follows" ON public.user_follows
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 9. public.user_role_audit_log
ALTER POLICY "Only admins can access role audit logs" ON public.user_role_audit_log
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 10. public.user_photos - Policy 1
ALTER POLICY "Admins manage all photos for moderation" ON public.user_photos
USING (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

ALTER POLICY "Admins manage all photos for moderation" ON public.user_photos
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role) AND ... existing expression ...);

-- 10. public.user_photos - Policy 2
ALTER POLICY "Users manage own photos" ON public.user_photos
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

ALTER POLICY "Users manage own photos" ON public.user_photos
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 10. public.user_photos - Policy 3
ALTER POLICY "Users view photos with privacy controls" ON public.user_photos
USING ((SELECT auth.uid()) IS NOT NULL AND ... existing expression ...);

-- 11. public.user_passkeys - Policy 1
ALTER POLICY "Users can create their own passkeys" ON public.user_passkeys
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 11. public.user_passkeys - Policy 2
ALTER POLICY "Users can delete their own passkeys" ON public.user_passkeys
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 11. public.user_passkeys - Policy 3
ALTER POLICY "Users can update their own passkeys" ON public.user_passkeys
USING ((SELECT auth.uid()) = user_id AND ... existing expression ...);

ALTER POLICY "Users can update their own passkeys" ON public.user_passkeys
WITH CHECK ((SELECT auth.uid()) = user_id AND ... existing expression ...);

-- 12. public.passkey_challenges
ALTER POLICY "Service role can manage challenges" ON public.passkey_challenges
USING ((SELECT auth.role()) = 'service_role' AND ... existing expression ...);

ALTER POLICY "Service role can manage challenges" ON public.passkey_challenges
WITH CHECK ((SELECT auth.role()) = 'service_role' AND ... existing expression ...);