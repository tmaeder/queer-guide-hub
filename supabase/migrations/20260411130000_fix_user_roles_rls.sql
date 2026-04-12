-- Fix: admins couldn't read, insert, update, or delete roles from the
-- admin console because RLS relied on has_role_jwt(), which requires
-- the custom_access_token_hook to populate a 'user_role' JWT claim.
-- That pipeline is fragile and currently broken. Switch to the existing
-- public.has_role() SECURITY DEFINER helper, which does a direct
-- user_roles lookup and does not depend on JWT claims.

DROP POLICY IF EXISTS "User roles read"   ON public.user_roles;
DROP POLICY IF EXISTS "User roles insert" ON public.user_roles;
DROP POLICY IF EXISTS "User roles update" ON public.user_roles;
DROP POLICY IF EXISTS "User roles delete" ON public.user_roles;

CREATE POLICY "User roles read"
  ON public.user_roles FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "User roles insert"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "User roles update"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "User roles delete"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
