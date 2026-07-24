-- Enriched pending merge-review queue for the admin cockpit. Definer + admin-gated;
-- joins both endpoints so the UI shows names/slugs/usage without a client-side second fetch.
create or replace function public.tag_merge_queue(p_limit int default 200)
returns table (
  review_id uuid, similarity numeric, lexical_variant boolean, created_at timestamptz,
  canonical_id uuid, canonical_name text, canonical_slug text, canonical_usage int, canonical_category text,
  duplicate_id uuid, duplicate_name text, duplicate_slug text, duplicate_usage int, duplicate_category text
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  return query
    select r.id, r.similarity, r.lexical_variant, r.created_at,
           c.id, c.name, c.slug, coalesce(c.usage_count,0)::int, c.category,
           d.id, d.name, d.slug, coalesce(d.usage_count,0)::int, d.category
    from public.tag_merge_review r
    join public.unified_tags c on c.id = r.canonical_id
    join public.unified_tags d on d.id = r.duplicate_id
    where r.status = 'pending'
    order by r.lexical_variant desc, r.similarity desc
    limit greatest(p_limit, 0);
end $$;

-- Recent live (non-reversed) merges, for the reversibility/undo panel.
create or replace function public.tag_merge_recent(p_limit int default 20)
returns table (
  audit_id uuid, canonical_slug text, duplicate_slug text, actor text, source text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  return query
    select a.id, a.canonical_slug, a.duplicate_slug, a.actor, a.source, a.created_at
    from public.tag_merge_audit a
    where a.is_reversed = false
    order by a.created_at desc
    limit greatest(p_limit, 0);
end $$;

-- Lock down the base tables: all cockpit access is via the definer RPCs above
-- (which bypass RLS). Enabling RLS with no policies default-denies direct PostgREST reads;
-- also drop the stray table grants. service_role bypasses RLS for the pipeline.
alter table public.tag_merge_review enable row level security;
alter table public.tag_merge_audit  enable row level security;
revoke select, insert, update, delete on public.tag_merge_review from authenticated, anon;
revoke select, insert, update, delete on public.tag_merge_audit  from authenticated, anon;

revoke all on function public.tag_merge_queue(int)  from public;
revoke all on function public.tag_merge_recent(int) from public;
grant execute on function public.tag_merge_queue(int)  to authenticated, service_role;
grant execute on function public.tag_merge_recent(int) to authenticated, service_role;
