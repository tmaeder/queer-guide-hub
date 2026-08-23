-- (Also recovered onto main independently as #2980 while this branch was open —
-- same statements byte-for-byte, generic header. This is the authored original;
-- the rationale below is the part worth keeping. The lesson stands either way:
-- `apply_migration` is not done until the file is MERGED TO MAIN.)
--
-- Which brand logos need an INK plate instead of the paper one.
--
-- `--color-logo-plate` is paper in both themes, because a merchant logo is
-- usually a transparent PNG drawn for a light ground. Measured across the 80
-- logos the first sweep mirrored, **seven contain no dark pixel at all** —
-- Automic Gold (twice), Good Boy Underwear, Jeuf, Nattaup, Provocateur,
-- SUPAWEAR. Those render as an empty square.
--
-- The three CSS escapes were all built and compared side by side before this
-- column was added, and none of them works: a blurred edge barely rescues a
-- white mark; a hard 1px outline rescues it but fattens every thin dark
-- wordmark into a smear; an ink plate is perfect for white marks and erases
-- every dark one. There is no polarity-agnostic treatment, so the polarity has
-- to be known per row — hence a column rather than a class.
--
-- It is DERIVED, and its writer is `enrich-logos`: the sweep decodes the PNG it
-- just mirrored (`_shared/png-luminance.ts`) and stores the answer beside the
-- url it describes, in the same UPDATE. A logo it cannot read (JPEG, SVG,
-- interlaced) stays false — the paper plate is right for almost everything, and
-- a wrong ink plate erases a dark wordmark completely.

alter table public.marketplace_brands
  add column if not exists logo_on_ink boolean not null default false;

comment on column public.marketplace_brands.logo_on_ink is
  'True when logo_url has no dark pixels and would be invisible on the paper plate. Written by enrich-logos from the mirrored bytes; defaults false because an unmeasured logo must never be moved onto ink on a guess.';

-- The maker page reads through this RPC, so the column has to travel with it.
-- DROP first: adding a column to a RETURNS TABLE changes the return type, and
-- CREATE OR REPLACE refuses that ("cannot change return type of existing
-- function"). The grant below is not optional afterwards — dropping takes the
-- function's privileges with it, and anonymous visitors read this on every
-- maker page.
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

-- The weekly spotlight reads its own RPC and needs the flag for the same reason.
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
