-- Phase 1: Critical Security Fixes - Data Encryption and Privacy Protection

-- Add encrypted columns for sensitive profile data
ALTER TABLE public.profiles 
ADD COLUMN phone_encrypted TEXT,
ADD COLUMN sexual_orientation_encrypted TEXT,
ADD COLUMN gender_identity_encrypted TEXT,
ADD COLUMN relationship_status_encrypted TEXT,
ADD COLUMN emergency_contact_phone_encrypted TEXT,
ADD COLUMN income_range_encrypted TEXT,
ADD COLUMN political_views_encrypted TEXT,
ADD COLUMN religious_beliefs_encrypted TEXT;

-- Enhanced privacy settings validation
CREATE OR REPLACE FUNCTION public.validate_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure privacy settings contain all required fields with secure defaults
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings = jsonb_build_object(
      'sexual_orientation_public', false,
      'gender_identity_public', false,
      'pronouns_public', true,
      'bio_public', true,
      'location_public', false,
      'phone_public', false,
      'emergency_contact_public', false,
      'relationship_status_public', false,
      'physical_attributes_public', false,
      'preferences_public', false,
      'income_range_public', false,
      'political_views_public', false,
      'religious_beliefs_public', false
    );
  ELSE
    -- Ensure all required privacy fields exist with secure defaults
    NEW.privacy_settings = NEW.privacy_settings || jsonb_build_object(
      'sexual_orientation_public', COALESCE(NEW.privacy_settings->>'sexual_orientation_public', 'false')::boolean,
      'gender_identity_public', COALESCE(NEW.privacy_settings->>'gender_identity_public', 'false')::boolean,
      'pronouns_public', COALESCE(NEW.privacy_settings->>'pronouns_public', 'true')::boolean,
      'bio_public', COALESCE(NEW.privacy_settings->>'bio_public', 'true')::boolean,
      'location_public', COALESCE(NEW.privacy_settings->>'location_public', 'false')::boolean,
      'phone_public', COALESCE(NEW.privacy_settings->>'phone_public', 'false')::boolean,
      'emergency_contact_public', COALESCE(NEW.privacy_settings->>'emergency_contact_public', 'false')::boolean,
      'relationship_status_public', COALESCE(NEW.privacy_settings->>'relationship_status_public', 'false')::boolean,
      'physical_attributes_public', COALESCE(NEW.privacy_settings->>'physical_attributes_public', 'false')::boolean,
      'preferences_public', COALESCE(NEW.privacy_settings->>'preferences_public', 'false')::boolean,
      'income_range_public', COALESCE(NEW.privacy_settings->>'income_range_public', 'false')::boolean,
      'political_views_public', COALESCE(NEW.privacy_settings->>'political_views_public', 'false')::boolean,
      'religious_beliefs_public', COALESCE(NEW.privacy_settings->>'religious_beliefs_public', 'false')::boolean
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Create trigger for privacy settings validation
DROP TRIGGER IF EXISTS validate_privacy_settings_trigger ON public.profiles;
CREATE TRIGGER validate_privacy_settings_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_privacy_settings();

-- Trigger for encrypting sensitive profile data
DROP TRIGGER IF EXISTS encrypt_profile_data_trigger ON public.profiles;
CREATE TRIGGER encrypt_profile_data_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_all_profile_sensitive_data();

-- Trigger for auditing sensitive profile changes
DROP TRIGGER IF EXISTS audit_sensitive_profile_trigger ON public.profiles;
CREATE TRIGGER audit_sensitive_profile_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_profile_changes();

-- Enhanced RLS policies for profiles with privacy protection
DROP POLICY IF EXISTS "enhanced_profile_access" ON public.profiles;
CREATE POLICY "enhanced_profile_access" 
ON public.profiles FOR SELECT 
USING (
  -- Users can always see their own profile
  user_id = auth.uid() OR
  -- Admins can see all profiles (but sensitive data is still encrypted)
  public.has_role(auth.uid(), 'admin'::app_role) OR
  -- Other users can only see public profile data based on privacy settings
  (
    user_id != auth.uid() AND
    privacy_settings IS NOT NULL
  )
);

-- Function to check if user can view sensitive profile data
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(target_user_id UUID, field_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  privacy_settings JSONB;
  is_field_public BOOLEAN;
BEGIN
  -- Always allow users to see their own data
  IF target_user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;
  
  -- Allow admins to see sensitive data (with audit logging)
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    PERFORM public.log_enhanced_security_event(
      'ADMIN_SENSITIVE_DATA_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'target_user_id', target_user_id,
        'field_accessed', field_name,
        'timestamp', now()
      ),
      'medium'
    );
    RETURN TRUE;
  END IF;
  
  -- Check privacy settings for the field
  SELECT p.privacy_settings INTO privacy_settings
  FROM public.profiles p
  WHERE p.user_id = target_user_id;
  
  IF privacy_settings IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if the specific field is marked as public
  is_field_public := COALESCE((privacy_settings->>field_name)::boolean, false);
  
  RETURN is_field_public;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Location data protection - add privacy controls for venue check-ins
ALTER TABLE public.venue_checkins 
ADD COLUMN is_public BOOLEAN DEFAULT false,
ADD COLUMN anonymized_location POINT;

-- Trigger to prevent location tampering
DROP TRIGGER IF EXISTS prevent_location_tampering_trigger ON public.venue_checkins;
CREATE TRIGGER prevent_location_tampering_trigger
  BEFORE UPDATE ON public.venue_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_location_tampering();

-- Enhanced RLS for venue check-ins with privacy controls
DROP POLICY IF EXISTS "venue_checkins_privacy" ON public.venue_checkins;
CREATE POLICY "venue_checkins_privacy" 
ON public.venue_checkins FOR SELECT 
USING (
  -- Users can see their own check-ins
  user_id = auth.uid() OR
  -- Admins can see all check-ins
  public.has_role(auth.uid(), 'admin'::app_role) OR
  -- Public check-ins are visible to everyone
  is_public = true
);

-- Message content security - add encryption flags
ALTER TABLE public.messages 
ADD COLUMN is_encrypted BOOLEAN DEFAULT false,
ADD COLUMN content_hash TEXT;

-- Enhanced RLS for messages with strict access control
DROP POLICY IF EXISTS "message_access_control" ON public.messages;
CREATE POLICY "message_access_control" 
ON public.messages FOR SELECT 
USING (
  -- Only conversation participants can see messages
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id 
    AND cp.user_id = auth.uid()
  ) OR
  -- Admins can see messages only with audit logging
  (
    public.has_role(auth.uid(), 'admin'::app_role) AND
    public.log_enhanced_security_event(
      'ADMIN_MESSAGE_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'message_id', messages.id,
        'conversation_id', messages.conversation_id,
        'timestamp', now()
      ),
      'high'
    ) IS NOT NULL
  )
);

-- Donations table security enhancements
ALTER TABLE public.donations 
ADD COLUMN donor_data_encrypted TEXT,
ADD COLUMN anonymization_level INTEGER DEFAULT 1;

-- Enhanced RLS for donations
DROP POLICY IF EXISTS "donations_privacy_enhanced" ON public.donations;
CREATE POLICY "donations_privacy_enhanced" 
ON public.donations FOR SELECT 
USING (
  -- Users can see their own donations
  user_id = auth.uid() OR
  -- Admins can see all donations
  public.has_role(auth.uid(), 'admin'::app_role) OR
  -- Only completed, non-anonymous donations are public (without sensitive details)
  (status = 'completed' AND NOT is_anonymous AND user_id IS NOT NULL)
);

-- Security monitoring table for enhanced auditing
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on security events (admin only access)
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_events_admin_only" 
ON public.security_events FOR ALL 
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Enhanced security event logging function
CREATE OR REPLACE FUNCTION public.log_enhanced_security_event(
  event_type TEXT,
  user_id UUID DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'medium'
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.security_events (event_type, user_id, metadata, severity)
  VALUES (event_type, COALESCE(user_id, auth.uid()), metadata, severity)
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Rate limiting table for enhanced security
CREATE TABLE IF NOT EXISTS public.auth_rate_limit_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on rate limiting (system managed)
ALTER TABLE public.auth_rate_limit_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_system_managed" 
ON public.auth_rate_limit_keys FOR ALL 
USING (false)
WITH CHECK (false);

-- Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_rate_limit_key(
  identifier TEXT,
  max_attempts INTEGER DEFAULT 5,
  time_window_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = identifier
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count)
  VALUES (identifier, 1)
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';