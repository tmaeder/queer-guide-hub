-- Simple way to assign admin role to a user by email
-- Usage: SELECT assign_first_admin('user@example.com');

-- Also create a simpler function to assign admin by user ID if needed
CREATE OR REPLACE FUNCTION assign_admin_by_id(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;