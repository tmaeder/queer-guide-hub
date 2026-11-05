-- Apply multi-value refinements before counting and paginating. Use the same
-- predicates in both private search implementations, leaving the public
-- wrappers, grants, ranking, and legacy singular category filter intact.
do $patch$
declare
  v_fn regprocedure;
  v_filters text;
  v_src text;
  v_anchor text;
  v_new text;
  v_count int;
  v_category constant text := $sql$
    (not (%1$s ? 'categories') or lower(sd.facets->>'category') in (
      select lower(value)
      from jsonb_array_elements_text(%1$s->'categories')
    ))
$sql$;
  v_cluster constant text := $sql$
    and (not (%1$s ? 'cluster_ids') or (
      coalesce(public.tag_facet_of(sd.entity_type), sd.entity_type), sd.entity_id
    ) in (
      select coalesce(public.tag_facet_of(uta.entity_type), uta.entity_type), uta.entity_id
      from public.topic_clusters tc
      join public.topic_cluster_tags tct on tct.cluster_id = tc.id
      join public.unified_tag_assignments uta on uta.tag_id = tct.tag_id
      where tc.status = 'active'
        and ((%1$s->'cluster_ids') ? tc.id::text or (%1$s->'cluster_ids') ? tc.slug)
    ))
$sql$;
begin
  for v_fn, v_filters in
    select *
    from (values
      ('api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure, '$4'),
      ('api_private.search_facets(text,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,vector)'::regprocedure, 'p_filters')
    ) as implementations(fn, filters)
  loop
    v_src := regexp_replace(pg_get_functiondef(v_fn), '--[^' || chr(10) || ']*', '', 'g');
    if position(format(v_cluster, v_filters) in v_src) > 0 then
      continue;
    end if;
    if v_filters = '$4' then
      v_anchor := 'lower(sd.facets->>''category'')=lower($4->>''category''))';
      v_new := v_anchor || ' and ' || format(v_category, v_filters) || format(v_cluster, v_filters);
      if position('jsonb_build_object(''total'',(select count(*) from cand),''hits''' in v_src) = 0 then
        raise exception 'Unexpected search_hybrid response structure';
      end if;
      v_src := replace(v_src,
        'jsonb_build_object(''total'',(select count(*) from cand),''hits''',
        'jsonb_build_object(''filterContract'',2,''total'',(select count(*) from cand),''hits''');
    else
      -- Category choices describe the same search with just the category
      -- restriction removed. The original facet and type totals stay filtered.
      v_anchor := $sql$and (not (p_filters ? 'category')    or lower(sd.facets->>'category') = lower(p_filters->>'category'))$sql$;
      v_new := format(v_cluster, v_filters);
      if position('cand as (' in v_src) = 0
         or position('sd.price_min, sd.price_max, sd.is_free, sd.start_date' in v_src) = 0
         or position('select jsonb_strip_nulls(jsonb_build_object(' in v_src) = 0 then
        raise exception 'Unexpected search_facets query structure';
      end if;
      v_src := replace(v_src, 'cand as (', 'category_candidates as (');
      v_src := replace(v_src, 'sd.price_min, sd.price_max, sd.is_free, sd.start_date',
        'sd.price_min, sd.price_max, sd.is_free, sd.start_date, (' ||
        replace(v_anchor, 'and ', '') || ' and ' || format(v_category, v_filters) || ') as category_match');
      v_src := replace(v_src, 'select jsonb_strip_nulls(jsonb_build_object(', $sql$
, cand as (select * from category_candidates where category_match)
select jsonb_strip_nulls(jsonb_build_object(
  'category_options', (select jsonb_object_agg(value, n) from (
    select facets->>'category' as value, count(*) as n
    from category_candidates
    where nullif(facets->>'category', '') is not null
    group by 1 order by n desc, value limit 50
  ) options),
$sql$);
    end if;
    v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_count <> 1 then
      raise exception 'Expected one category predicate in %, found %', v_fn, v_count;
    end if;
    execute replace(v_src, v_anchor, v_new);
  end loop;
end
$patch$;
