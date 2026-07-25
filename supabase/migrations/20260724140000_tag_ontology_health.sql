create or replace function public.tag_ontology_health()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'concepts_active',       (select count(*) from public.unified_tags where status='active'),
    'concepts_deprecated',   (select count(*) from public.unified_tags where status='deprecated'),
    'concepts_merged',       (select count(*) from public.unified_tags where status='merged'),
    'active_zero_usage',     (select count(*) from public.unified_tags t where t.status='active'
                                and coalesce(t.human_reviewed,false)=false
                                and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0),
    'human_reviewed_unused', (select count(*) from public.unified_tags t where t.status='active'
                                and coalesce(t.human_reviewed,false)=true
                                and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0),
    'facet_coverage',        (select count(distinct concept_id) from public.tag_facets),
    'facets',                (select jsonb_object_agg(facet, n)
                                from (select facet, count(*) n from public.tag_facets group by facet) f),
    'labels_total',          (select count(*) from public.tag_aliases),
    'curated_edges',         (select count(*) from public.tag_relations),
    'broader_edges',         (select count(*) from public.tag_relations where relation_type='broader'),
    'dedup_exclusions',      (select count(*) from public.tag_relationship_exclusions),
    'orphan_active_concepts',(select count(*) from public.unified_tags t where t.status='active'
                                and not exists (select 1 from public.tag_relations r
                                     where r.source_tag_id=t.id and r.relation_type='broader')),
    'dedup_backlog_hi',      (select count(*) from public.tag_relationships tr
                                where tr.similarity_score >= 0.90
                                  and not exists (select 1 from public.tag_relations r
                                      where (r.source_tag_id=tr.tag1_id and r.target_tag_id=tr.tag2_id)
                                         or (r.source_tag_id=tr.tag2_id and r.target_tag_id=tr.tag1_id))),
    'generated_at', now()
  );
$$;

grant execute on function public.tag_ontology_health() to authenticated, service_role;
