-- topic_clusters
--
-- Editorial topical bundles that group multiple unified_tags together for
-- facets, hub pages, and queries that span more than one tag. Defined in
-- docs/search-intelligence/02-unified-model.md as a sibling concept to
-- tag_categories — categories are taxonomy (where a tag lives), clusters
-- are user-facing topics (e.g. "Pride Europe 2026", "Trans health resources").
--
-- A cluster does NOT directly attach to entities. Entities continue to attach
-- to unified_tags; clusters expand to entities via the cluster -> tags ->
-- entities path (using the existing unified_tag_assignments).
--
-- Migration is additive. No existing table or column is altered. RLS keeps
-- writes admin-only; reads are public so the storefront can render hub pages.

-- ── topic_clusters ───────────────────────────────────────────────────────────
create table if not exists public.topic_clusters (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  description       text,
  parent_cluster_id uuid references public.topic_clusters(id) on delete set null,
  is_featured       boolean not null default false,
  status            text not null default 'active'
                    check (status in ('draft','active','archived')),
  -- Editorial metadata
  curator_user_id   uuid references auth.users(id) on delete set null,
  starts_at         timestamptz,
  ends_at           timestamptz,
  cover_image_url   text,
  cover_image_alt   text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists topic_clusters_status_idx
  on public.topic_clusters (status);
create index if not exists topic_clusters_parent_idx
  on public.topic_clusters (parent_cluster_id) where parent_cluster_id is not null;
create index if not exists topic_clusters_featured_idx
  on public.topic_clusters (is_featured) where is_featured = true;
create index if not exists topic_clusters_window_idx
  on public.topic_clusters (starts_at, ends_at);

-- ── topic_cluster_tags ───────────────────────────────────────────────────────
create table if not exists public.topic_cluster_tags (
  cluster_id  uuid not null references public.topic_clusters(id) on delete cascade,
  tag_id      uuid not null references public.unified_tags(id) on delete cascade,
  weight      numeric(4,3) not null default 1.0
              check (weight >= 0 and weight <= 1),
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (cluster_id, tag_id)
);

create index if not exists topic_cluster_tags_tag_idx
  on public.topic_cluster_tags (tag_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- Keeps updated_at fresh on any row modification. Self-contained function so
-- this migration doesn't depend on a project-wide trigger helper.
create or replace function public.tg_topic_clusters_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists topic_clusters_set_updated_at on public.topic_clusters;
create trigger topic_clusters_set_updated_at
  before update on public.topic_clusters
  for each row execute function public.tg_topic_clusters_set_updated_at();

-- ── Helper RPC: expand cluster to entities ──────────────────────────────────
-- Returns (entity_type, entity_id, tag_id, weight) for every entity tagged
-- with any tag belonging to the cluster. Useful for hub pages and search
-- facets without forcing every caller to write the join.
create or replace function public.topic_cluster_entities(p_cluster_slug text)
returns table (
  entity_type text,
  entity_id   uuid,
  tag_id      uuid,
  weight      numeric
)
language sql
stable
as $$
  select uta.entity_type, uta.entity_id, ut.id as tag_id, tct.weight
    from public.topic_clusters tc
    join public.topic_cluster_tags tct on tct.cluster_id = tc.id
    join public.unified_tags ut on ut.id = tct.tag_id
                                and ut.status = 'active'
                                and ut.merged_into_id is null
    join public.unified_tag_assignments uta on uta.tag_id = ut.id
   where tc.slug = p_cluster_slug
     and tc.status = 'active'
$$;

revoke all on function public.topic_cluster_entities(text) from public;
grant execute on function public.topic_cluster_entities(text) to anon, authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.topic_clusters     enable row level security;
alter table public.topic_cluster_tags enable row level security;

-- Public read for active clusters and their tag links so the storefront
-- can render hub pages and facets. Drafts/archived stay admin-only.
drop policy if exists topic_clusters_public_read on public.topic_clusters;
create policy topic_clusters_public_read on public.topic_clusters
  for select using (status = 'active');

drop policy if exists topic_clusters_admin_read on public.topic_clusters;
create policy topic_clusters_admin_read on public.topic_clusters
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

drop policy if exists topic_cluster_tags_public_read on public.topic_cluster_tags;
create policy topic_cluster_tags_public_read on public.topic_cluster_tags
  for select using (
    exists (
      select 1 from public.topic_clusters tc
      where tc.id = topic_cluster_tags.cluster_id and tc.status = 'active'
    )
  );

drop policy if exists topic_cluster_tags_admin_read on public.topic_cluster_tags;
create policy topic_cluster_tags_admin_read on public.topic_cluster_tags
  for select using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','moderator')
    )
  );

-- Writes are admin-only via the edge function (service role bypasses RLS).
-- Browser-direct writes are not permitted.

comment on table public.topic_clusters is
  'Editorial topical bundles grouping multiple unified_tags. User-facing topics for hub pages and search facets. Distinct from tag_categories (taxonomy).';
comment on table public.topic_cluster_tags is
  'Many-to-many link from topic_clusters to unified_tags, with optional weight for ranking within a cluster.';
comment on function public.topic_cluster_entities(text) is
  'Expand a topic cluster to its entities via the cluster -> tags -> unified_tag_assignments path.';
