-- Final Security Definer Optimization
-- This migration reviews and optimizes SECURITY DEFINER usage to comply with security best practices
-- We keep SECURITY DEFINER only for functions that absolutely require elevated privileges

-- The following functions LEGITIMATELY need SECURITY DEFINER for security:
-- 1. Authentication and role management functions
-- 2. Encryption/decryption functions  
-- 3. Security auditing and logging functions
-- 4. Rate limiting and abuse prevention
-- 5. Privacy and cleanup functions
-- 6. Notification system functions (need system access)

-- Remove SECURITY DEFINER from functions that can operate with normal user privileges
-- These are mostly utility functions that don't need elevated access

-- Remove SECURITY DEFINER from user-facing utility functions that don't need it
DROP FUNCTION IF EXISTS public.calculate_profile_completion(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_profile_completion(user_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  completion_score integer := 0;
  profile_record record;
BEGIN
  -- Get the profile record
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = user_id_param;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate completion based on filled fields
  IF profile_record.display_name IS NOT NULL AND trim(profile_record.display_name) != '' THEN
    completion_score := completion_score + 20;
  END IF;
  
  IF profile_record.bio IS NOT NULL AND trim(profile_record.bio) != '' THEN
    completion_score := completion_score + 15;
  END IF;
  
  IF profile_record.avatar_url IS NOT NULL AND trim(profile_record.avatar_url) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.location IS NOT NULL AND trim(profile_record.location) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.website IS NOT NULL AND trim(profile_record.website) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.pronouns IS NOT NULL AND trim(profile_record.pronouns) != '' THEN
    completion_score := completion_score + 5;
  END IF;
  
  IF profile_record.interests IS NOT NULL AND array_length(profile_record.interests, 1) > 0 THEN
    completion_score := completion_score + 15;
  END IF;
  
  IF profile_record.social_links IS NOT NULL AND profile_record.social_links != '{}' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.phone IS NOT NULL AND trim(profile_record.phone) != '' THEN
    completion_score := completion_score + 5;
  END IF;
  
  RETURN LEAST(completion_score, 100);
END;
$$;

-- Remove SECURITY DEFINER from entity management functions that don't need elevated privileges
DROP FUNCTION IF EXISTS public.get_entity_attributes(text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_entity_attributes(entity_type_param text, entity_id_param uuid)
RETURNS TABLE(
  attribute_id uuid,
  attribute_name text,
  attribute_description text,
  attribute_icon text,
  attribute_category text
)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.description,
    a.icon,
    a.category
  FROM public.attributes a
  JOIN public.entity_attribute_assignments eaa ON a.id = eaa.attribute_id
  WHERE eaa.entity_type = entity_type_param 
    AND eaa.entity_id = entity_id_param
    AND a.is_active = true
  ORDER BY a.sort_order, a.name;
END;
$$;

DROP FUNCTION IF EXISTS public.get_entity_tags(text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_entity_tags(entity_type_param text, entity_id_param uuid)
RETURNS TABLE(
  tag_id uuid,
  tag_name text,
  tag_description text,
  tag_color text,
  tag_category text
)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.description,
    t.color,
    t.category
  FROM public.tags t
  JOIN public.entity_tag_assignments eta ON t.id = eta.tag_id
  WHERE eta.entity_type = entity_type_param 
    AND eta.entity_id = entity_id_param
    AND t.is_active = true
  ORDER BY t.name;
END;
$$;

-- Note: We intentionally keep SECURITY DEFINER on critical security functions like:
-- - has_role (needs to check roles securely)
-- - assign_user_role/assign_role (needs admin privileges)
-- - encrypt_sensitive_data/decrypt_sensitive_data (needs access to encryption keys)
-- - check_rate_limit* functions (need system-level access)
-- - log_enhanced_security_event (needs elevated privileges for security logging)
-- - audit_* functions (need secure access for compliance)
-- - cleanup_* functions (need system-level cleanup access)
-- - All booking-related encryption functions (handle sensitive payment data)
-- - All profile encryption functions (handle sensitive personal data)

-- This approach follows security best practices by:
-- 1. Minimizing SECURITY DEFINER usage to only essential security operations
-- 2. Maintaining proper access control for sensitive operations
-- 3. Allowing normal user operations to run with user-level privileges
-- 4. Ensuring compliance with data protection regulations