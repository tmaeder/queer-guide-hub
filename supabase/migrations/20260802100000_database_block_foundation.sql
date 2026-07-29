-- Database blocks: schema foundation.
--
-- Three pieces, all prerequisites for the CMS "database block" (a document block
-- that renders live platform entities in swappable layouts):
--
--   1. cms_pages.body_doc  — the block document canvas.
--   2. public.v_entity_cards — the ONLY relation the feature may read entities
--      from, with safety gating baked into the view body.
--   3. public.document_entity_edges — which entities a document points at.
--
-- Nothing here changes existing behaviour: body_doc starts NULL everywhere and
-- body_html stays the rendered artifact.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Document canvas
-- ────────────────────────────────────────────────────────────────────────────
--
-- Deliberately a NEW column rather than reusing cms_pages.body_json: body_json
-- already holds the crisis hotline dataset ({hotlines: [...]}, seeded by
-- 20260411120000_seed_help_hotlines.sql) and is read live by
-- src/pages/HelpHotlines.tsx and src/pages/resources/sections/CrisisStrip.tsx.
-- Writing a ProseMirror doc at its root would silently empty /help.

alter table public.cms_pages
  add column if not exists body_doc jsonb,
  add column if not exists body_source text not null default 'html';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cms_pages_body_doc_is_doc'
  ) then
    alter table public.cms_pages
      add constraint cms_pages_body_doc_is_doc
      check (body_doc is null or body_doc->>'type' = 'doc');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cms_pages_body_source_valid'
  ) then
    alter table public.cms_pages
      add constraint cms_pages_body_source_valid
      check (body_source in ('html', 'doc'));
  end if;
end $$;

comment on column public.cms_pages.body_doc is
  'ProseMirror document for the block editor. NULL until a page is opened and
   saved in the new editor. body_html stays the rendered, crawlable artifact.';

comment on column public.cms_pages.body_source is
  '''html'' = body_html is the source of truth (legacy, hand-authored in SQL).
   ''doc'' = body_doc is the source of truth and body_html is derived from it.
   Makes "which representation wins" a column rather than a convention.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Safety-gated entity projection
-- ────────────────────────────────────────────────────────────────────────────
--
-- WHY A VIEW AND NOT THE TABLE:
--
-- public.search_documents carries safety_gated, but its RLS policy is
--   create policy search_documents_public_read ... for select using (true)
-- (20260531155351_search_documents_pilot_table_and_sync.sql:48) and has never
-- been tightened. Search gating lives INSIDE the SECURITY DEFINER search RPCs,
-- not on the table. So a direct PostgREST read of search_documents returns
-- safety-gated venues/events/organizations — entities in criminalizing and
-- death-penalty countries that must only be visible to signed-in users.
--
-- The gate below is a WHERE clause in the view body, not RLS. That distinction
-- is the whole point:
--   * RLS is bypassed by the service-role key. A WHERE clause is not.
--   * service_role JWTs carry no `sub`, so auth.uid() is NULL for them and
--     gated rows are excluded even for a service-key caller.
-- There is no key, header, or client-supplied filter that re-admits them.
--
-- security_barrier stops the planner pushing a non-leakproof qual (e.g. ilike)
-- below the gate, which could otherwise leak gated rows through error timing.

create or replace view public.v_entity_cards
with (security_invoker = true, security_barrier = true) as
select
  sd.doc_id,
  sd.entity_type,
  sd.entity_id,
  sd.slug,
  sd.title,
  sd.description,
  sd.image_url,
  sd.city,
  sd.country,
  sd.start_date,
  sd.end_date,
  sd.is_free,
  sd.price_min,
  sd.price_max,
  sd.is_featured,
  sd.quality_score,
  sd.trust_score,
  sd.liveness_status,
  sd.closed_at,
  sd.content_language,
  sd.facets,
  -- Exposed so the editor can keep gated entities out of the crawlable
  -- body_html snapshot. Leaks nothing: anon never sees such a row at all,
  -- and a signed-in reader can already see the row itself.
  sd.safety_gated as is_gated,
  sd.updated_at
from public.search_documents sd
where (not sd.safety_gated) or (select auth.uid()) is not null;

comment on view public.v_entity_cards is
  'Anon-safe projection of search_documents for CMS database blocks. The
   safety gate is a WHERE clause in the view body, so unlike RLS it is NOT
   bypassed by the service-role key. Application and edge code must read
   entities through this view and never from search_documents directly.
   Deliberately omits embedding/search_tsv/geog.';

revoke all on public.v_entity_cards from public;
grant select on public.v_entity_cards to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Document → entity edges
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.document_entity_edges (
  id uuid primary key default gen_random_uuid(),
  document_table text not null default 'cms_pages'
    check (document_table in ('cms_pages')),
  document_id uuid not null,
  block_id text not null,
  block_index int not null default 0,
  edge_kind text not null check (edge_kind in ('static', 'query')),
  entity_type text not null check (entity_type in (
    'venue', 'event', 'marketplace', 'city', 'country', 'queer_village',
    'personality', 'news', 'milestone', 'group', 'organization'
  )),
  entity_id uuid,
  position int not null default 0,
  query_spec jsonb,
  created_at timestamptz not null default now(),
  constraint document_entity_edges_shape check (
    (edge_kind = 'static' and entity_id is not null and query_spec is null)
    or
    (edge_kind = 'query' and entity_id is null and query_spec is not null)
  )
);

comment on table public.document_entity_edges is
  'Entities referenced by a CMS document. entity_type vocab is the guide_picks /
   search_documents vocabulary (11 values) VERBATIM. Do NOT normalize through
   public.content_graph_norm_type(): it folds queer_village -> ''village'',
   which violates this CHECK. Normalization happens once, in TypeScript, in
   src/lib/databaseBlock/schema.ts.

   A kind=''query'' block contributes ONE row with entity_id NULL and the query
   in query_spec — its membership is dynamic by definition, so materializing
   member rows would go stale on every new entity and storm writes on this
   disk-constrained instance.';

comment on column public.document_entity_edges.entity_id is
  'NULL exactly when edge_kind = ''query'' (enforced by document_entity_edges_shape).';

create unique index if not exists document_entity_edges_static_uq
  on public.document_entity_edges (document_table, document_id, entity_type, entity_id)
  where edge_kind = 'static';

create unique index if not exists document_entity_edges_query_uq
  on public.document_entity_edges (document_table, document_id, block_id)
  where edge_kind = 'query';

create index if not exists document_entity_edges_entity_idx
  on public.document_entity_edges (entity_type, entity_id)
  where edge_kind = 'static';

create index if not exists document_entity_edges_doc_idx
  on public.document_entity_edges (document_table, document_id, block_index, position);

alter table public.document_entity_edges enable row level security;

-- ADMIN-READ-ONLY, deliberately. A publicly readable edges table is a
-- membership oracle: anon could diff entity_id values against the anon-visible
-- venues set, and every id present here but absent there is by construction a
-- safety-gated venue in a criminalizing country. That is exactly what the
-- count-only gated_count_for_location RPC exists to prevent. Public read buys
-- nothing — rendering the page already hydrates through v_entity_cards.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'document_entity_edges'
      and policyname = 'document_entity_edges_admin_all'
  ) then
    create policy document_entity_edges_admin_all
      on public.document_entity_edges
      for all
      using (public.has_role_jwt('admin'))
      with check (public.has_role_jwt('admin'));
  end if;
end $$;

revoke all on public.document_entity_edges from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Edge write path
-- ────────────────────────────────────────────────────────────────────────────
--
-- An RPC rather than a trigger on cms_pages: a trigger would fire on every
-- unrelated column write (including the updated_at touch that every save
-- performs) and would need a second, plpgsql implementation of the ProseMirror
-- walker that would inevitably drift from the TypeScript one.
--
-- Replace-per-document rather than a row-level diff: a page holds a handful of
-- blocks, this table has no triggers hanging off it, and the whole function
-- body is one transaction. Simplicity beats a clever diff at this size.

create or replace function public.sync_document_entity_edges(
  p_document_table text,
  p_document_id uuid,
  p_edges jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written int;
begin
  if not public.has_role_jwt('admin') then
    raise exception 'sync_document_entity_edges: admin role required'
      using errcode = '42501';
  end if;

  if p_document_table is distinct from 'cms_pages' then
    raise exception 'sync_document_entity_edges: unsupported document_table %',
      p_document_table using errcode = '22023';
  end if;

  if p_document_id is null then
    raise exception 'sync_document_entity_edges: document_id required'
      using errcode = '22023';
  end if;

  delete from public.document_entity_edges
  where document_table = p_document_table
    and document_id = p_document_id;

  with parsed as (
    select
      nullif(e->>'block_id', '') as block_id,
      coalesce((e->>'block_index')::int, 0) as block_index,
      e->>'edge_kind' as edge_kind,
      e->>'entity_type' as entity_type,
      case when jsonb_typeof(e->'entity_id') = 'string'
           then nullif(e->>'entity_id', '')::uuid end as entity_id,
      coalesce((e->>'position')::int, 0) as position,
      case when jsonb_typeof(e->'query_spec') = 'object'
           then e->'query_spec' end as query_spec
    from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) as e
  ),
  valid as (
    select * from parsed
    where block_id is not null
      and edge_kind in ('static', 'query')
      and entity_type is not null
      and (
        (edge_kind = 'static' and entity_id is not null and query_spec is null)
        or
        (edge_kind = 'query' and entity_id is null and query_spec is not null)
      )
  ),
  -- Collapse repeats so the partial unique indexes cannot be violated by a
  -- document that references the same entity from two blocks. Earliest
  -- occurrence in document order wins.
  deduped as (
    select distinct on (edge_kind, entity_type, entity_id, block_id) *
    from valid
    order by edge_kind, entity_type, entity_id, block_id, block_index, position
  ),
  static_rows as (
    select distinct on (entity_type, entity_id) *
    from deduped where edge_kind = 'static'
    order by entity_type, entity_id, block_index, position
  ),
  query_rows as (
    select distinct on (block_id) *
    from deduped where edge_kind = 'query'
    order by block_id, block_index
  ),
  inserted as (
    insert into public.document_entity_edges (
      document_table, document_id, block_id, block_index,
      edge_kind, entity_type, entity_id, position, query_spec
    )
    select
      p_document_table, p_document_id, block_id, block_index,
      edge_kind, entity_type, entity_id, position, query_spec
    from (select * from static_rows union all select * from query_rows) s
    returning 1
  )
  select count(*)::int into v_written from inserted;

  return v_written;
end;
$$;

revoke all on function public.sync_document_entity_edges(text, uuid, jsonb)
  from public, anon;
grant execute on function public.sync_document_entity_edges(text, uuid, jsonb)
  to authenticated;

comment on function public.sync_document_entity_edges(text, uuid, jsonb) is
  'Replaces the edge set for one CMS document. Admin-gated. Silently drops
   malformed entries rather than failing a save — edges are derived bookkeeping,
   and losing one must never block an editor from saving their work.';
