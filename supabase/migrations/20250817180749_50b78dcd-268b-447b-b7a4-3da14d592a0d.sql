-- Fix security warnings for functions created in previous migration
-- Adding SET search_path = '' to all functions for security

-- Fix check_rate_limit_enhanced function
CREATE OR REPLACE FUNCTION check_rate_limit_enhanced(
  identifier text,
  max_attempts integer DEFAULT 10,
  time_window_minutes integer DEFAULT 60,
  action_type text DEFAULT 'general'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_attempts integer;
  window_start timestamp;
BEGIN
  window_start := NOW() - (time_window_minutes || ' minutes')::interval;
  
  SELECT COALESCE(attempt_count, 0) INTO current_attempts
  FROM public.auth_rate_limit_keys
  WHERE key = identifier || '_' || action_type
    AND last_attempt > window_start;
  
  IF current_attempts >= max_attempts THEN
    -- Log rate limit exceeded
    PERFORM public.log_enhanced_security_event(
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
  
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (identifier || '_' || action_type, 1, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    attempt_count = public.auth_rate_limit_keys.attempt_count + 1,
    last_attempt = NOW();
  
  RETURN TRUE;
END;
$$;

-- Fix validate_content_security function
CREATE OR REPLACE FUNCTION validate_content_security(
  content_text text,
  content_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  PERFORM public.log_enhanced_security_event(
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

-- Fix validate_password_enhanced function
CREATE OR REPLACE FUNCTION validate_password_enhanced(password_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- Fix validate_file_upload function
CREATE OR REPLACE FUNCTION validate_file_upload(
  file_name text,
  file_size integer,
  mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  PERFORM public.log_enhanced_security_event(
    'FILE_UPLOAD_VALIDATION',
    auth.uid(),
    result,
    CASE WHEN array_length(errors, 1) > 0 THEN 'medium' ELSE 'low' END
  );
  
  RETURN result;
END;
$$;

-- Fix anonymize_old_location_data function
CREATE OR REPLACE FUNCTION anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  PERFORM public.log_enhanced_security_event(
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