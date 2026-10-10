drop function if exists public.get_marketplace_tag_facets(text, text, boolean);

create or replace function public.get_marketplace_tag_facets(
  p_department text default null::text,
  p_subcategory_group text default null::text,
  p_include_adult boolean default false,
  p_in_stock boolean default true
)
returns table(slug text, name text, kind text, count bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT ut.slug, ut.name,
         CASE split_part(ut.slug, '-', 1)
           WHEN 'mat'   THEN 'material'
           WHEN 'occ'   THEN 'occasion'
           WHEN 'vibe'  THEN 'vibe'
           WHEN 'color' THEN 'color'
           WHEN 'size'  THEN 'size'
           WHEN 'genre' THEN 'genre'
           WHEN 'fit'   THEN 'fit'
         END AS kind,
         count(*)::bigint AS count
  FROM public.unified_tag_assignments uta
  JOIN public.unified_tags ut ON ut.id = uta.tag_id
  JOIN public.marketplace_listings ml ON ml.id = uta.entity_id
  WHERE uta.entity_type = 'marketplace_listing'
    AND ut.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
    AND ut.status = 'active'
    AND ml.status = 'active' AND ml.overview_eligible
    AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    AND (coalesce(p_in_stock, true) IS NOT TRUE
         OR ml.availability IS NULL OR ml.availability <> 'out_of_stock')
    AND (p_department IS NULL OR ml.department = p_department)
    AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
  GROUP BY ut.slug, ut.name
  ORDER BY count(*) DESC
  LIMIT 80;
$function$;

grant execute on function public.get_marketplace_tag_facets(text, text, boolean, boolean)
  to anon, authenticated, service_role;

do $verify$
declare
  v_facet bigint; v_grid bigint; v_facet_any bigint;
begin
  select count into v_facet from public.get_marketplace_tag_facets('apparel', null, false, true) where slug = 'color-black';
  select coalesce((array_agg(total_count))[1], 0) into v_grid
  from public.marketplace_browse_page('[["color-black"]]'::jsonb, '{"department":"apparel","in_stock":true}'::jsonb, 'boutique', 0, 24);
  if v_facet is distinct from v_grid then
    raise exception 'P1 failed: facet % <> grid % for color-black/apparel', v_facet, v_grid;
  end if;
  select count into v_facet_any from public.get_marketplace_tag_facets('apparel', null, false, false) where slug = 'color-black';
  if v_facet_any <= v_facet then
    raise exception 'P2 failed: p_in_stock=false (%) did not exceed p_in_stock=true (%)', v_facet_any, v_facet;
  end if;
  if (select count(*) from pg_proc where proname = 'get_marketplace_tag_facets') <> 1 then
    raise exception 'P3 failed: expected exactly 1 overload, found %', (select count(*) from pg_proc where proname = 'get_marketplace_tag_facets');
  end if;
  raise notice 'facet/grid agree at % (ungated %)', v_facet, v_facet_any;
end
$verify$;
