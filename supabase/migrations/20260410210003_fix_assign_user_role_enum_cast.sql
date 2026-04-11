-- Fix: assign_user_role(role_name text) was inserting text into an app_role
-- enum column without a cast, causing all role assignments from the admin UI
-- to fail with a type mismatch error. Add explicit cast to public.app_role.
CREATE OR REPLACE FUNCTION public.assign_user_role(user_id uuid, role_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  caller_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  ) INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (assign_user_role.user_id, assign_user_role.role_name::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$function$;
