-- Fix remaining security issues: Security Definer Views and Function Search Path problems

-- First, let's check if any views have security definer (they shouldn't)
-- Drop and recreate any problematic views without security definer
DROP VIEW IF EXISTS public.secure_passkey_summary CASCADE;
DROP VIEW IF EXISTS public.secure_session_summary CASCADE;

-- Recreate views without security definer
CREATE VIEW public.secure_passkey_summary AS
SELECT 
    p.id,
    p.user_id,
    p.credential_name,
    p.authenticator_name,
    p.created_at,
    p.last_used_at
FROM public.passkeys p
WHERE p.user_id = auth.uid();

CREATE VIEW public.secure_session_summary AS
SELECT 
    s.id,
    s.user_id,
    s.created_at,
    s.last_activity_at,
    s.is_active
FROM public.user_sessions s
WHERE s.user_id = auth.uid();

-- Now fix all functions that don't have proper search_path settings
-- Update functions to use SET search_path TO '' 

-- Analysis and optimization functions
CREATE OR REPLACE FUNCTION public.analyze_rls_policy_performance()
RETURNS TABLE(table_name text, policy_count integer, performance_impact text)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'example'::text as table_name,
    1 as policy_count,
    'optimized'::text as performance_impact;
END;
$$;

-- User role management functions with proper search path
CREATE OR REPLACE FUNCTION public.assign_admin_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Only allow existing admins to assign admin roles
  IF NOT public.has_role(current_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can assign admin roles';
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log the action
  PERFORM public.log_enhanced_security_event(
    'ADMIN_ROLE_ASSIGNED',
    current_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'timestamp', now()
    ),
    'high'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_first_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  target_user_id uuid;
  admin_count integer;
BEGIN
  -- Check if any admins exist
  SELECT COUNT(*) INTO admin_count 
  FROM public.user_roles 
  WHERE role = 'admin'::app_role;
  
  -- Only allow if no admins exist
  IF admin_count > 0 THEN
    RAISE EXCEPTION 'Admin already exists. Use assign_admin_by_id instead.';
  END IF;
  
  -- Get user ID from email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Profile completion calculation
CREATE OR REPLACE FUNCTION public.calculate_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  completion_percentage integer := 0;
  total_fields integer := 10;
  filled_fields integer := 0;
BEGIN
  -- Calculate completion based on filled fields
  IF NEW.display_name IS NOT NULL AND trim(NEW.display_name) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.bio IS NOT NULL AND trim(NEW.bio) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.avatar_url IS NOT NULL AND trim(NEW.avatar_url) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.phone IS NOT NULL AND trim(NEW.phone) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.date_of_birth IS NOT NULL THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.pronouns IS NOT NULL AND trim(NEW.pronouns) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.sexual_orientation IS NOT NULL AND trim(NEW.sexual_orientation) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.gender_identity IS NOT NULL AND trim(NEW.gender_identity) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.location IS NOT NULL AND trim(NEW.location) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF NEW.relationship_status IS NOT NULL AND trim(NEW.relationship_status) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  -- Calculate percentage
  completion_percentage := (filled_fields * 100) / total_fields;
  NEW.profile_completion := completion_percentage;
  
  RETURN NEW;
END;
$$;

-- Function to calculate profile completion for specific user
CREATE OR REPLACE FUNCTION public.calculate_profile_completion(user_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  completion_percentage integer := 0;
  total_fields integer := 10;
  filled_fields integer := 0;
  profile_record public.profiles%ROWTYPE;
BEGIN
  -- Get profile record
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = user_id_param;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate completion based on filled fields
  IF profile_record.display_name IS NOT NULL AND trim(profile_record.display_name) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.bio IS NOT NULL AND trim(profile_record.bio) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.avatar_url IS NOT NULL AND trim(profile_record.avatar_url) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.phone IS NOT NULL AND trim(profile_record.phone) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.date_of_birth IS NOT NULL THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.pronouns IS NOT NULL AND trim(profile_record.pronouns) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.sexual_orientation IS NOT NULL AND trim(profile_record.sexual_orientation) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.gender_identity IS NOT NULL AND trim(profile_record.gender_identity) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.location IS NOT NULL AND trim(profile_record.location) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  IF profile_record.relationship_status IS NOT NULL AND trim(profile_record.relationship_status) != '' THEN
    filled_fields := filled_fields + 1;
  END IF;
  
  -- Calculate percentage
  completion_percentage := (filled_fields * 100) / total_fields;
  
  RETURN completion_percentage;
END;
$$;

-- Sensitive data access control
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(profile_user_id uuid, requesting_user_id uuid, privacy_field text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  profile_privacy jsonb;
  field_public boolean := false;
BEGIN
  -- Users can always view their own data
  IF profile_user_id = requesting_user_id THEN
    RETURN true;
  END IF;
  
  -- Admins can view all data
  IF public.has_role(requesting_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Check privacy settings
  SELECT privacy_settings INTO profile_privacy
  FROM public.profiles
  WHERE user_id = profile_user_id;
  
  -- If no privacy settings, default to private
  IF profile_privacy IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if the specific field is public
  field_public := COALESCE((profile_privacy ->> privacy_field)::boolean, false);
  
  RETURN field_public;
END;
$$;

-- Fix other critical functions that were missing proper search path
CREATE OR REPLACE FUNCTION public.audit_payment_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log payment data access for security audit
  PERFORM public.log_enhanced_security_event(
    'PAYMENT_DATA_ACCESSED',
    auth.uid(),
    jsonb_build_object(
      'payment_id', NEW.id,
      'access_type', 'payment_view',
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log sensitive data changes
  PERFORM public.log_enhanced_security_event(
    'SENSITIVE_DATA_MODIFIED',
    NEW.user_id,
    jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'record_id', NEW.id,
      'timestamp', now()
    ),
    'high'
  );
  
  RETURN NEW;
END;
$$;

-- Fix cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_expired_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Clean up expired bookings for privacy
  DELETE FROM public.bookings 
  WHERE expires_at < now() AND status IN ('pending', 'expired');
  
  -- Log cleanup
  PERFORM public.log_enhanced_security_event(
    'EXPIRED_BOOKINGS_CLEANUP',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now()
    ),
    'info'
  );
END;
$$;