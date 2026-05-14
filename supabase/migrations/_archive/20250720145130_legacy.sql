-- Get the current authenticated user and assign admin role
-- This will assign admin role to the currently authenticated user

DO $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Get current authenticated user (this will be the user running this migration)
    SELECT auth.uid() INTO current_user_id;
    
    -- If there's a user authenticated, make them admin
    IF current_user_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (current_user_id, 'admin'::app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE 'Admin role assigned to user: %', current_user_id;
    ELSE
        RAISE NOTICE 'No authenticated user found. Please run this migration while logged in.';
    END IF;
END $$;