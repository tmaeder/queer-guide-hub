-- DAM: make access_level='partner' mean the `partner` ROLE (or staff), not
-- "any authenticated user". Re-declares the three partner branches from
-- 20260724250000_dam_asset_governance.sql. Public + internal branches unchanged.
-- Runs after 20260725190000 committed the 'partner' enum label.

-- image_assets
DROP POLICY IF EXISTS image_assets_select ON public.image_assets;
CREATE POLICY image_assets_select ON public.image_assets FOR SELECT USING (
  (status = 'active' AND access_level = 'public')
  OR (status = 'active' AND access_level = 'partner'
      AND (SELECT public.has_any_role_jwt(ARRAY['partner','admin','moderator','editor']::public.app_role[])))
  OR (SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]))
);

-- cms_media
DROP POLICY IF EXISTS "Public media viewable by all" ON public.cms_media;
CREATE POLICY "Public media viewable by all" ON public.cms_media FOR SELECT USING (
  access_level = 'public'
  OR (access_level = 'partner'
      AND (SELECT public.has_any_role_jwt(ARRAY['partner','admin','moderator','editor']::public.app_role[])))
  OR (SELECT public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]))
);

-- dam-private storage read (partner/ prefix now needs the partner role, not any authed)
DROP POLICY IF EXISTS dam_private_read ON storage.objects;
CREATE POLICY dam_private_read ON storage.objects FOR SELECT USING (
  bucket_id = 'dam-private' AND (
    public.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[])
    OR ((storage.foldername(name))[1] = 'partner'
        AND public.has_any_role_jwt(ARRAY['partner','admin','moderator','editor']::public.app_role[]))
  )
);
