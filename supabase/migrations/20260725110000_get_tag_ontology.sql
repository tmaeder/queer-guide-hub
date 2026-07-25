-- P4 Task 1 — public read of the governed ontology graph for a tag.
-- Surfaces the curated tag_relations DAG (broader parents, narrower children,
-- curated related) on the public tag/glossary page, replacing the raw
-- similarity pool for the hierarchy sections. Read-only, SECURITY DEFINER so
-- anon can read regardless of tag_relations RLS; returns category so the client
-- can apply its safe-mode/adult filter. Only active tags surface.

create or replace function public.get_tag_ontology(p_tag_id uuid)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'broader', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.target_tag_id
      where r.source_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
    ), '[]'::jsonb),
    'narrower', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.source_tag_id
      where r.target_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
    ), '[]'::jsonb),
    'related', coalesce((
      select jsonb_agg(x.obj order by (x.obj->>'confidence')::numeric desc)
      from (
        select distinct on (other) jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                          'category',t.category,'confidence',r.confidence) as obj, t.id as other
        from public.tag_relations r
        join public.unified_tags t
          on t.id = case when r.source_tag_id = p_tag_id then r.target_tag_id else r.source_tag_id end
        where r.relation_type = 'related'
          and (r.source_tag_id = p_tag_id or r.target_tag_id = p_tag_id)
          and t.status = 'active'
        order by other, r.confidence desc
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_tag_ontology(uuid) from public;
grant execute on function public.get_tag_ontology(uuid) to anon, authenticated, service_role;
