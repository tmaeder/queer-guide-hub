-- Insert admin role for the first user (replace with actual user ID after user signs up)
-- This is a bootstrap admin - you'll need to update the user_id after creating the user account

-- First, let's check if we have any users and assign admin to the first one
-- Or we can create a specific admin role assignment

-- For now, let's create a function to easily assign the first admin
CREATE OR REPLACE FUNCTION assign_first_admin(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get user ID from auth.users by email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;