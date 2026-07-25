-- P4·2 — hierarchical tag-filter expansion for search, done at the worker layer
-- (the search-proxy is already the query/synonym-expansion layer; search_hybrid
-- ranking stays untouched). This RPC returns the input slugs PLUS all narrower
-- descendants (walk `broader` edges downward, DAG so bounded). The original
-- slugs are ALWAYS preserved — expansion only widens recall, never drops a
-- filter. e.g. filter ['health'] → ['health','mental-health','depression',…].
create or replace function public.expand_tag_slugs_with_narrower(p_slugs text[])
returns text[]
language sql stable security definer set search_path = public as $$
  with recursive seed as (
    select id from public.unified_tags where slug = any(p_slugs) and status = 'active'
  ),
  down as (
    select id from seed
    union
    select r.source_tag_id
    from public.tag_relations r
    join down d on d.id = r.target_tag_id
    where r.relation_type = 'broader'
  )
  -- original slugs (verbatim) UNION descendant slugs (active), deduped, capped
  select (
    select array_agg(s) from (
      select distinct s from unnest(
        p_slugs || coalesce(
          (select array_agg(t.slug) from down d join public.unified_tags t on t.id = d.id and t.status='active'),
          '{}'::text[])
      ) s
      limit 200
    ) x
  );
$$;

revoke all on function public.expand_tag_slugs_with_narrower(text[]) from public;
grant execute on function public.expand_tag_slugs_with_narrower(text[]) to anon, authenticated, service_role;

-- P3·2 — creation gate hardening: the existing flag_near_duplicate_on_insert
-- flags trigram-similar new tags to review (soft gate, no hard-reject). Make it
-- respect the governed anti-merge graph: never flag a pair that's recorded in
-- tag_relationship_exclusions as deliberately-distinct (Trans↔Non-Binary,
-- HIV↔AIDS, …) — those are known false positives.
create or replace function public.flag_near_duplicate_on_insert()
returns trigger
language plpgsql set search_path to 'public', 'extensions' as $function$
DECLARE
  similar_tag RECORD;
BEGIN
  FOR similar_tag IN
    SELECT id, name, similarity(LOWER(NEW.name), LOWER(name)) as sim
    FROM unified_tags
    WHERE id != NEW.id
      AND status = 'active'
      AND similarity(LOWER(NEW.name), LOWER(name)) > 0.7
      AND NOT EXISTS (
        SELECT 1 FROM tag_relationship_exclusions e
        WHERE e.tag1_id = LEAST(NEW.id, unified_tags.id)
          AND e.tag2_id = GREATEST(NEW.id, unified_tags.id)
      )
    ORDER BY similarity(LOWER(NEW.name), LOWER(name)) DESC
    LIMIT 3
  LOOP
    INSERT INTO tag_suggestions (
      entity_id, entity_type, tag_id, suggested_tag_name,
      source, confidence, status, created_at
    ) VALUES (
      NEW.id, 'tag', similar_tag.id,
      'Near-duplicate of "' || similar_tag.name || '" (similarity: ' || ROUND(similar_tag.sim::numeric, 2) || ')',
      'duplicate_warning', similar_tag.sim, 'pending', now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$function$;
