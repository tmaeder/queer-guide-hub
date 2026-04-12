-- Fix: public.assign_user_role() crashed with
-- "column reference user_id is ambiguous" on ON CONFLICT because the
-- PL/pgSQL parameter was named user_id, the same as the target column.
-- PostgreSQL cannot resolve the conflict target against a function param.
-- Keep the public signature (frontend passes { user_id, role_name }) but
-- alias to local variables inside the body so the INSERT/ON CONFLICT is
-- unambiguous.

CREATE OR REPLACE FUNCTION public.assign_user_role(user_id uuid, role_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  _target_user_id uuid := user_id;
  _target_role public.app_role := role_name::public.app_role;
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
  VALUES (_target_user_id, _target_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$function$;
