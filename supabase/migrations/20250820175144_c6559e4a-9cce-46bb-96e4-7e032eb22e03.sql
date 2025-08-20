-- PHASE 1: Critical Security Hardening for User Data Protection
-- This migration implements enhanced security measures to protect sensitive user data

-- 1. Enhanced Location Data Anonymization
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Anonymize venue check-ins older than 30 days
  UPDATE public.venue_checkins 
  SET latitude = NULL, longitude = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND (latitude IS NOT NULL OR longitude IS NOT NULL);
    
  -- Anonymize precise location data in profiles older than 90 days
  UPDATE public.profiles 
  SET location = CASE 
    WHEN location IS NOT NULL THEN 
      -- Extract city/region only, remove precise address
      COALESCE(
        SUBSTRING(location FROM '^([^,]+,[^,]+)'),
        SUBSTRING(location FROM '^([^,]+)')
      )
    ELSE NULL
  END
  WHERE updated_at < NOW() - INTERVAL '90 days'
    AND location IS NOT NULL
    AND location LIKE '%,%,%';
    
  -- Log the anonymization event
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_RETENTION_CLEANUP',
    NULL,
    jsonb_build_object(
      'action', 'automated_location_anonymization',
      'timestamp', NOW(),
      'affected_records', 'venue_checkins_and_profiles'
    ),
    'medium'
  );
END;
$function$;

-- 2. Enhanced Financial Data Protection
CREATE OR REPLACE FUNCTION public.check_financial_data_access(
  p_user_id UUID,
  p_admin_user_id UUID,
  p_justification TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  admin_role_verified BOOLEAN := FALSE;
  access_approved BOOLEAN := FALSE;
BEGIN
  -- Verify admin role
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_admin_user_id AND role = 'admin'::app_role
  ) INTO admin_role_verified;
  
  IF NOT admin_role_verified THEN
    RETURN FALSE;
  END IF;
  
  -- Enhanced justification requirements for financial data
  IF p_justification IS NULL OR LENGTH(p_justification) < 20 THEN
    PERFORM public.log_enhanced_security_event(
      'FINANCIAL_ACCESS_DENIED_INSUFFICIENT_JUSTIFICATION',
      p_admin_user_id,
      jsonb_build_object(
        'target_user', p_user_id,
        'justification', COALESCE(p_justification, 'none'),
        'reason', 'insufficient_justification'
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Log all financial data access attempts
  PERFORM public.log_enhanced_security_event(
    'FINANCIAL_DATA_ACCESS_REQUEST',
    p_admin_user_id,
    jsonb_build_object(
      'target_user', p_user_id,
      'justification', p_justification,
      'access_granted', TRUE
    ),
    'high'
  );
  
  RETURN TRUE;
END;
$function$;

-- 3. Enhanced Passkey Security Protection
CREATE OR REPLACE FUNCTION public.secure_passkey_access(
  p_user_id UUID,
  p_operation TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Enhanced rate limiting for passkey operations
  IF NOT public.basic_rate_limit(
    'passkey_ops_' || p_user_id::TEXT, 
    5  -- Max 5 passkey operations per hour
  ) THEN
    PERFORM public.log_enhanced_security_event(
      'PASSKEY_RATE_LIMIT_EXCEEDED',
      p_user_id,
      jsonb_build_object(
        'operation', p_operation,
        'timestamp', NOW()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Log passkey access
  PERFORM public.log_enhanced_security_event(
    'PASSKEY_DATA_ACCESS',
    p_user_id,
    jsonb_build_object(
      'operation', p_operation,
      'timestamp', NOW()
    ),
    'medium'
  );
  
  RETURN TRUE;
END;
$function$;

-- 4. Enhanced Admin Access Audit Function
CREATE OR REPLACE FUNCTION public.audit_admin_sensitive_access(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_data_type TEXT,
  p_justification TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  is_emergency BOOLEAN := FALSE;
  approval_required BOOLEAN := TRUE;
BEGIN
  -- Check if this is emergency access
  is_emergency := (p_justification ILIKE '%emergency%' OR p_justification ILIKE '%urgent%');
  
  -- Different approval requirements based on data sensitivity
  CASE p_data_type
    WHEN 'sexual_orientation', 'gender_identity' THEN
      approval_required := TRUE;
    WHEN 'financial_data', 'income_range' THEN 
      approval_required := TRUE;
    WHEN 'emergency_contact' THEN
      approval_required := NOT is_emergency;
    ELSE
      approval_required := FALSE;
  END CASE;
  
  -- Log the access attempt with enhanced metadata
  PERFORM public.log_enhanced_security_event(
    'ADMIN_SENSITIVE_DATA_ACCESS',
    p_admin_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'data_type', p_data_type,
      'justification', p_justification,
      'is_emergency', is_emergency,
      'approval_required', approval_required,
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for',
      'user_agent', current_setting('request.headers', true)::json->>'user-agent',
      'timestamp', NOW()
    ),
    'critical'
  );
  
  RETURN NOT approval_required;
END;
$function$;

-- 5. Create Enhanced Security Monitoring Table
CREATE TABLE IF NOT EXISTS public.security_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  user_id UUID,
  target_user_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on security monitoring
ALTER TABLE public.security_monitoring ENABLE ROW LEVEL SECURITY;

-- Only admins can view security monitoring data
CREATE POLICY "Admins can view security monitoring" ON public.security_monitoring
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 6. Create Automated Location Anonymization Job Trigger
CREATE OR REPLACE FUNCTION public.schedule_location_anonymization()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- This would be called by a cron job to regularly anonymize old location data
  PERFORM public.anonymize_old_location_data();
END;
$function$;

-- 7. Enhanced Photo Privacy Defaults
UPDATE public.profiles 
SET privacy_settings = COALESCE(privacy_settings, '{}'::jsonb) || 
  jsonb_build_object(
    'photos_public', false,
    'photos_friends_only', true,
    'location_precise', false,
    'location_region_only', true
  )
WHERE privacy_settings IS NULL 
   OR NOT (privacy_settings ? 'photos_public');

-- 8. Create Security Incident Response Function
CREATE OR REPLACE FUNCTION public.trigger_security_incident(
  p_incident_type TEXT,
  p_severity TEXT DEFAULT 'high',
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  incident_id UUID;
BEGIN
  incident_id := gen_random_uuid();
  
  -- Insert security incident
  INSERT INTO public.security_monitoring (
    id, event_type, severity, metadata
  ) VALUES (
    incident_id, 
    'SECURITY_INCIDENT_' || p_incident_type,
    p_severity,
    p_metadata || jsonb_build_object(
      'incident_id', incident_id,
      'triggered_at', NOW(),
      'requires_immediate_action', (p_severity = 'critical')
    )
  );
  
  -- If critical, also log to main security events
  IF p_severity = 'critical' THEN
    PERFORM public.log_enhanced_security_event(
      'CRITICAL_SECURITY_INCIDENT',
      NULL,
      p_metadata || jsonb_build_object('incident_id', incident_id),
      'critical'
    );
  END IF;
  
  RETURN incident_id;
END;
$function$;

-- 9. Index for performance on security monitoring
CREATE INDEX IF NOT EXISTS idx_security_monitoring_event_type ON public.security_monitoring(event_type);
CREATE INDEX IF NOT EXISTS idx_security_monitoring_severity ON public.security_monitoring(severity);
CREATE INDEX IF NOT EXISTS idx_security_monitoring_created_at ON public.security_monitoring(created_at);
CREATE INDEX IF NOT EXISTS idx_security_monitoring_user_id ON public.security_monitoring(user_id);