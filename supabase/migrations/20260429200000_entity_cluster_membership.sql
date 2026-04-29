-- Entity cluster membership helpers
--
-- Topic clusters (#154) bundle multiple unified_tags together. An entity's
-- "cluster membership" = the set of clusters whose tag set intersects the
-- entity's tag assignments. This migration adds two cheap lookup helpers
-- so callers (meilisearch-sync indexing, search-intelligence visibility
-- scoring, hub pages) don't need to rewrite the join each time.
--
-- Pure additive: no existing column or table is altered. SQL only.

-- ── entity_cluster_ids(entity_type, entity_id) ──────────────────────────────
-- Returns the array of active cluster IDs an entity belongs to via its tag
-- assignments. NULL-safe (returns empty array, never NULL).
create or replace function public.entity_cluster_ids(
  p_entity_type text,
  p_entity_id   uuid
) returns uuid[]
language sql
stable
as $$
  select coalesce(array_agg(distinct tc.id), '{}'::uuid[])
    from public.unified_tag_assignments uta
    join public.topic_cluster_tags tct on tct.tag_id = uta.tag_id
    join public.topic_clusters tc on tc.id = tct.cluster_id and tc.status = 'active'
   where uta.entity_id = p_entity_id
     and uta.entity_type = p_entity_type
$$;

-- ── entity_cluster_membership view ──────────────────────────────────────────
-- Bulk variant: one row per (entity_type, entity_id) with the cluster_ids
-- array. Useful for batch indexing pipelines that walk all venues / events
-- at once (meilisearch-sync's full-sync path).
create or replace view public.entity_cluster_membership as
  select
    uta.entity_type,
    uta.entity_id,
    array_agg(distinct tc.id order by tc.id) as cluster_ids,
    array_agg(distinct tc.slug order by tc.slug) as cluster_slugs
  from public.unified_tag_assignments uta
  join public.topic_cluster_tags tct on tct.tag_id = uta.tag_id
  join public.topic_clusters tc on tc.id = tct.cluster_id and tc.status = 'active'
  group by uta.entity_type, uta.entity_id;

-- ── cluster_entity_counts view ──────────────────────────────────────────────
-- Inverse: per cluster, how many entities of each type belong to it. Powers
-- editorial dashboards ("Pride Europe 2026 — 124 venues, 87 events").
create or replace view public.cluster_entity_counts as
  select
    tc.id as cluster_id,
    tc.slug as cluster_slug,
    uta.entity_type,
    count(distinct uta.entity_id) as entity_count
  from public.topic_clusters tc
  join public.topic_cluster_tags tct on tct.cluster_id = tc.id
  join public.unified_tag_assignments uta on uta.tag_id = tct.tag_id
  where tc.status = 'active'
  group by tc.id, tc.slug, uta.entity_type;

revoke all on function public.entity_cluster_ids(text, uuid) from public;
grant execute on function public.entity_cluster_ids(text, uuid)
  to anon, authenticated, service_role;

-- Views inherit RLS from underlying tables (topic_clusters status='active'
-- and unified_tag_assignments default policies). Granting SELECT explicitly
-- so anon callers (storefront facets) don't need a dedicated RLS policy.
grant select on public.entity_cluster_membership to anon, authenticated, service_role;
grant select on public.cluster_entity_counts     to anon, authenticated, service_role;

comment on function public.entity_cluster_ids(text, uuid) is
  'Returns active cluster IDs an entity belongs to via its tag assignments. Empty array, never NULL.';
comment on view public.entity_cluster_membership is
  'One row per (entity_type, entity_id) with the cluster_ids and cluster_slugs arrays. Bulk lookup for indexing pipelines.';
comment on view public.cluster_entity_counts is
  'Per-cluster tally of entities by type, via the cluster -> tags -> entities path. Powers editorial dashboards.';
