-- RECOVERED, not authored. This SQL was applied to prod on 2026-08-23 06:12
-- and had no file in the repo, on main, or in any local worktree, and no open
-- PR carried it. Migration drift blocks `supabase db push` for the WHOLE repo,
-- so every open PR was failing `migration-versions` as collateral.
--
-- Body is a byte-for-byte recovery from
-- supabase_migrations.schema_migrations.statements at version 20260823061200
-- (2,169 chars, 1 statement), per the recovery procedure in CLAUDE.md. It is
-- already live: applying it changes nothing, it only lets db push match the
-- version and move on.
--
-- Second occurrence of this class in one day (20260822170452 was the first).
-- `apply_migration` is not done until the file is MERGED TO MAIN.

alter table public.marketplace_brands
  add column if not exists logo_on_ink boolean not null default false;

comment on column public.marketplace_brands.logo_on_ink is
  'True when logo_url has no dark pixels and would be invisible on the paper plate. Written by enrich-logos from the mirrored bytes; defaults false because an unmeasured logo must never be moved onto ink on a guess.';

drop function if exists public.get_marketplace_brand(text);

create function public.get_marketplace_brand(p_slug text)
returns table (
  slug text,
  display_name text,
  brand_key text,
  product_count integer,
  website text,
  logo_url text,
  logo_on_ink boolean,
  story text,
  ownership_tags text[],
  is_approved boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT
    b.slug,
    b.display_name,
    b.brand_key,
    b.product_count,
    b.website,
    b.logo_url,
    coalesce(b.logo_on_ink, false),
    CASE WHEN b.status = 'approved' THEN b.story END,
    CASE WHEN b.status = 'approved' THEN b.ownership_tags ELSE '{}'::text[] END,
    b.status = 'approved'
  FROM public.marketplace_brands b
  WHERE b.slug = p_slug
  LIMIT 1;
$$;

grant execute on function public.get_marketplace_brand(text) to anon, authenticated, service_role;

drop function if exists public.get_marketplace_spotlight_brands(integer);

create function public.get_marketplace_spotlight_brands(p_limit integer default 8)
returns table (
  slug text,
  display_name text,
  product_count integer,
  logo_url text,
  logo_on_ink boolean,
  ownership_tags text[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT b.slug, b.display_name, b.product_count, b.logo_url,
         coalesce(b.logo_on_ink, false), b.ownership_tags
  FROM public.marketplace_brands b
  WHERE b.status = 'approved'
    AND b.ownership_tags && ARRAY['queer_owned','trans_owned']
    AND b.slug IS NOT NULL
    AND b.product_count > 0
  ORDER BY b.is_spotlight DESC, b.product_count DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 8), 24));
$$;

grant execute on function public.get_marketplace_spotlight_brands(integer) to anon, authenticated, service_role;
