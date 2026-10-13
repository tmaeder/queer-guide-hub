-- The inventory must include disabled manual rules and expired username aliases.
-- Existing public SELECT policies hide them even from authenticated admins.
-- Preserve public/ordinary member visibility and reuse the established admin check.
CREATE POLICY redirects_admin_inventory_read
  ON public.redirects FOR SELECT TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));

CREATE POLICY username_redirects_admin_inventory_read
  ON public.username_redirects FOR SELECT TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));
