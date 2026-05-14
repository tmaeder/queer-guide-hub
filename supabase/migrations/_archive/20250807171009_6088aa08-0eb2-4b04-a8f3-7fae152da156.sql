-- Complete privacy and audit implementation

-- 7. Create function to check if user can view sensitive profile data
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(
  profile_user_id UUID, 
  requesting_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    -- User can always see their own sensitive data
    WHEN profile_user_id = requesting_user_id THEN true
    -- Check if profile owner has made sensitive data public
    WHEN EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = profile_user_id 
      AND privacy_settings->>'sexual_orientation_public' = 'true'
      AND privacy_settings->>'gender_identity_public' = 'true'
    ) THEN true
    -- Admins can view sensitive data
    WHEN public.has_role(requesting_user_id, 'admin') THEN true
    ELSE false
  END;
$$;

-- 8. Add privacy validation trigger
CREATE OR REPLACE FUNCTION public.validate_profile_privacy_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Ensure privacy settings are valid JSON with required keys
  IF NEW.privacy_settings IS NOT NULL THEN
    -- Check that required privacy keys exist
    IF NOT (NEW.privacy_settings ? 'sexual_orientation_public' AND
            NEW.privacy_settings ? 'gender_identity_public' AND
            NEW.privacy_settings ? 'pronouns_public' AND
            NEW.privacy_settings ? 'bio_public' AND
            NEW.privacy_settings ? 'location_public') THEN
      RAISE EXCEPTION 'Privacy settings must include all required fields';
    END IF;
    
    -- Log significant privacy changes
    IF OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
      PERFORM public.log_enhanced_security_event(
        'PRIVACY_SETTINGS_CHANGED',
        auth.uid(),
        jsonb_build_object(
          'old_settings', OLD.privacy_settings,
          'new_settings', NEW.privacy_settings,
          'timestamp', now()
        ),
        'low'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for privacy validation
DROP TRIGGER IF EXISTS validate_privacy_settings_trigger ON public.profiles;
CREATE TRIGGER validate_privacy_settings_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_privacy_update();

-- 9. Set default privacy settings for existing profiles
UPDATE public.profiles 
SET privacy_settings = '{
  "sexual_orientation_public": false,
  "gender_identity_public": false,
  "pronouns_public": true,
  "bio_public": true,
  "location_public": true
}'::jsonb
WHERE privacy_settings IS NULL;

-- 10. Create function to set default privacy settings
CREATE OR REPLACE FUNCTION public.set_default_privacy_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Set default privacy settings if not provided
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings := '{
      "sexual_orientation_public": false,
      "gender_identity_public": false,
      "pronouns_public": true,
      "bio_public": true,
      "location_public": true
    }'::jsonb;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for setting default privacy settings
DROP TRIGGER IF EXISTS set_default_privacy_trigger ON public.profiles;
CREATE TRIGGER set_default_privacy_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_privacy_settings();