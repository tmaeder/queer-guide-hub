-- Native associations delegate authority for a host. Keep the shared first-party
-- host owned by the immutable Queer Guide workspace; future tenants must bind a
-- custom domain through the existing tenant-aware FK. Per-host app and App Clip
-- uniqueness remains global because a domain/hostname has exactly one owner.
ALTER TABLE public.redirect_native_apps
 ADD CONSTRAINT redirect_native_apps_builtin_host_workspace
 CHECK(domain_id IS NOT NULL OR workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid);
