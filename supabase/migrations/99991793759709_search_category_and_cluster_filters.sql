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
  v_predicates constant text := $sql$
    and (not (%1$s ? 'categories') or lower(sd.facets->>'category') in (
      select lower(value)
      from jsonb_array_elements_text(%1$s->'categories')
    ))
    and (not (%1$s ? 'cluster_ids') or (public.tag_facet_of(sd.entity_type), sd.entity_id) in (
      select public.tag_facet_of(uta.entity_type), uta.entity_id
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
    v_src := pg_get_functiondef(v_fn);
    v_anchor := format('lower(sd.facets->>''category'') = lower(%s->>''category''))', v_filters);
    -- The hybrid implementation uses the same predicate without spaces.
    if position(v_anchor in v_src) = 0 then
      v_anchor := replace(v_anchor, ' = ', '=');
    end if;
    v_new := v_anchor || format(v_predicates, v_filters);
    if position(v_new in v_src) > 0 then
      continue;
    end if;
    v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_count <> 1 then
      raise exception 'Expected one category predicate in %, found %', v_fn, v_count;
    end if;
    execute replace(v_src, v_anchor, v_new);
  end loop;
end
$patch$;
