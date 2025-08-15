-- Fix critical privacy vulnerability in user_photos table
-- Remove ALL existing policies first to avoid conflicts

DROP POLICY IF EXISTS "User photos viewable by authenticated users" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage own photos" ON public.user_photos;
DROP POLICY IF EXISTS "user_photos read own" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can manage all photos" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can insert photos" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can update any photo" ON public.user_photos;
DROP POLICY IF EXISTS "Admins can delete any photo" ON public.user_photos;
DROP POLICY IF EXISTS "Users can delete own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can update own photos" ON public.user_photos;

-- Add privacy controls to profiles table if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS photos_visibility text DEFAULT 'private' 
CHECK (photos_visibility IN ('private', 'friends', 'public'));

-- Create secure, privacy-focused policies for user_photos

-- 1. Users can only manage their own photos
CREATE POLICY "Users manage own photos"
ON public.user_photos
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Users can view their own photos OR public photos based on strict privacy controls
CREATE POLICY "Users view photos with privacy controls"
ON public.user_photos
FOR SELECT
TO authenticated
USING (
    (auth.uid() = user_id) OR  -- Users can always view their own photos
    (is_public = true AND EXISTS(  -- Public photos only if profile explicitly allows it
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = user_photos.user_id 
        AND p.photos_visibility = 'public'
    )) OR
    (is_public = true AND EXISTS(  -- Friends-only photos if users are connected
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = user_photos.user_id 
        AND p.photos_visibility = 'friends'
        AND EXISTS(
            SELECT 1 FROM public.user_relationships ur
            WHERE ((ur.user_id = user_photos.user_id AND ur.target_user_id = auth.uid()) OR
                   (ur.user_id = auth.uid() AND ur.target_user_id = user_photos.user_id))
            AND ur.status = 'accepted'
        )
    ))
);

-- 3. Admins have full access for moderation
CREATE POLICY "Admins manage all photos for moderation"
ON public.user_photos
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add audit logging for photo access
CREATE OR REPLACE FUNCTION public.log_user_photo_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Log photo operations for security monitoring
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

-- Create trigger for photo operations logging
DROP TRIGGER IF EXISTS log_user_photo_access_trigger ON public.user_photos;
CREATE TRIGGER log_user_photo_access_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.user_photos
    FOR EACH ROW EXECUTE FUNCTION public.log_user_photo_access();