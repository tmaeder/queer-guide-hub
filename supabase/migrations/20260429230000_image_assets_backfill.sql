-- Wave B.2: image_assets backfill from existing entity columns
--
-- Populates image_assets + image_asset_links for every existing image URL
-- across venues, events, marketplace_listings, personalities, queer_villages,
-- news_articles, unified_tags. URL-hash dedup only — perceptual hash is
-- punted (Q6 recommendation). Idempotent: ON CONFLICT DO NOTHING against the
-- url_hash unique on image_assets and the composite PK on image_asset_links.
--
-- One-shot: this migration walks each entity table once. New images
-- arriving after this migration are handled by the dual-write helper from
-- Wave B.1 (#176).

create extension if not exists pgcrypto;

-- ── Canonical URL helper (sql) ──────────────────────────────────────────────
-- Postgres-side equivalent of canonicaliseUrl() in
-- supabase/functions/_shared/image-assets.ts:
--   - trim
--   - drop ?query and #hash
--   - lowercase host (best-effort: split on first /, lowercase the
--     scheme://host part, leave the path untouched)
--   - drop trailing slash if path is non-empty
create or replace function public.canonicalise_image_url(p_url text)
returns text
language sql
immutable
as $$
  with t as (
    select regexp_replace(coalesce(trim(p_url), ''), '[?#].*$', '') as stripped
  ),
  s as (
    select
      stripped,
      -- Find the position of the first '/' AFTER the protocol "://"
      case
        when stripped ~ '^[a-z]+://' then position('/' in substring(stripped from position('://' in stripped) + 3))
        else 0
      end as path_offset
    from t
  ),
  parts as (
    select
      stripped,
      path_offset,
      case
        when path_offset > 0
          then substring(stripped from 1 for position('://' in stripped) + 2 + path_offset - 1)
        else stripped
      end as scheme_host,
      case
        when path_offset > 0
          then substring(stripped from position('://' in stripped) + 2 + path_offset)
        else ''
      end as path_part
    from s
  )
  select
    nullif(
      lower(scheme_host) ||
      case
        when path_part = '' then ''
        when right(path_part, 1) = '/' then left(path_part, length(path_part) - 1)
        else path_part
      end,
      ''
    )
  from parts
$$;

revoke all on function public.canonicalise_image_url(text) from public;
grant execute on function public.canonicalise_image_url(text) to authenticated, service_role;

-- ── Per-source backfill RPC ────────────────────────────────────────────────
-- Internal helper that takes a SETOF (entity_id, url) and inserts into
-- image_assets + image_asset_links for the given entity_type. Idempotent.
-- Returns (assets_inserted, links_inserted).
create or replace function public._backfill_image_assets_rows(
  p_entity_type text,
  p_role        text,
  p_source      text
) returns table (assets_inserted int, links_inserted int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_assets int := 0;
  v_links  int := 0;
begin
  -- Read pending pairs from a temp table created by the caller.
  -- See the inline DO blocks below.
  with src as (
    select t.entity_id, public.canonicalise_image_url(t.url) as url
    from _backfill_pairs t
    where t.url is not null and t.url <> ''
  ),
  hashed as (
    select s.entity_id, s.url, encode(digest(s.url, 'sha256'), 'hex') as url_hash
    from src s
    where s.url is not null
  ),
  ins_assets as (
    insert into public.image_assets (url_hash, url, source, last_seen_at)
    select distinct h.url_hash, h.url, p_source, now()
    from hashed h
    on conflict (url_hash) do nothing
    returning id
  )
  select count(*) into v_assets from ins_assets;

  with src as (
    select t.entity_id, public.canonicalise_image_url(t.url) as url
    from _backfill_pairs t
    where t.url is not null and t.url <> ''
  ),
  hashed as (
    select s.entity_id, encode(digest(s.url, 'sha256'), 'hex') as url_hash
    from src s
    where s.url is not null
  ),
  ins_links as (
    insert into public.image_asset_links (asset_id, entity_type, entity_id, role, sort_order)
    select ia.id, p_entity_type, h.entity_id, p_role, 0
    from hashed h
    join public.image_assets ia on ia.url_hash = h.url_hash
    on conflict (asset_id, entity_type, entity_id, role) do nothing
    returning asset_id
  )
  select count(*) into v_links from ins_links;

  return query select v_assets, v_links;
end $$;

-- ── Run the backfill ────────────────────────────────────────────────────────
-- Each block populates a temp table _backfill_pairs (entity_id uuid, url text),
-- then calls the helper, then drops the temp.
do $$
declare
  v_a int; v_l int;
begin
  -- venues.images[] (TEXT[])
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select v.id, v.images[1]
    from public.venues v
    where v.images is not null and array_length(v.images, 1) >= 1;
  select * into v_a, v_l from _backfill_image_assets_rows('venue', 'cover', 'scraper');
  raise notice 'venues: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- events.images[] (TEXT[])
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select e.id, e.images[1]
    from public.events e
    where e.images is not null and array_length(e.images, 1) >= 1;
  select * into v_a, v_l from _backfill_image_assets_rows('event', 'cover', 'scraper');
  raise notice 'events: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- marketplace_listings.images[] (TEXT[])
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select m.id, m.images[1]
    from public.marketplace_listings m
    where m.images is not null and array_length(m.images, 1) >= 1;
  select * into v_a, v_l from _backfill_image_assets_rows('marketplace_listing', 'cover', 'scraper');
  raise notice 'marketplace: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- personalities.image_url (TEXT)
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select p.id, p.image_url
    from public.personalities p
    where p.image_url is not null and p.image_url <> '';
  select * into v_a, v_l from _backfill_image_assets_rows('personality', 'cover', 'scraper');
  raise notice 'personalities: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- queer_villages.image_url (TEXT)
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select qv.id, qv.image_url
    from public.queer_villages qv
    where qv.image_url is not null and qv.image_url <> '';
  select * into v_a, v_l from _backfill_image_assets_rows('queer_village', 'cover', 'scraper');
  raise notice 'queer_villages: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- news_articles.image_url (TEXT)
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select n.id, n.image_url
    from public.news_articles n
    where n.image_url is not null and n.image_url <> '';
  select * into v_a, v_l from _backfill_image_assets_rows('news_article', 'cover', 'scraper');
  raise notice 'news_articles: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- unified_tags.image_url (TEXT) — alt + attribution carried over.
  create temp table _backfill_pairs (entity_id uuid, url text) on commit drop;
  insert into _backfill_pairs (entity_id, url)
    select ut.id, ut.image_url
    from public.unified_tags ut
    where ut.image_url is not null and ut.image_url <> '';
  select * into v_a, v_l from _backfill_image_assets_rows('tag', 'cover', 'admin_upload');
  raise notice 'unified_tags: % assets, % links', v_a, v_l;
  drop table _backfill_pairs;

  -- Carry the alt text + attribution from unified_tags onto the matching
  -- asset rows we just inserted (one-shot enrichment for the tag layer).
  update public.image_assets ia
     set alt_text = coalesce(ia.alt_text, ut.image_alt),
         attribution = coalesce(ia.attribution, ut.image_attribution),
         license = coalesce(ia.license, ut.image_license),
         alt_provenance = coalesce(ia.alt_provenance, 'imported')
    from public.unified_tags ut
   where ut.image_url is not null
     and ut.image_url <> ''
     and ia.url_hash = encode(digest(public.canonicalise_image_url(ut.image_url), 'sha256'), 'hex')
     and ia.alt_text is null;
end $$;

-- Cleanup: drop the helper that was only useful during backfill.
drop function if exists public._backfill_image_assets_rows(text, text, text);
