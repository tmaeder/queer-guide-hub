-- Fix critical privacy vulnerability in user_photos table
-- Currently ALL authenticated users can see ALL photos - this is dangerous!

-- First, remove the dangerous policy that exposes all photos
DROP POLICY IF EXISTS "User photos viewable by authenticated users" ON public.user_photos;

-- Clean up duplicate policies
DROP POLICY IF EXISTS "Users can delete own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can update own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage own photos" ON public.user_photos;
DROP POLICY IF EXISTS "user_photos read own" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can insert photos" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can update any photo" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can delete any photo" ON public.user_photos;

-- Create secure, privacy-focused policies

-- 1. Users can only view their own photos OR public photos of others
CREATE POLICY "Users can view own photos or public photos"
ON public.user_photos
FOR SELECT
TO authenticated
USING (
    (auth.uid() = user_id) OR 
    (is_public = true)
);

-- 2. Users can only manage their own photos
CREATE POLICY "Users can manage their own photos"
ON public.user_photos
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Admins have full access for moderation
CREATE POLICY "Admins can manage all photos"
ON public.user_photos
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add privacy controls to profiles table if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS photos_visibility text DEFAULT 'private' 
CHECK (photos_visibility IN ('private', 'friends', 'public'));

-- Add function to check photo visibility based on user relationship
CREATE OR REPLACE FUNCTION public.can_view_user_photos(target_user_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    photos_setting text;
    are_friends boolean := false;
BEGIN
    -- User can always view their own photos
    IF target_user_id = viewer_id THEN
        RETURN true;
    END IF;
    
    -- Get the target user's photo visibility setting
    SELECT photos_visibility INTO photos_setting
    FROM public.profiles 
    WHERE user_id = target_user_id;
    
    -- If photos are public, allow access
    IF photos_setting = 'public' THEN
        RETURN true;
    END IF;
    
    -- If photos are private, deny access
    IF photos_setting = 'private' THEN
        RETURN false;
    END IF;
    
    -- If photos are friends-only, check friendship
    IF photos_setting = 'friends' THEN
        SELECT EXISTS(
            SELECT 1 FROM public.user_relationships
            WHERE ((user_id = target_user_id AND friend_id = viewer_id) OR
                   (user_id = viewer_id AND friend_id = target_user_id))
            AND status = 'accepted'
        ) INTO are_friends;
        
        RETURN are_friends;
    END IF;
    
    -- Default to private
    RETURN false;
END;
$$;

-- Update the photo viewing policy to use the new privacy function
DROP POLICY IF EXISTS "Users can view own photos or public photos" ON public.user_photos;

CREATE POLICY "Users can view photos based on privacy settings"
ON public.user_photos
FOR SELECT
TO authenticated
USING (
    (auth.uid() = user_id) OR 
    (is_public = true AND public.can_view_user_photos(user_id, auth.uid()))
);

-- Add audit logging for photo access
CREATE OR REPLACE FUNCTION public.log_photo_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Log photo access for security monitoring
    PERFORM public.log_enhanced_security_event(
        'USER_PHOTO_ACCESS',
        COALESCE(NEW.user_id, OLD.user_id),
        jsonb_build_object(
            'operation', TG_OP,
            'photo_id', COALESCE(NEW.id, OLD.id),
            'accessed_by', auth.uid(),
            'is_public', COALESCE(NEW.is_public, OLD.is_public),
            'timestamp', now()
        ),
        'low'
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for photo access logging
CREATE TRIGGER log_photo_access_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.user_photos
    FOR EACH ROW EXECUTE FUNCTION public.log_photo_access();