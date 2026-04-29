-- Phase 3 schema foundations: image_assets + ai_suggestions
--
-- Two new tables that consolidate concerns currently scattered across the
-- codebase. Pure additive — no existing column or table is altered.
-- Producers (mirroring jobs, AI tagging) and consumers (admin UI, search
-- indexer) opt in over time; until then they sit empty and harmless.
--
-- ── image_assets ──
-- Today, image metadata lives on entity rows (image_url, images[], image_hash
-- on news_articles, image_hashes jsonb on marketplace_listings, image_alt /
-- image_attribution on unified_tags). Cross-entity dedup, perceptual hashing,
-- and embedding storage have nowhere consistent to live. This table is the
-- target for that consolidation:
--   1 image  ⇄  1 image_assets row (keyed by SHA-256 of canonical URL)
--   N entities can attach to the same image via image_assets_links
--
-- ── ai_suggestions ──
-- AI-generated suggestions (tags, synonyms, alt text, descriptions, etc.)
-- need a per-entity diff view + human approval before they reach production.
-- The roadmap calls this out as a Phase 3 item. This table is the queue.

-- ============================================================================
-- image_assets
-- ============================================================================

create table if not exists public.image_assets (
  id              uuid primary key default gen_random_uuid(),
  -- SHA-256 of the canonical URL (after stripping tracking params, lowercasing
  -- host, removing trailing slash). Unique per asset. Ingestion populates this
  -- from the source URL; the same physical image can appear under multiple
  -- URLs (CDN variants, query strings) — that's tracked via image_assets_links.
  url_hash        text not null unique,
  -- The canonical URL we'll fetch from. May be rewritten over time
  -- (e.g. mirror to R2); kept editable.
  url             text not null,
  -- Perceptual hash for visual dedup across entities. Phash (8x8 average) is
  -- the typical choice; also acceptable: dhash, ahash. Hex string. NULL until
  -- a future job computes it.
  phash           text,
  -- Image bytes hash (different from url_hash). Useful for "is this byte-for-
  -- byte the same image we already mirrored?" checks.
  content_hash    text,
  width           int,
  height          int,
  bytes           bigint,
  format          text check (format is null or format in ('jpeg','png','webp','avif','gif','svg','heic','other')),
  -- Provenance: where did we first see this image?
  source          text,        -- 'scraper' | 'user_submission' | 'ai_generated' | 'partner' | 'admin_upload'
  source_ref      text,        -- e.g. scraper run id, AI prompt id
  license         text,        -- e.g. 'CC0', 'CC-BY-4.0', 'proprietary', 'unknown'
  attribution     text,
  alt_text        text,
  alt_provenance  text check (alt_provenance is null or alt_provenance in ('human','ai-generated','imported','none')),
  -- Optional CLIP / bge-vision embedding (1024-dim — matches the pgvector
  -- text embeddings dim chosen for the multilingual migration). Stored as
  -- regular array first, can be converted to vector(1024) when pgvector is
  -- added to this column.
  embedding       jsonb,
  -- Flagging / curation
  is_flagged      boolean not null default false,
  flagged_reason  text,
  status          text not null default 'active'
                  check (status in ('active','superseded','flagged','deleted')),
  superseded_by_id uuid references public.image_assets(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists image_assets_phash_idx
  on public.image_assets (phash) where phash is not null;
create index if not exists image_assets_content_hash_idx
  on public.image_assets (content_hash) where content_hash is not null;
create index if not exists image_assets_status_idx
  on public.image_assets (status);
create index if not exists image_assets_flagged_idx
  on public.image_assets (is_flagged) where is_flagged = true;

-- Junction table: an entity attaches to one or more image_assets, with a
-- role (cover, gallery, thumbnail) and a sort order.
create table if not exists public.image_asset_links (
  asset_id     uuid not null references public.image_assets(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  role         text not null default 'gallery'
               check (role in ('cover','gallery','thumbnail','social','og','square','hero')),
  sort_order   int not null default 0,
  added_by     uuid references auth.users(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (asset_id, entity_type, entity_id, role)
);

create index if not exists image_asset_links_entity_idx
  on public.image_asset_links (entity_type, entity_id);

-- Maintain image_assets.updated_at on row edits.
create or replace function public.tg_image_assets_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists image_assets_set_updated_at on public.image_assets;
create trigger image_assets_set_updated_at
  before update on public.image_assets
  for each row execute function public.tg_image_assets_set_updated_at();

-- ============================================================================
-- ai_suggestions
-- ============================================================================

create table if not exists public.ai_suggestions (
  id              uuid primary key default gen_random_uuid(),
  -- What kind of suggestion?
  suggestion_type text not null
                  check (suggestion_type in (
                    'tag','synonym','alt_text','description','title',
                    'cluster_membership','category','image_replacement','translation','other'
                  )),
  -- Entity this suggestion applies to (NULL for global suggestions like new
  -- synonyms unattached to a specific tag).
  entity_type     text,
  entity_id       uuid,
  -- For locale-aware suggestions (translations, locale-specific alt text).
  locale          text check (locale is null or locale ~ '^(\*|[a-z]{2}(-[A-Z]{2})?)$'),
  -- The proposed value. Shape depends on suggestion_type:
  --   tag                 { "tag_id": uuid }  or  { "tag_slug": "..." }
  --   synonym             { "terms": [...], "replacements": [...], "is_one_way": true }
  --   alt_text            { "text": "..." }
  --   description / title { "text": "..." }
  --   cluster_membership  { "cluster_id": uuid }
  --   category            { "category_id": uuid }
  --   image_replacement   { "asset_id": uuid }
  --   translation         { "field": "name|description", "value": "..." }
  proposed_value  jsonb not null,
  -- For diff display in the admin UI: snapshot the existing value at
  -- suggestion-time so the admin can see "before vs after" without an extra
  -- fetch. Nullable when no prior value applies.
  current_value   jsonb,
  -- Provenance: which model / pipeline produced this?
  source          text not null
                  check (source in ('openai','anthropic','workers-ai','rule','editor','external')),
  source_model    text,
  source_run_id   text,
  prompt_hash     text,
  confidence      numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Approval workflow
  status          text not null default 'pending'
                  check (status in ('pending','approved','applied','rejected','superseded','expired')),
  reviewer_id     uuid references auth.users(id) on delete set null,
  review_notes    text,
  approved_at     timestamptz,
  applied_at      timestamptz,
  rejected_at     timestamptz,
  -- Auto-expire stale suggestions so the queue stays manageable.
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_suggestions_status_idx
  on public.ai_suggestions (status, created_at desc);
create index if not exists ai_suggestions_entity_idx
  on public.ai_suggestions (entity_type, entity_id) where entity_id is not null;
create index if not exists ai_suggestions_type_status_idx
  on public.ai_suggestions (suggestion_type, status);
create index if not exists ai_suggestions_expires_idx
  on public.ai_suggestions (expires_at) where expires_at is not null;

create or replace function public.tg_ai_suggestions_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists ai_suggestions_set_updated_at on public.ai_suggestions;
create trigger ai_suggestions_set_updated_at
  before update on public.ai_suggestions
  for each row execute function public.tg_ai_suggestions_set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.image_assets       enable row level security;
alter table public.image_asset_links  enable row level security;
alter table public.ai_suggestions     enable row level security;

-- image_assets: public read for active rows so the storefront can resolve
-- images attached to public entities. Writes admin-only via service role.
drop policy if exists image_assets_public_read on public.image_assets;
create policy image_assets_public_read on public.image_assets
  for select using (status = 'active');

drop policy if exists image_assets_admin_read on public.image_assets;
create policy image_assets_admin_read on public.image_assets
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- image_asset_links: same posture — public read so the storefront can resolve
-- "what images go with this venue?". Writes admin-only.
drop policy if exists image_asset_links_public_read on public.image_asset_links;
create policy image_asset_links_public_read on public.image_asset_links
  for select using (
    exists (
      select 1 from public.image_assets a
      where a.id = image_asset_links.asset_id and a.status = 'active'
    )
  );

drop policy if exists image_asset_links_admin_read on public.image_asset_links;
create policy image_asset_links_admin_read on public.image_asset_links
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- ai_suggestions: admin/moderator read only. Approved/applied suggestions
-- are an internal review workflow; nothing here is for public consumption.
drop policy if exists ai_suggestions_admin_read on public.ai_suggestions;
create policy ai_suggestions_admin_read on public.ai_suggestions
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- All writes go through the service role (admin edge functions).

comment on table public.image_assets is
  'Cross-entity image registry. One row per canonical image (URL hash). Hosts dedup, perceptual hash, embedding, license, alt text, status. Replaces ad-hoc image_url / images[] / image_hash columns over time.';
comment on table public.image_asset_links is
  'M:N between entities and image_assets, with a role (cover, gallery, ...) and sort order.';
comment on table public.ai_suggestions is
  'Queue of AI-generated suggestions awaiting human approval before they affect production. One suggestion per (entity, type, locale, run).';
