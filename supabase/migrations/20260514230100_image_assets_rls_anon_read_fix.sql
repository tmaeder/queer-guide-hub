-- The image_assets / image_asset_links admin_read RLS policies reference
-- public.user_roles, but anon has no SELECT grant on user_roles. PostgREST
-- evaluates EVERY permissive policy and short-circuits on the permission
-- error, so even rows that public_read would have allowed fail with
-- "permission denied for table user_roles".
--
-- Replace those admin_read policies with the SECURITY DEFINER helper
-- has_role_jwt(), which reads the role from the JWT claims and doesn't
-- need a user_roles SELECT grant.

drop policy if exists image_assets_admin_read on public.image_assets;
create policy image_assets_admin_read on public.image_assets
  for select using (
    public.has_role_jwt('admin'::public.app_role)
    or public.has_role_jwt('moderator'::public.app_role)
  );

drop policy if exists image_asset_links_admin_read on public.image_asset_links;
create policy image_asset_links_admin_read on public.image_asset_links
  for select using (
    public.has_role_jwt('admin'::public.app_role)
    or public.has_role_jwt('moderator'::public.app_role)
  );
