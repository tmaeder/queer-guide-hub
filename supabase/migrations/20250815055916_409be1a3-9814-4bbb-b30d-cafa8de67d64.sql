-- Fix the Security Definer View issue caused by the secure_profile_view

-- Drop the problematic view that's using security definer functions
DROP VIEW IF EXISTS public.secure_profile_view;

-- Create a simpler, more secure approach using a function instead of a view
CREATE OR REPLACE FUNCTION public.get_secure_profile_data(target_user_id uuid DEFAULT NULL)
RETURNS TABLE(
    user_id uuid,
    display_name text,
    avatar_url text,
    location text,
    bio text,
    pronouns text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text,
    sexual_orientation text,
    gender_identity text,
    relationship_status text,
    emergency_contact_name text,
    emergency_contact_phone text,
    income_range text,
    political_views text,
    religious_beliefs text,
    privacy_settings jsonb,
    date_of_birth date,
    website text,
    social_links jsonb,
    preferences jsonb,
    first_name text,
    last_name text,
    age_range text,
    occupation text,
    education text,
    languages jsonb,
    interests jsonb,
    accessibility_needs text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    profile_user_id uuid;
    requesting_user_id uuid;
BEGIN
    requesting_user_id := auth.uid();
    profile_user_id := COALESCE(target_user_id, requesting_user_id);
    
    -- Only allow access to own profile or admin access
    IF profile_user_id != requesting_user_id AND NOT public.has_role(requesting_user_id, 'admin'::app_role) THEN
        RAISE EXCEPTION 'Access denied: Can only view own profile';
    END IF;
    
    -- Rate limiting
    IF NOT public.check_rate_limit_enhanced(requesting_user_id::text, 50, 60, 'secure_profile_access') THEN
        RAISE EXCEPTION 'Rate limit exceeded for profile access';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.user_id,
        p.display_name,
        p.avatar_url,
        p.location,
        p.bio,
        p.pronouns,
        p.created_at,
        p.updated_at,
        -- Decrypt sensitive data only for authorized users
        CASE 
            WHEN profile_user_id = requesting_user_id OR public.has_role(requesting_user_id, 'admin'::app_role)
            THEN public.decrypt_profile_data(p.phone_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as phone,
        CASE 
            WHEN profile_user_id = requesting_user_id OR public.has_role(requesting_user_id, 'admin'::app_role)
            THEN public.decrypt_profile_data(p.sexual_orientation_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as sexual_orientation,
        CASE 
            WHEN profile_user_id = requesting_user_id OR public.has_role(requesting_user_id, 'admin'::app_role)
            THEN public.decrypt_profile_data(p.gender_identity_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as gender_identity,
        CASE 
            WHEN profile_user_id = requesting_user_id OR public.has_role(requesting_user_id, 'admin'::app_role)
            THEN public.decrypt_profile_data(p.relationship_status_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as relationship_status,
        -- Emergency contact only for profile owner
        CASE 
            WHEN profile_user_id = requesting_user_id
            THEN p.emergency_contact_name
            ELSE '[PRIVATE]'
        END as emergency_contact_name,
        CASE 
            WHEN profile_user_id = requesting_user_id
            THEN public.decrypt_profile_data(p.emergency_contact_phone_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as emergency_contact_phone,
        -- Financial and highly sensitive data only for profile owner
        CASE 
            WHEN profile_user_id = requesting_user_id
            THEN public.decrypt_profile_data(p.income_range_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as income_range,
        CASE 
            WHEN profile_user_id = requesting_user_id
            THEN public.decrypt_profile_data(p.political_views_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as political_views,
        CASE 
            WHEN profile_user_id = requesting_user_id
            THEN public.decrypt_profile_data(p.religious_beliefs_encrypted, p.user_id)
            ELSE '[PRIVATE]'
        END as religious_beliefs,
        p.privacy_settings,
        p.date_of_birth,
        p.website,
        p.social_links,
        p.preferences,
        p.first_name,
        p.last_name,
        p.age_range,
        p.occupation,
        p.education,
        p.languages,
        p.interests,
        p.accessibility_needs
    FROM public.profiles p
    WHERE p.user_id = profile_user_id;
END;
$$;

-- Create additional data protection triggers
CREATE OR REPLACE FUNCTION public.prevent_profile_data_exposure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Log all profile access attempts for monitoring
    PERFORM public.log_enhanced_security_event(
        'PROFILE_DATA_ACCESS',
        auth.uid(),
        jsonb_build_object(
            'target_profile', NEW.user_id,
            'access_type', TG_OP,
            'timestamp', now()
        ),
        'medium'
    );
    
    -- Ensure privacy settings are properly set for new profiles
    IF TG_OP = 'INSERT' AND NEW.privacy_settings IS NULL THEN
        NEW.privacy_settings = jsonb_build_object(
            'profile_visibility', 'private',
            'email_visible', false,
            'phone_visible', false,
            'sexual_orientation_public', false,
            'gender_identity_public', false,
            'relationship_status_public', false,
            'income_range_public', false,
            'political_views_public', false,
            'religious_beliefs_public', false,
            'emergency_contact_public', false
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Add the privacy protection trigger
DROP TRIGGER IF EXISTS prevent_profile_data_exposure_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_data_exposure_trigger
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_data_exposure();