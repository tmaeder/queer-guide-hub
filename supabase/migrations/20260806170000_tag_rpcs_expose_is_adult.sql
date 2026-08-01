-- Safe Mode leaked adult tags through the tag-detail cards.
--
-- `ADULT_CATEGORY_NAMES` in src/components/resources/categoryMeta.ts matches the
-- v2 taxonomy names ('Sexuality & Kink', 'Fetishes & Interests', …) held in
-- `tag_categories`. That is correct for the two surfaces fed by
-- `tag_category_assignments` — the age gate and the noindex rule on the tag page
-- both work today.
--
-- It is NOT correct for the two "see also" / "in the taxonomy" cards:
--
--   * get_tag_ontology returns `unified_tags.category` — the LEGACY free-text
--     column, whose values are 'Kink & Fetish', 'Power Exchange', 'BDSM',
--     'Fetish Practices', 'Roles & Dynamics', … none of which the frontend set
--     contains. Measured on prod: 220 of the 687 tags reachable through
--     tag_relations are is_adult, and 218 of those are invisible to the filter —
--     anal-sex, anal-fisting, autofellatio, bestiality, 69ing all render with
--     Safe Mode ON.
--   * get_similar_tags resolves `tag_categories` via unified_tags.category_id,
--     which is NULL for 1,215 of 3,609 active tags, so it returns category=NULL
--     and the filter no-ops there too.
--
-- categoryMeta.ts has carried a TODO since P2-1 saying this set "will be derived
-- from unified_tags.is_adult" once the column exists. It does exist. Expose it
-- from both RPCs so the client can filter on the flag instead of string
-- matching. Both changes are additive — no caller loses a field.

-- jsonb return type: CREATE OR REPLACE is enough.
create or replace function public.get_tag_ontology(p_tag_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'broader', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'is_adult',coalesce(t.is_adult,false),
                        'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.target_tag_id
      where r.source_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
    ), '[]'::jsonb),
    'narrower', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'is_adult',coalesce(t.is_adult,false),
                        'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.source_tag_id
      where r.target_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
    ), '[]'::jsonb),
    'related', coalesce((
      select jsonb_agg(x.obj order by (x.obj->>'confidence')::numeric desc)
      from (
        select distinct on (other) jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                          'category',t.category,'is_adult',coalesce(t.is_adult,false),
                          'confidence',r.confidence) as obj, t.id as other
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
$function$;

-- RETURNS TABLE gains a column, so the old signature must be dropped first.
drop function if exists public.get_similar_tags(uuid, integer, double precision);

create function public.get_similar_tags(
  p_tag_id uuid,
  p_limit integer default 10,
  p_min_score double precision default 0.7
)
returns table(
  tag_id uuid,
  tag_name text,
  tag_slug text,
  category_name text,
  category_color text,
  similarity_score double precision,
  relationship_type text,
  usage_count integer,
  is_adult boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  RETURN QUERY
  WITH related AS (
    SELECT
      CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END AS related_tag_id,
      tr.similarity_score::float,
      tr.relationship_type
    FROM tag_relationships tr
    WHERE (tr.tag1_id = p_tag_id OR tr.tag2_id = p_tag_id)
      AND tr.similarity_score >= p_min_score
      AND NOT EXISTS (
        SELECT 1 FROM tag_relationship_exclusions tre
        WHERE tre.tag1_id = LEAST(p_tag_id, CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END)
          AND tre.tag2_id = GREATEST(p_tag_id, CASE WHEN tr.tag1_id = p_tag_id THEN tr.tag2_id ELSE tr.tag1_id END)
      )
    ORDER BY tr.similarity_score DESC
    LIMIT p_limit
  )
  SELECT
    ut.id, ut.name, ut.slug,
    -- category_id is NULL for a third of active tags; fall back to the legacy
    -- free-text column so the category is at least reported when it exists.
    COALESCE(tc.name, ut.category), tc.color,
    r.similarity_score, r.relationship_type,
    COALESCE(ut.usage_count, 0)::int,
    COALESCE(ut.is_adult, false)
  FROM related r
  JOIN unified_tags ut ON ut.id = r.related_tag_id
  LEFT JOIN tag_categories tc ON tc.id = ut.category_id
  WHERE ut.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      ut.id, ut.name, ut.slug,
      COALESCE(tc.name, ut.category), tc.color,
      0.0::float AS similarity_score,
      'same_category'::text AS relationship_type,
      COALESCE(ut.usage_count, 0)::int,
      COALESCE(ut.is_adult, false)
    FROM unified_tags ut
    LEFT JOIN tag_categories tc ON tc.id = ut.category_id
    WHERE ut.category_id = (SELECT category_id FROM unified_tags WHERE id = p_tag_id)
      AND ut.id != p_tag_id
      AND ut.status = 'active'
    ORDER BY ut.usage_count DESC NULLS LAST
    LIMIT p_limit;
  END IF;
END;
$function$;

-- DROP took the grants with it; restore the pre-existing set exactly.
grant execute on function public.get_similar_tags(uuid, integer, double precision)
  to anon, authenticated, service_role;
