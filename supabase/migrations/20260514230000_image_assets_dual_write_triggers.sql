-- Continuous dual-write of image_assets for news_articles + marketplace_listings.
--
-- Until now the registry was only populated by a one-shot backfill
-- (20260429230000_image_assets_backfill.sql). New rows committed since then
-- bypassed the registry, so the image-ingest worker had nothing to mirror
-- to R2 — which is why so many news/marketplace images still hotlink to
-- third-party CDNs that 401 / 404.
--
-- This migration:
--   1. Adds a SECURITY DEFINER helper public._image_assets_upsert_link(
--        entity_type, entity_id, url, role, source
--      ) that inserts the asset (keyed on SHA-256 of canonical URL) plus
--      the polymorphic link.
--   2. Adds AFTER INSERT OR UPDATE triggers on news_articles +
--      marketplace_listings that call the helper for the cover image.
--   3. Runs a one-shot backfill pass for any active rows that already
--      have image URLs but no image_asset_links yet.

create extension if not exists pgcrypto;

-- ── Helper ──────────────────────────────────────────────────────────────────
create or replace function public._image_assets_upsert_link(
  p_entity_type text,
  p_entity_id   uuid,
  p_url         text,
  p_role        text default 'cover',
  p_source      text default 'pipeline'
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_canonical text;
  v_hash      text;
  v_asset_id  uuid;
begin
  if p_url is null or btrim(p_url) = '' then return; end if;
  v_canonical := public.canonicalise_image_url(p_url);
  if v_canonical is null then return; end if;
  v_hash := encode(digest(v_canonical, 'sha256'), 'hex');

  insert into public.image_assets (url_hash, url, source, last_seen_at)
  values (v_hash, v_canonical, p_source, now())
  on conflict (url_hash) do update set last_seen_at = excluded.last_seen_at
  returning id into v_asset_id;

  if v_asset_id is null then
    select id into v_asset_id from public.image_assets where url_hash = v_hash;
  end if;
  if v_asset_id is null then return; end if;

  insert into public.image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
  values (v_asset_id, p_entity_type, p_entity_id, p_role, 0)
  on conflict (asset_id, entity_type, entity_id, role) do nothing;
end $$;

revoke all on function public._image_assets_upsert_link(text, uuid, text, text, text) from public;
grant execute on function public._image_assets_upsert_link(text, uuid, text, text, text)
  to service_role;

-- ── news_articles trigger ──────────────────────────────────────────────────
create or replace function public.tg_news_articles_sync_image_assets()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if NEW.image_url is null or btrim(NEW.image_url) = '' then return NEW; end if;
  if TG_OP = 'UPDATE'
     and NEW.image_url is not distinct from OLD.image_url then
    return NEW;
  end if;
  perform public._image_assets_upsert_link(
    'news_article', NEW.id, NEW.image_url, 'cover', 'news_pipeline'
  );
  return NEW;
exception when others then
  -- Never block the underlying entity commit; image registry is best-effort.
  raise warning 'news_articles image_assets sync failed for %: %', NEW.id, sqlerrm;
  return NEW;
end $$;

drop trigger if exists news_articles_sync_image_assets on public.news_articles;
create trigger news_articles_sync_image_assets
  after insert or update of image_url on public.news_articles
  for each row execute function public.tg_news_articles_sync_image_assets();

-- ── marketplace_listings trigger ───────────────────────────────────────────
create or replace function public.tg_marketplace_listings_sync_image_assets()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
begin
  v_url := NULL;
  if NEW.images is not null and array_length(NEW.images, 1) >= 1 then
    v_url := NEW.images[1];
  end if;
  if v_url is null or btrim(v_url) = '' then return NEW; end if;
  if TG_OP = 'UPDATE'
     and NEW.images is not distinct from OLD.images then
    return NEW;
  end if;
  perform public._image_assets_upsert_link(
    'marketplace_listing', NEW.id, v_url, 'cover', 'marketplace_pipeline'
  );
  return NEW;
exception when others then
  raise warning 'marketplace_listings image_assets sync failed for %: %', NEW.id, sqlerrm;
  return NEW;
end $$;

drop trigger if exists marketplace_listings_sync_image_assets on public.marketplace_listings;
create trigger marketplace_listings_sync_image_assets
  after insert or update of images on public.marketplace_listings
  for each row execute function public.tg_marketplace_listings_sync_image_assets();

-- ── One-shot backfill for rows missing links ───────────────────────────────
-- News: last 60 days of articles with an image_url and no current link.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select n.id, n.image_url
    from public.news_articles n
    where n.image_url is not null and n.image_url <> ''
      and n.published_at > now() - interval '60 days'
      and not exists (
        select 1 from public.image_asset_links iax
        where iax.entity_type = 'news_article'
          and iax.entity_id = n.id
      )
  loop
    perform public._image_assets_upsert_link(
      'news_article', r.id, r.image_url, 'cover', 'news_pipeline_backfill'
    );
    n := n + 1;
  end loop;
  raise notice 'news backfill: % rows linked', n;
end $$;

-- Marketplace: all active listings with images[1] and no current link.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select m.id, m.images[1] as img
    from public.marketplace_listings m
    where m.images is not null and array_length(m.images, 1) >= 1
      and m.status = 'active'
      and not exists (
        select 1 from public.image_asset_links iax
        where iax.entity_type = 'marketplace_listing'
          and iax.entity_id = m.id
      )
  loop
    perform public._image_assets_upsert_link(
      'marketplace_listing', r.id, r.img, 'cover', 'marketplace_pipeline_backfill'
    );
    n := n + 1;
  end loop;
  raise notice 'marketplace backfill: % rows linked', n;
end $$;
