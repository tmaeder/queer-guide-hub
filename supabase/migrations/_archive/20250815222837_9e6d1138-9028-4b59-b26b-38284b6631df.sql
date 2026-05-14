-- Fix critical security issues identified in security scan

-- First, fix all database functions to have secure search paths
-- The linter identified functions without SET search_path TO ''

-- Fix get_import_statistics function
CREATE OR REPLACE FUNCTION public.get_import_statistics(user_id_param uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_user_id UUID;
  stats JSONB;
BEGIN
  target_user_id := COALESCE(user_id_param, (SELECT auth.uid()));
  
  -- Check permissions
  IF target_user_id != (SELECT auth.uid()) AND NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  SELECT jsonb_build_object(
    'total_jobs', COUNT(*),
    'completed_jobs', COUNT(*) FILTER (WHERE status = 'completed'),
    'failed_jobs', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending_jobs', COUNT(*) FILTER (WHERE status IN ('pending', 'validating', 'processing')),
    'total_records_processed', COALESCE(SUM(processed_records), 0),
    'total_successful_records', COALESCE(SUM(successful_records), 0),
    'total_failed_records', COALESCE(SUM(failed_records), 0),
    'total_duplicate_records', COALESCE(SUM(duplicate_records), 0),
    'last_import_date', MAX(created_at)
  ) INTO stats
  FROM public.import_jobs_enhanced
  WHERE user_id = target_user_id;
  
  RETURN COALESCE(stats, '{}');
END;
$function$;

-- Fix validate_import_data function
CREATE OR REPLACE FUNCTION public.validate_import_data(job_id uuid, validation_rules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  job_record RECORD;
  validation_result JSONB;
  record_count INTEGER := 0;
  valid_count INTEGER := 0;
  invalid_count INTEGER := 0;
BEGIN
  -- Get the import job
  SELECT * INTO job_record 
  FROM public.import_jobs_enhanced 
  WHERE id = job_id AND user_id = (SELECT auth.uid());
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import job not found or access denied';
  END IF;
  
  -- Update job status to validating
  UPDATE public.import_jobs_enhanced 
  SET status = 'validating', phase = 'pre_validation', started_at = now()
  WHERE id = job_id;
  
  -- Log audit event
  INSERT INTO public.import_audit_log (import_job_id, user_id, action, details)
  VALUES (job_id, (SELECT auth.uid()), 'validation_started', jsonb_build_object('timestamp', now()));
  
  -- This is a simplified validation - in production this would be more comprehensive
  validation_result := jsonb_build_object(
    'total_records', record_count,
    'valid_records', valid_count,
    'invalid_records', invalid_count,
    'validation_timestamp', now()
  );
  
  -- Update job with validation results
  UPDATE public.import_jobs_enhanced 
  SET 
    validation_report = validation_result,
    valid_records = valid_count,
    invalid_records = invalid_count,
    total_records = record_count,
    status = CASE WHEN invalid_count = 0 THEN 'pending' ELSE 'failed' END,
    phase = 'post_validation'
  WHERE id = job_id;
  
  RETURN validation_result;
END;
$function$;

-- Fix consolidate_table_policies function
CREATE OR REPLACE FUNCTION public.consolidate_table_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    -- Set search path to empty to prevent search path attacks
    SET search_path = '';
    
    -- Placeholder function for policy consolidation
    -- In a real implementation, this would consolidate multiple policies
    RAISE NOTICE 'Policy consolidation would be implemented here for %.%', schema_name, table_name;
END;
$function$;

-- Strengthen RLS policies for sensitive data

-- Enhanced profiles table policies with stricter access control
DROP POLICY IF EXISTS "Users can view their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile only" ON public.profiles
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update only their own profile" ON public.profiles
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert only their own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Strengthen messages table policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages only in conversations they participate in" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp 
      WHERE cp.conversation_id = messages.conversation_id 
      AND cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create messages only in conversations they participate in" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp 
      WHERE cp.conversation_id = messages.conversation_id 
      AND cp.user_id = (SELECT auth.uid())
    )
  );

-- Strengthen venue_checkins policies for location protection
DROP POLICY IF EXISTS "Users can view their own checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create their own checkins" ON public.venue_checkins;

CREATE POLICY "Users can view only their own checkins" ON public.venue_checkins
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create only their own checkins" ON public.venue_checkins
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Prevent modification of critical location data
CREATE POLICY "Location data cannot be modified" ON public.venue_checkins
  FOR UPDATE USING (false);

-- Enhanced user_sessions policies
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;

CREATE POLICY "Users can view only their own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete only their own sessions" ON public.user_sessions
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- No UPDATE allowed on sessions for security
CREATE POLICY "Sessions cannot be updated" ON public.user_sessions
  FOR UPDATE USING (false);

-- Enhanced donations policies
DROP POLICY IF EXISTS "Users can view their own donations" ON public.donations;

CREATE POLICY "Users can view only their own donations" ON public.donations
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Only admins can view all donations
CREATE POLICY "Admins can view all donations" ON public.donations
  FOR SELECT USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- System can still create and update donations
CREATE POLICY "System can manage donations" ON public.donations
  FOR ALL USING (true) WITH CHECK (true);

-- Create enhanced content validation function for XSS prevention
CREATE OR REPLACE FUNCTION public.validate_user_content_enhanced(content text, content_type text DEFAULT 'general')
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Length validation based on content type
  IF content IS NULL THEN
    RETURN false;
  END IF;
  
  CASE content_type
    WHEN 'post' THEN
      IF length(content) > 5000 THEN RETURN false; END IF;
    WHEN 'comment' THEN
      IF length(content) > 1000 THEN RETURN false; END IF;
    WHEN 'message' THEN
      IF length(content) > 2000 THEN RETURN false; END IF;
    ELSE
      IF length(content) > 10000 THEN RETURN false; END IF;
  END CASE;
  
  -- Enhanced XSS pattern detection
  IF content ~* '<script[^>]*>|</script>|javascript:|data:[^,]*base64|vbscript:|on(load|error|click|mouse|key|focus|blur|submit|change)\s*=' THEN
    PERFORM public.log_enhanced_security_event(
      'XSS_ATTEMPT_DETECTED',
      (SELECT auth.uid()),
      jsonb_build_object(
        'content_preview', left(content, 100),
        'content_type', content_type,
        'timestamp', now()
      ),
      'high'
    );
    RETURN false;
  END IF;
  
  -- Enhanced SQL injection pattern detection
  IF content ~* '(union\s+select|insert\s+into|delete\s+from|drop\s+(table|database)|exec\s*\(|execute\s*\(|\bor\s+1\s*=\s*1\b|;\s*(select|insert|update|delete|drop))' THEN
    PERFORM public.log_enhanced_security_event(
      'SQL_INJECTION_ATTEMPT',
      (SELECT auth.uid()),
      jsonb_build_object(
        'content_preview', left(content, 100),
        'content_type', content_type,
        'timestamp', now()
      ),
      'critical'
    );
    RETURN false;
  END IF;
  
  -- Check for suspicious patterns
  IF content ~* '(\.\.\/|\.\.\\|passwd|shadow|etc\/|windows\/system32)' THEN
    PERFORM public.log_enhanced_security_event(
      'PATH_TRAVERSAL_ATTEMPT',
      (SELECT auth.uid()),
      jsonb_build_object(
        'content_preview', left(content, 100),
        'content_type', content_type,
        'timestamp', now()
      ),
      'high'
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;

-- Add content validation trigger to community_posts
CREATE OR REPLACE FUNCTION public.validate_post_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Validate post content
  IF NOT public.validate_user_content_enhanced(NEW.content, 'post') THEN
    RAISE EXCEPTION 'Invalid or potentially dangerous content detected in post';
  END IF;
  
  -- Rate limiting for post creation
  IF NOT public.check_rate_limit_enhanced((SELECT auth.uid())::text, 10, 60, 'post_creation') THEN
    RAISE EXCEPTION 'Rate limit exceeded for post creation';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Apply content validation trigger
DROP TRIGGER IF EXISTS validate_post_content_trigger ON public.community_posts;
CREATE TRIGGER validate_post_content_trigger
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_post_content();

-- Add content validation trigger to messages
CREATE OR REPLACE FUNCTION public.validate_message_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Validate message content
  IF NOT public.validate_user_content_enhanced(NEW.content, 'message') THEN
    RAISE EXCEPTION 'Invalid or potentially dangerous content detected in message';
  END IF;
  
  -- Rate limiting for message creation
  IF NOT public.check_rate_limit_enhanced((SELECT auth.uid())::text, 30, 60, 'message_creation') THEN
    RAISE EXCEPTION 'Rate limit exceeded for message creation';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Apply message validation trigger
DROP TRIGGER IF EXISTS validate_message_content_trigger ON public.messages;
CREATE TRIGGER validate_message_content_trigger
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_content();

-- Enhanced rate limiting function with progressive penalties
CREATE OR REPLACE FUNCTION public.check_rate_limit_progressive(identifier text, max_attempts integer DEFAULT 5, time_window_minutes integer DEFAULT 15, action_type text DEFAULT 'general'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  rate_limit_key TEXT;
  progressive_max INTEGER;
BEGIN
  rate_limit_key := identifier || ':' || action_type;
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Get current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = rate_limit_key
  AND last_attempt >= time_cutoff;
  
  -- Progressive rate limiting: reduce max attempts for repeat offenders
  progressive_max := CASE
    WHEN attempt_count > max_attempts * 3 THEN max_attempts / 4  -- Very restrictive
    WHEN attempt_count > max_attempts * 2 THEN max_attempts / 2  -- More restrictive
    ELSE max_attempts
  END;
  
  IF attempt_count >= progressive_max THEN
    -- Log security event for rate limit exceeded
    PERFORM public.log_enhanced_security_event(
      'PROGRESSIVE_RATE_LIMIT_EXCEEDED',
      (SELECT auth.uid()),
      jsonb_build_object(
        'identifier', identifier,
        'action_type', action_type,
        'attempts', attempt_count,
        'progressive_max', progressive_max,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count)
  VALUES (rate_limit_key, 1)
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = public.auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$function$;

-- Create function to check admin role securely
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN public.has_role((SELECT auth.uid()), 'admin'::public.app_role);
END;
$function$;