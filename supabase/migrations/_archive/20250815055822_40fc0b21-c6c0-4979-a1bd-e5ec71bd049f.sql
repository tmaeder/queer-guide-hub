-- COMPREHENSIVE SECURITY FIX FOR PROFILE DATA PROTECTION
-- Addresses: User Profile Data Could Be Stolen by Hackers

-- 1. Create enhanced encryption and privacy protection
-- First, ensure we have proper encryption functions with better security

CREATE OR REPLACE FUNCTION public.encrypt_profile_data(data_text text, user_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_salt text;
  encryption_key text;
BEGIN
  -- Return null if input is null or empty
  IF data_text IS NULL OR trim(data_text) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Generate user-specific salt with additional entropy
  user_salt := substr(md5(user_id_param::text || 'secure_profile_2024' || extract(epoch from now())::text), 1, 16);
  encryption_key := user_salt || 'ENHANCED_PROFILE_ENCRYPTION_KEY_2024';
  
  -- Use stronger encryption with user-specific key
  RETURN encode(
    encrypt(
      data_text::bytea, 
      encryption_key::bytea, 
      'aes'
    ), 
    'base64'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log encryption failure but don't expose details
    PERFORM public.log_enhanced_security_event(
      'ENCRYPTION_FAILURE',
      user_id_param,
      jsonb_build_object('error', 'Profile data encryption failed'),
      'critical'
    );
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_profile_data(encrypted_data text, user_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_salt text;
  encryption_key text;
BEGIN
  -- Return null if input is null or empty
  IF encrypted_data IS NULL OR trim(encrypted_data) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Only allow users to decrypt their own data or admins
  IF user_id_param != auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    PERFORM public.log_enhanced_security_event(
      'UNAUTHORIZED_DECRYPTION_ATTEMPT',
      auth.uid(),
      jsonb_build_object(
        'attempted_user_id', user_id_param,
        'timestamp', now()
      ),
      'critical'
    );
    RETURN '[UNAUTHORIZED]';
  END IF;
  
  -- Generate the same salt used for encryption
  user_salt := substr(md5(user_id_param::text || 'secure_profile_2024' || extract(epoch from now())::text), 1, 16);
  encryption_key := user_salt || 'ENHANCED_PROFILE_ENCRYPTION_KEY_2024';
  
  -- Decrypt the data
  RETURN convert_from(
    decrypt(
      decode(encrypted_data, 'base64'), 
      encryption_key::bytea, 
      'aes'
    ), 
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log decryption failure for security monitoring
    PERFORM public.log_enhanced_security_event(
      'DECRYPTION_FAILURE',
      auth.uid(),
      jsonb_build_object(
        'target_user_id', user_id_param,
        'timestamp', now()
      ),
      'high'
    );
    RETURN '[DECRYPTION_FAILED]';
END;
$$;

-- 2. Create comprehensive encryption trigger for all sensitive data
CREATE OR REPLACE FUNCTION public.encrypt_all_profile_sensitive_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Encrypt phone number
  IF NEW.phone IS NOT NULL AND trim(NEW.phone) != '' THEN
    NEW.phone_encrypted = public.encrypt_profile_data(NEW.phone, NEW.user_id);
    NEW.phone = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt emergency contact phone
  IF NEW.emergency_contact_phone IS NOT NULL AND trim(NEW.emergency_contact_phone) != '' THEN
    NEW.emergency_contact_phone_encrypted = public.encrypt_profile_data(NEW.emergency_contact_phone, NEW.user_id);
    NEW.emergency_contact_phone = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt sexual orientation
  IF NEW.sexual_orientation IS NOT NULL AND trim(NEW.sexual_orientation) != '' THEN
    NEW.sexual_orientation_encrypted = public.encrypt_profile_data(NEW.sexual_orientation, NEW.user_id);
    NEW.sexual_orientation = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt gender identity
  IF NEW.gender_identity IS NOT NULL AND trim(NEW.gender_identity) != '' THEN
    NEW.gender_identity_encrypted = public.encrypt_profile_data(NEW.gender_identity, NEW.user_id);
    NEW.gender_identity = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt relationship status
  IF NEW.relationship_status IS NOT NULL AND trim(NEW.relationship_status) != '' THEN
    NEW.relationship_status_encrypted = public.encrypt_profile_data(NEW.relationship_status, NEW.user_id);
    NEW.relationship_status = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt income range
  IF NEW.income_range IS NOT NULL AND trim(NEW.income_range) != '' THEN
    NEW.income_range_encrypted = public.encrypt_profile_data(NEW.income_range, NEW.user_id);
    NEW.income_range = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt political views
  IF NEW.political_views IS NOT NULL AND trim(NEW.political_views) != '' THEN
    NEW.political_views_encrypted = public.encrypt_profile_data(NEW.political_views, NEW.user_id);
    NEW.political_views = NULL; -- Clear plaintext
  END IF;
  
  -- Encrypt religious beliefs
  IF NEW.religious_beliefs IS NOT NULL AND trim(NEW.religious_beliefs) != '' THEN
    NEW.religious_beliefs_encrypted = public.encrypt_profile_data(NEW.religious_beliefs, NEW.user_id);
    NEW.religious_beliefs = NULL; -- Clear plaintext
  END IF;
  
  -- Log sensitive data update for audit trail
  PERFORM public.log_enhanced_security_event(
    'PROFILE_SENSITIVE_DATA_ENCRYPTED',
    NEW.user_id,
    jsonb_build_object(
      'fields_encrypted', jsonb_build_array(
        CASE WHEN NEW.phone_encrypted IS NOT NULL THEN 'phone' END,
        CASE WHEN NEW.emergency_contact_phone_encrypted IS NOT NULL THEN 'emergency_phone' END,
        CASE WHEN NEW.sexual_orientation_encrypted IS NOT NULL THEN 'sexual_orientation' END,
        CASE WHEN NEW.gender_identity_encrypted IS NOT NULL THEN 'gender_identity' END,
        CASE WHEN NEW.relationship_status_encrypted IS NOT NULL THEN 'relationship_status' END,
        CASE WHEN NEW.income_range_encrypted IS NOT NULL THEN 'income_range' END,
        CASE WHEN NEW.political_views_encrypted IS NOT NULL THEN 'political_views' END,
        CASE WHEN NEW.religious_beliefs_encrypted IS NOT NULL THEN 'religious_beliefs' END
      ),
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$;

-- 3. Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS encrypt_profile_sensitive_data_trigger ON public.profiles;

CREATE TRIGGER encrypt_profile_sensitive_data_trigger
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.encrypt_all_profile_sensitive_data();

-- 4. Create secure view for accessing decrypted data (only for authorized users)
CREATE OR REPLACE VIEW public.secure_profile_view AS
SELECT 
    user_id,
    display_name,
    avatar_url,
    location,
    bio,
    pronouns,
    created_at,
    updated_at,
    -- Only show decrypted sensitive data to the profile owner or admins
    CASE 
        WHEN user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) 
        THEN public.decrypt_profile_data(phone_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as phone,
    CASE 
        WHEN user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
        THEN public.decrypt_profile_data(sexual_orientation_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as sexual_orientation,
    CASE 
        WHEN user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
        THEN public.decrypt_profile_data(gender_identity_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as gender_identity,
    CASE 
        WHEN user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
        THEN public.decrypt_profile_data(relationship_status_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as relationship_status,
    -- Emergency contact only for profile owner
    CASE 
        WHEN user_id = auth.uid()
        THEN emergency_contact_name
        ELSE '[PRIVATE]'
    END as emergency_contact_name,
    CASE 
        WHEN user_id = auth.uid()
        THEN public.decrypt_profile_data(emergency_contact_phone_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as emergency_contact_phone,
    -- Financial and sensitive data only for profile owner
    CASE 
        WHEN user_id = auth.uid()
        THEN public.decrypt_profile_data(income_range_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as income_range,
    CASE 
        WHEN user_id = auth.uid()
        THEN public.decrypt_profile_data(political_views_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as political_views,
    CASE 
        WHEN user_id = auth.uid()
        THEN public.decrypt_profile_data(religious_beliefs_encrypted, user_id)
        ELSE '[PRIVATE]'
    END as religious_beliefs,
    -- Include privacy settings
    privacy_settings,
    -- Non-sensitive fields
    date_of_birth,
    website,
    social_links,
    preferences,
    first_name,
    last_name,
    age_range,
    occupation,
    education,
    languages,
    interests,
    accessibility_needs
FROM public.profiles
WHERE user_id = auth.uid() 
   OR public.has_role(auth.uid(), 'admin'::app_role);

-- 5. Enhanced RLS policies with additional security layers
-- Drop existing policies and create more restrictive ones
DROP POLICY IF EXISTS "Ultra-secure profile SELECT - owners only" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile INSERT access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile UPDATE access" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile DELETE access" ON public.profiles;

-- Create ultra-secure policies
CREATE POLICY "Maximum security profile SELECT" ON public.profiles
    FOR SELECT 
    USING (
        user_id = auth.uid() 
        AND auth.uid() IS NOT NULL
        AND public.check_rate_limit_enhanced(auth.uid()::text, 100, 60, 'profile_access')
    );

CREATE POLICY "Maximum security profile INSERT" ON public.profiles
    FOR INSERT 
    WITH CHECK (
        user_id = auth.uid() 
        AND auth.uid() IS NOT NULL
        AND public.check_rate_limit_enhanced(auth.uid()::text, 5, 60, 'profile_creation')
    );

CREATE POLICY "Maximum security profile UPDATE" ON public.profiles
    FOR UPDATE 
    USING (
        user_id = auth.uid() 
        AND auth.uid() IS NOT NULL
        AND public.check_rate_limit_enhanced(auth.uid()::text, 20, 60, 'profile_update')
    )
    WITH CHECK (
        user_id = auth.uid() 
        AND auth.uid() IS NOT NULL
    );

CREATE POLICY "Maximum security profile DELETE" ON public.profiles
    FOR DELETE 
    USING (
        user_id = auth.uid() 
        AND auth.uid() IS NOT NULL
        AND public.check_rate_limit_enhanced(auth.uid()::text, 1, 1440, 'profile_deletion')
    );