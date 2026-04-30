-- Marketplace image_hashes → image_assets crosslink.
--
-- marketplace_listings.image_hashes (JSONB DEFAULT '[]', from migration
-- 20260415180000) was a placeholder column that no producer ever populated.
-- This migration wires it up so consumers can JOIN against image_assets
-- without rehashing URLs:
--
--   image_hashes = [
--     { "url": "<original>", "url_hash": "<sha256>", "sort_order": <0-indexed> },
--     ...
--   ]
--
-- where url_hash uses the same canonicalisation as the upsertImageAsset
-- helper at supabase/functions/_shared/image-assets.ts:93 — lowercase host,
-- strip query/hash, drop trailing slash from non-root paths. So
-- image_hashes.url_hash JOINs cleanly against image_assets.url_hash.
--
-- Approach: a BEFORE INSERT/UPDATE OF images trigger keeps the column in
-- sync automatically. Producers don't have to remember anything; existing
-- writers (commit_marketplace_staging_batch, AI enrichers, manual edits)
-- all benefit. A one-shot backfill at the end populates rows whose images[]
-- predates this migration.

-- ── URL canonicalisation helper ─────────────────────────────────────────────
--
-- SQL approximation of the JS canonicaliseUrl() in image-assets.ts. Returns
-- NULL on parse failure (caller should skip the URL). Handles the typical
-- image-CDN shape (https://host/path[?query][#hash]); doesn't fully replicate
-- WHATWG URL parsing edge cases (IPv6 brackets, %xx host decoding) — image
-- URLs from S3/Cloudflare/Pexels/etc. don't hit those.

create or replace function public.canonicalize_image_url(p_url text)
returns text language plpgsql immutable as $$
declare
  v_match text[];
  v_scheme text;
  v_host text;
  v_path text;
begin
  if p_url is null or p_url = '' then return null; end if;
  v_match := regexp_match(p_url, '^(https?)://([^/?#]+)(/[^?#]*)?');
  if v_match is null then return null; end if;
  v_scheme := v_match[1];
  v_host   := lower(v_match[2]);
  v_path   := coalesce(v_match[3], '/');
  -- Strip trailing slash from non-root paths (matches JS behavior at
  -- image-assets.ts:102 — pathname !== '/' && endsWith('/')).
  if length(v_path) > 1 and right(v_path, 1) = '/' then
    v_path := left(v_path, length(v_path) - 1);
  end if;
  return v_scheme || '://' || v_host || v_path;
end $$;

comment on function public.canonicalize_image_url(text) is
  'Canonicalise an image URL for hashing. SQL twin of '
  'supabase/functions/_shared/image-assets.ts:canonicaliseUrl. '
  'Returns NULL on unparseable input.';

-- ── image_hashes trigger function ───────────────────────────────────────────

create or replace function public.compute_marketplace_image_hashes()
returns trigger language plpgsql as $$
declare
  v_url   text;
  v_canon text;
  v_idx   int;
  v_out   jsonb := '[]'::jsonb;
begin
  if new.images is null or array_length(new.images, 1) is null then
    new.image_hashes := '[]'::jsonb;
    return new;
  end if;

  for v_idx in 1..array_length(new.images, 1) loop
    v_url := new.images[v_idx];
    if v_url is null or v_url = '' then continue; end if;
    v_canon := public.canonicalize_image_url(v_url);
    if v_canon is null then continue; end if;
    v_out := v_out || jsonb_build_object(
      'url',        v_url,
      'url_hash',   encode(extensions.digest(v_canon, 'sha256'), 'hex'),
      'sort_order', v_idx - 1
    );
  end loop;

  new.image_hashes := v_out;
  return new;
end $$;

drop trigger if exists marketplace_listings_image_hashes_sync on public.marketplace_listings;

create trigger marketplace_listings_image_hashes_sync
  before insert or update of images on public.marketplace_listings
  for each row execute function public.compute_marketplace_image_hashes();

comment on trigger marketplace_listings_image_hashes_sync on public.marketplace_listings is
  'Keeps marketplace_listings.image_hashes in sync with images[] so consumers '
  'can JOIN against image_assets.url_hash without rehashing.';

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Touch existing rows whose image_hashes is empty but images[] is populated;
-- the trigger fires and computes the JSONB. The WHERE clause keeps this from
-- rewriting rows the trigger already covered (idempotent re-runs).

update public.marketplace_listings
   set images = images
 where (image_hashes is null or jsonb_array_length(image_hashes) = 0)
   and array_length(images, 1) is not null;
