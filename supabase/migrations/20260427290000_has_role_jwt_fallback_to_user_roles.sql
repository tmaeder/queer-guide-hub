-- has_role_jwt currently reads `user_role` claim from JWT, set by custom_access_token_hook.
-- If the auth hook isn't registered in Supabase Auth settings, or if a session predates hook
-- deployment, the claim is absent and admins get 403s on all has_role_jwt-gated tables.
-- Fall back to a direct user_roles lookup when the claim is missing so RLS works either way.
CREATE OR REPLACE FUNCTION public.has_role_jwt(required_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) ->> 'user_role')::app_role = required_role,
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (SELECT auth.uid()) AND role = required_role
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role_jwt(required_roles app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) ->> 'user_role')::app_role = ANY(required_roles),
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (SELECT auth.uid()) AND role = ANY(required_roles)
    ),
    false
  );
$$;
