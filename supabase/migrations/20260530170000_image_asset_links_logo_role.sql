-- Add 'logo' to the image_asset_links.role CHECK so logo-CDN / brand-mark
-- images can be linked as logos rather than masquerading as covers/heroes.
-- Part of the image-selection hardening (logo suppression).

alter table public.image_asset_links
  drop constraint if exists image_asset_links_role_check;

alter table public.image_asset_links
  add constraint image_asset_links_role_check
  check (role in ('cover','gallery','thumbnail','social','og','square','hero','logo'));
