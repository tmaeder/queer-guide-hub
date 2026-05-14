-- Fix search path security warnings for profile security functions

-- Fix ensure_profile_privacy_defaults function
CREATE OR REPLACE FUNCTION ensure_profile_privacy_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Set secure defaults for privacy settings if not provided
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Fix can_view_sensitive_profile_data function
CREATE OR REPLACE FUNCTION can_view_sensitive_profile_data(
  profile_user_id uuid, 
  requesting_user_id uuid,
  privacy_field text
)
RETURNS boolean AS $$
BEGIN
  -- Users can always see their own data
  IF profile_user_id = requesting_user_id THEN
    RETURN true;
  END IF;
  
  -- Check privacy settings for the specific field
  RETURN COALESCE(
    (SELECT (privacy_settings ->> privacy_field)::boolean 
     FROM public.profiles 
     WHERE user_id = profile_user_id),
    false -- Default to private if setting not found
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO '';