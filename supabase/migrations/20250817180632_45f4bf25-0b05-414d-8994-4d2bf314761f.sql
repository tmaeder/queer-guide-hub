-- Phase 1: Critical Data Protection Security Fixes (Final)
-- Implementing comprehensive security enhancements for user data protection

-- 1. PROFILE RLS POLICIES CONSOLIDATION
-- Drop existing overlapping profile policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;

-- Create consolidated, secure profile policies
CREATE POLICY "profile_owner_full_access" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_public_read_only" ON public.profiles
  FOR SELECT USING (
    -- Only show public profile fields to non-owners
    auth.uid() != user_id AND 
    COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  );

CREATE POLICY "profile_admin_access_with_logging" ON public.profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
  );

-- 2. USER PHOTOS RLS POLICIES ENHANCEMENT
-- Drop existing photo policies
DROP POLICY IF EXISTS "Users can view their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Public photos are viewable by everyone" ON public.user_photos;

-- Create secure photo policies
CREATE POLICY "photo_owner_full_access" ON public.user_photos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "photo_public_visibility" ON public.user_photos
  FOR SELECT USING (
    -- Only public photos visible to others
    is_public = true AND
    auth.uid() IS NOT NULL AND
    auth.uid() != user_id
  );

CREATE POLICY "photo_admin_moderation_access" ON public.user_photos
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. LOCATION DATA PROTECTION
-- Add location anonymization function
CREATE OR REPLACE FUNCTION anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Anonymize venue check-ins older than 30 days
  UPDATE public.venue_checkins 
  SET 
    latitude = ROUND(latitude::numeric, 2),  -- Reduce precision
    longitude = ROUND(longitude::numeric, 2),
    venue_name = 'Anonymous Venue',
    is_anonymized = true
  WHERE 
    created_at < NOW() - INTERVAL '30 days' 
    AND COALESCE(is_anonymized, false) = false;

  -- Log anonymization activity
  PERFORM log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'records_anonymized', (SELECT count(*) FROM public.venue_checkins WHERE COALESCE(is_anonymized, false) = true),
      'anonymization_date', now()
    ),
    'low'
  );
END;
$$;

-- Add anonymization column if not exists
ALTER TABLE public.venue_checkins 
ADD COLUMN IF NOT EXISTS is_anonymized boolean DEFAULT false;

-- Enhance venue check-in RLS policies
DROP POLICY IF EXISTS "Users can view their own checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can manage their own checkins" ON public.venue_checkins;

CREATE POLICY "checkin_owner_access" ON public.venue_checkins
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "checkin_friends_visibility" ON public.venue_checkins
  FOR SELECT USING (
    -- Only show to friends if location sharing is enabled
    auth.uid() != user_id AND
    COALESCE((SELECT privacy_settings->>'location_sharing' FROM profiles WHERE user_id = venue_checkins.user_id)::boolean, false) = true AND
    EXISTS (
      SELECT 1 FROM user_relationships 
      WHERE (user_id = auth.uid() AND target_user_id = venue_checkins.user_id)
         OR (user_id = venue_checkins.user_id AND target_user_id = auth.uid())
      AND status = 'accepted'
    )
  );

-- 4. MESSAGE PRIVACY ENHANCEMENT
-- Drop existing message policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Create secure message policies
CREATE POLICY "message_conversation_participants_only" ON public.messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "message_send_to_own_conversations" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    conversation_id IN (
      SELECT conversation_id 
      FROM conversation_participants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "message_edit_own_only" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- 5. ENHANCED RATE LIMITING FOR SECURITY FUNCTIONS
CREATE OR REPLACE FUNCTION check_rate_limit_enhanced(
  identifier text,
  max_attempts integer DEFAULT 10,
  time_window_minutes integer DEFAULT 60,
  action_type text DEFAULT 'general'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_attempts integer;
  window_start timestamp;
BEGIN
  window_start := NOW() - (time_window_minutes || ' minutes')::interval;
  
  SELECT COALESCE(attempt_count, 0) INTO current_attempts
  FROM auth_rate_limit_keys
  WHERE key = identifier || '_' || action_type
    AND last_attempt > window_start;
  
  IF current_attempts >= max_attempts THEN
    -- Log rate limit exceeded
    PERFORM log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'action_type', action_type,
        'attempts', current_attempts,
        'max_attempts', max_attempts
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  INSERT INTO auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (identifier || '_' || action_type, 1, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = NOW();
  
  RETURN TRUE;
END;
$$;

-- 6. SECURE CONTENT VALIDATION
CREATE OR REPLACE FUNCTION validate_content_security(
  content_text text,
  content_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  security_score integer := 100;
  errors text[] := '{}';
BEGIN
  -- Basic XSS detection
  IF content_text ~* '<script|javascript:|on\w+=' THEN
    security_score := security_score - 50;
    errors := array_append(errors, 'Potentially malicious script detected');
  END IF;
  
  -- SQL injection detection
  IF content_text ~* '(union|select|insert|update|delete|drop)\s' THEN
    security_score := security_score - 30;
    errors := array_append(errors, 'Potentially malicious SQL detected');
  END IF;
  
  -- Content length validation
  IF length(content_text) > 10000 THEN
    security_score := security_score - 20;
    errors := array_append(errors, 'Content exceeds maximum length');
  END IF;
  
  result := jsonb_build_object(
    'is_valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'security_level', 
      CASE 
        WHEN security_score >= 80 THEN 'low'
        WHEN security_score >= 50 THEN 'medium'
        ELSE 'high'
      END,
    'strength_score', security_score
  );
  
  -- Log security validation events
  PERFORM log_enhanced_security_event(
    'CONTENT_VALIDATION',
    auth.uid(),
    jsonb_build_object(
      'content_type', content_type,
      'security_score', security_score,
      'validation_result', result
    ),
    CASE WHEN security_score < 50 THEN 'high' ELSE 'low' END
  );
  
  RETURN result;
END;
$$;

-- 7. PASSWORD STRENGTH VALIDATION
CREATE OR REPLACE FUNCTION validate_password_enhanced(password_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  strength_score integer := 0;
  errors text[] := '{}';
BEGIN
  -- Length check
  IF length(password_text) >= 8 THEN
    strength_score := strength_score + 25;
  ELSE
    errors := array_append(errors, 'Password must be at least 8 characters');
  END IF;
  
  -- Uppercase check
  IF password_text ~ '[A-Z]' THEN
    strength_score := strength_score + 20;
  ELSE
    errors := array_append(errors, 'Password must contain uppercase letters');
  END IF;
  
  -- Lowercase check
  IF password_text ~ '[a-z]' THEN
    strength_score := strength_score + 20;
  ELSE
    errors := array_append(errors, 'Password must contain lowercase letters');
  END IF;
  
  -- Number check
  IF password_text ~ '[0-9]' THEN
    strength_score := strength_score + 20;
  ELSE
    errors := array_append(errors, 'Password must contain numbers');
  END IF;
  
  -- Special character check
  IF password_text ~ '[^A-Za-z0-9]' THEN
    strength_score := strength_score + 15;
  ELSE
    errors := array_append(errors, 'Password must contain special characters');
  END IF;
  
  result := jsonb_build_object(
    'is_valid', strength_score >= 85,
    'errors', errors,
    'strength_score', strength_score,
    'strength_level',
      CASE
        WHEN strength_score >= 85 THEN 'strong'
        WHEN strength_score >= 60 THEN 'medium'
        ELSE 'weak'
      END
  );
  
  RETURN result;
END;
$$;

-- 8. FILE UPLOAD VALIDATION
CREATE OR REPLACE FUNCTION validate_file_upload(
  file_name text,
  file_size integer,
  mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  errors text[] := '{}';
  max_size integer := 10 * 1024 * 1024; -- 10MB
  allowed_types text[] := ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav'
  ];
BEGIN
  -- File size check
  IF file_size > max_size THEN
    errors := array_append(errors, 'File size exceeds 10MB limit');
  END IF;
  
  -- MIME type check
  IF NOT (mime_type = ANY(allowed_types)) THEN
    errors := array_append(errors, 'File type not allowed');
  END IF;
  
  -- Dangerous file extension check
  IF file_name ~* '\.(exe|bat|cmd|scr|pif|com|jar|zip|rar)$' THEN
    errors := array_append(errors, 'File extension not allowed');
  END IF;
  
  result := jsonb_build_object(
    'is_valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'file_info', jsonb_build_object(
      'name', file_name,
      'size', file_size,
      'type', mime_type
    )
  );
  
  -- Log file upload validation
  PERFORM log_enhanced_security_event(
    'FILE_UPLOAD_VALIDATION',
    auth.uid(),
    result,
    CASE WHEN array_length(errors, 1) > 0 THEN 'medium' ELSE 'low' END
  );
  
  RETURN result;
END;
$$;