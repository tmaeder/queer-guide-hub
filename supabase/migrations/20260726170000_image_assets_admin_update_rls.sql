-- DAM bug: image_assets had ONLY a SELECT policy, so every client-side write from
-- the admin Media Library — access level, brand category, alt text, star, soft
-- delete — was silently blocked by RLS (0 rows affected) while PostgREST returned
-- success, so the UI showed a misleading "Saved" toast and nothing persisted.
-- (cms_media already had an admin/uploader UPDATE policy; template_status writes
-- go through the SECURITY DEFINER set_template_status RPC.)
-- Add an admin UPDATE policy so DAM governance on image_assets actually persists.
DROP POLICY IF EXISTS image_assets_admin_update ON public.image_assets;
CREATE POLICY image_assets_admin_update ON public.image_assets FOR UPDATE
  USING ((SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])))
  WITH CHECK ((SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])));
