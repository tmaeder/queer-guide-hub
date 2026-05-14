-- Grant SELECT on image_assets and image_asset_links to authenticated/anon
-- so PostgREST exposes them (RLS policies already gate row visibility).

grant select on public.image_assets to authenticated, anon;
grant select on public.image_asset_links to authenticated, anon;
