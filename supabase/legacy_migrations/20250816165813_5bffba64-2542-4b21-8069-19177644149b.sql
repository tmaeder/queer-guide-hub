-- Critical Security Fixes Implementation

-- 1. Fix RLS Policy Issues and Consolidate Policies
-- First, let's fix the profiles table RLS policies to prevent the security vulnerabilities

-- Drop existing problematic policies on profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create consolidated and secure RLS policies for profiles
CREATE POLICY "Profiles: Owner access only"
ON public.profiles
FOR ALL
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Profiles: Admin secure access"
ON public.profiles
FOR SELECT
TO authenticated  
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) AND
  log_enhanced_security_event(
    'ADMIN_PROFILE_ACCESS',
    (SELECT auth.uid()),
    jsonb_build_object(
      'accessed_profile', user_id,
      'justification', 'administrative_access',
      'timestamp', now()
    ),
    'high'
  ) IS NOT NULL
);

-- 2. Enhanced Content Validation Function
CREATE OR REPLACE FUNCTION public.validate_content_security(
  content_text text,
  user_id_param uuid DEFAULT auth.uid(),
  content_type text DEFAULT 'general'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  validation_result jsonb;
  xss_patterns text[] := ARRAY[
    '<script[^>]*>',
    'javascript:',
    'vbscript:',
    'data:text/html',
    'on\w+\s*=',
    '<iframe[^>]*>',
    '<object[^>]*>',
    '<embed[^>]*>'
  ];
  sql_patterns text[] := ARRAY[
    '\bUNION\b.*\bSELECT\b',
    '\bDROP\b.*\bTABLE\b',
    '\bINSERT\b.*\bINTO\b',
    '\bUPDATE\b.*\bSET\b',
    '\bDELETE\b.*\bFROM\b',
    '--.*$',
    '/\*.*\*/',
    '\bEXEC\b',
    '\bEXECUTE\b'
  ];
  pattern text;
  errors text[] := '{}';
BEGIN
  -- Input validation
  IF content_text IS NULL OR trim(content_text) = '' THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'errors', ARRAY['Content cannot be empty'],
      'security_level', 'high'
    );
  END IF;

  -- Length validation based on content type
  IF content_type = 'post' AND length(content_text) > 10000 THEN
    errors := array_append(errors, 'Post content exceeds maximum length (10,000 characters)');
  ELSIF content_type = 'comment' AND length(content_text) > 2000 THEN
    errors := array_append(errors, 'Comment exceeds maximum length (2,000 characters)');
  ELSIF content_type = 'bio' AND length(content_text) > 500 THEN
    errors := array_append(errors, 'Bio exceeds maximum length (500 characters)');
  END IF;

  -- XSS pattern detection
  FOREACH pattern IN ARRAY xss_patterns LOOP
    IF content_text ~* pattern THEN
      errors := array_append(errors, 'Potentially malicious content detected');
      -- Log security event
      PERFORM public.log_enhanced_security_event(
        'XSS_ATTEMPT_DETECTED',
        user_id_param,
        jsonb_build_object(
          'pattern_matched', pattern,
          'content_preview', left(content_text, 100),
          'content_type', content_type,
          'timestamp', now()
        ),
        'critical'
      );
      EXIT; -- Exit loop after first match
    END IF;
  END LOOP;

  -- SQL injection pattern detection
  FOREACH pattern IN ARRAY sql_patterns LOOP
    IF content_text ~* pattern THEN
      errors := array_append(errors, 'Potentially malicious SQL content detected');
      -- Log security event
      PERFORM public.log_enhanced_security_event(
        'SQL_INJECTION_ATTEMPT',
        user_id_param,
        jsonb_build_object(
          'pattern_matched', pattern,
          'content_preview', left(content_text, 100),
          'content_type', content_type,
          'timestamp', now()
        ),
        'critical'
      );
      EXIT; -- Exit loop after first match
    END IF;
  END LOOP;

  -- Rate limiting check
  IF NOT public.check_rate_limit_enhanced(
    user_id_param::text, 
    CASE 
      WHEN content_type = 'post' THEN 10
      WHEN content_type = 'comment' THEN 30
      ELSE 20
    END, 
    60, 
    'content_creation_' || content_type
  ) THEN
    errors := array_append(errors, 'Rate limit exceeded. Please wait before posting again.');
  END IF;

  -- Build result
  validation_result := jsonb_build_object(
    'is_valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'security_level', CASE 
      WHEN array_length(errors, 1) > 0 THEN 'high'
      ELSE 'low'
    END,
    'validated_at', now()
  );

  RETURN validation_result;
END;
$$;

-- 3. Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text, 
  max_attempts integer DEFAULT 10, 
  time_window_minutes integer DEFAULT 60,
  action_type text DEFAULT 'general'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  blocked_until TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Check if currently blocked
  SELECT auth_rate_limit_keys.blocked_until INTO blocked_until
  FROM public.auth_rate_limit_keys
  WHERE key = identifier || ':' || action_type
    AND blocked_until > now();
    
  IF blocked_until IS NOT NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = identifier || ':' || action_type
    AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Block for escalating periods
    UPDATE public.auth_rate_limit_keys
    SET blocked_until = now() + (
      CASE 
        WHEN attempt_count >= max_attempts * 3 THEN INTERVAL '24 hours'
        WHEN attempt_count >= max_attempts * 2 THEN INTERVAL '4 hours'
        ELSE INTERVAL '1 hour'
      END
    )
    WHERE key = identifier || ':' || action_type;
    
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'action_type', action_type,
        'attempts', attempt_count,
        'max_attempts', max_attempts,
        'blocked_until', blocked_until,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (identifier || ':' || action_type, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- 4. Secure file upload validation function
CREATE OR REPLACE FUNCTION public.validate_file_upload(
  file_name text,
  file_size bigint,
  mime_type text,
  user_id_param uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  allowed_types text[] := ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv'
  ];
  dangerous_extensions text[] := ARRAY[
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
    '.php', '.asp', '.jsp', '.html', '.htm', '.svg'
  ];
  max_file_size bigint := 10485760; -- 10MB
  file_extension text;
  errors text[] := '{}';
BEGIN
  -- Extract file extension
  file_extension := lower(substring(file_name from '\.([^.]*)$'));
  
  -- Validate file size
  IF file_size > max_file_size THEN
    errors := array_append(errors, 'File size exceeds maximum limit (10MB)');
  END IF;
  
  -- Validate MIME type
  IF NOT (mime_type = ANY(allowed_types)) THEN
    errors := array_append(errors, 'File type not allowed');
    -- Log suspicious upload attempt
    PERFORM public.log_enhanced_security_event(
      'SUSPICIOUS_FILE_UPLOAD',
      user_id_param,
      jsonb_build_object(
        'file_name', file_name,
        'mime_type', mime_type,
        'file_size', file_size,
        'timestamp', now()
      ),
      'medium'
    );
  END IF;
  
  -- Check for dangerous extensions
  IF ('.' || file_extension) = ANY(dangerous_extensions) THEN
    errors := array_append(errors, 'File extension not allowed for security reasons');
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'DANGEROUS_FILE_UPLOAD_ATTEMPT',
      user_id_param,
      jsonb_build_object(
        'file_name', file_name,
        'file_extension', file_extension,
        'timestamp', now()
      ),
      'high'
    );
  END IF;
  
  -- Rate limiting for uploads
  IF NOT public.check_rate_limit_enhanced(
    user_id_param::text, 
    20, -- 20 uploads per hour
    60, 
    'file_upload'
  ) THEN
    errors := array_append(errors, 'Upload rate limit exceeded');
  END IF;
  
  RETURN jsonb_build_object(
    'is_valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'file_info', jsonb_build_object(
      'name', file_name,
      'size', file_size,
      'type', mime_type,
      'extension', file_extension
    )
  );
END;
$$;

-- 5. Enhanced password validation
CREATE OR REPLACE FUNCTION public.validate_password_enhanced(password_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  errors text[] := '{}';
  strength_score integer := 0;
  common_passwords text[] := ARRAY[
    'password', '123456', 'password123', 'admin', 'qwerty', 'letmein',
    'welcome', 'monkey', '1234567890', 'abc123', 'password1', 'iloveyou'
  ];
BEGIN
  -- Length check (minimum 12 characters)
  IF length(password_text) < 12 THEN
    errors := array_append(errors, 'Password must be at least 12 characters long');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Uppercase letter check
  IF password_text !~ '[A-Z]' THEN
    errors := array_append(errors, 'Password must contain at least one uppercase letter');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Lowercase letter check
  IF password_text !~ '[a-z]' THEN
    errors := array_append(errors, 'Password must contain at least one lowercase letter');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Number check
  IF password_text !~ '[0-9]' THEN
    errors := array_append(errors, 'Password must contain at least one number');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Special character check
  IF password_text !~ '[!@#$%^&*(),.?":{}|<>_+=\-\[\]\\\/~`]' THEN
    errors := array_append(errors, 'Password must contain at least one special character');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Common password check
  IF lower(password_text) = ANY(common_passwords) THEN
    errors := array_append(errors, 'This password is too common and easily guessed');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  -- Sequential characters check
  IF password_text ~* '(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def)' THEN
    errors := array_append(errors, 'Password should not contain sequential characters');
  ELSE
    strength_score := strength_score + 1;
  END IF;
  
  RETURN jsonb_build_object(
    'is_valid', array_length(errors, 1) IS NULL,
    'errors', errors,
    'strength_score', strength_score,
    'strength_level', CASE 
      WHEN strength_score >= 6 THEN 'strong'
      WHEN strength_score >= 4 THEN 'medium'
      ELSE 'weak'
    END
  );
END;
$$;

-- 6. Location data anonymization function
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Anonymize venue checkins older than 30 days for non-admin users
  UPDATE public.venue_checkins 
  SET 
    latitude = CASE 
      WHEN latitude IS NOT NULL 
      THEN round(latitude::numeric, 1) -- Reduce precision to ~11km accuracy
      ELSE NULL 
    END,
    longitude = CASE 
      WHEN longitude IS NOT NULL 
      THEN round(longitude::numeric, 1) -- Reduce precision to ~11km accuracy  
      ELSE NULL 
    END
  WHERE 
    created_at < NOW() - INTERVAL '30 days'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    )
    AND (latitude IS NOT NULL OR longitude IS NOT NULL); -- Only update if coordinates exist
    
  -- Log anonymization activity
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'anonymization_timestamp', now(),
      'retention_policy', '30_days',
      'precision_reduced', 'to_11km_accuracy'
    ),
    'medium'
  );
END;
$$;

-- 7. Create trigger for content validation
CREATE OR REPLACE FUNCTION public.trigger_validate_user_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  
SET search_path TO ''
AS $$
DECLARE
  validation_result jsonb;
  content_field text;
  content_type text;
BEGIN
  -- Determine content field and type based on table
  CASE TG_TABLE_NAME
    WHEN 'community_posts' THEN
      content_field := NEW.content;
      content_type := 'post';
    WHEN 'cms_content' THEN 
      content_field := NEW.content_data->>'content';
      content_type := 'cms';
    WHEN 'profiles' THEN
      content_field := NEW.bio;
      content_type := 'bio';
    ELSE
      content_field := NULL;
      content_type := 'general';
  END CASE;
  
  -- Skip validation if no content to validate
  IF content_field IS NULL OR trim(content_field) = '' THEN
    RETURN NEW;
  END IF;
  
  -- Validate content
  validation_result := public.validate_content_security(
    content_field, 
    COALESCE(NEW.user_id, auth.uid()), 
    content_type
  );
  
  -- Block if validation fails
  IF NOT (validation_result->>'is_valid')::boolean THEN
    RAISE EXCEPTION 'Content validation failed: %', 
      array_to_string(
        ARRAY(SELECT jsonb_array_elements_text(validation_result->'errors')), 
        ', '
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply content validation triggers to relevant tables
DROP TRIGGER IF EXISTS validate_community_posts_content ON public.community_posts;
CREATE TRIGGER validate_community_posts_content
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_validate_user_content();

DROP TRIGGER IF EXISTS validate_profile_content ON public.profiles;  
CREATE TRIGGER validate_profile_content
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_validate_user_content();