-- Marketplace facet RPCs returned HTTP 500 on /marketplace.
--
-- Cause: the five facet/count functions behind the marketplace sidebar each
-- aggregate every active listing straight off public.marketplace_listings
-- (249 MB heap, wide rows). Measured on prod: department counts read 17,617
-- blocks to count 27,462 rows, 1.6 s on a quiet DB. pg_stat_statements shows
-- the anon-called variants piling up at max ~2,999 ms, i.e. cut off by anon's
-- statement_timeout=3s (pg_roles.rolconfig), which PostgREST returns as 500.
-- Dry-run on prod: department counts 1,606 -> 35 ms; tag facets 1,626 -> 106 ms
-- with identical output; all five functions verified EXCEPT ALL diff 0 against
-- the live definitions in a rolled-back transaction (facets 134 ms, attribute
-- facets 155 ms, subcategory counts 46 ms). Refresh ~1.9 s.
-- Every marketplace page view fires all five in parallel, so under any load
-- some of them cross 3 s.
--
-- Fix: a narrow materialized view holding only the facet columns of
-- active + overview_eligible listings (~39k rows), refreshed every 10 minutes,
-- and the five api_private functions read it instead of the base table.
-- Bodies are otherwise identical to the live definitions; the public wrappers
-- and their grants are untouched. Cost: facet counts can lag listings by up to
-- 10 minutes, which is acceptable for sidebar counts.

create materialized view api_private.marketplace_facet_base as
select
  l.id,
  l.department,
  l.subcategory_slug,
  l.subcategory_group,
  l.category,
  l.category_id,
  l.business_type,
  l.content_rating,
  l.availability,
  l.sizes,
  l.colors,
  jsonb_build_object(
    'material', l.attributes -> 'material',
    'genre', l.attributes -> 'genre',
    'fit', l.attributes -> 'fit'
  ) as attributes,
  -- Facet tag ids per listing, so tag facets are an in-memory unnest instead
  -- of a join against all ~213k marketplace tag assignments (1.6 s -> ~0.1 s,
  -- output identical). Tag status/slug are still filtered live at query time.
  coalesce((
    select array_agg(uta.tag_id)
    from public.unified_tag_assignments uta
    join public.unified_tags t on t.id = uta.tag_id
    where uta.entity_type = 'marketplace_listing'
      and uta.entity_id = l.id
      and t.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
  ), '{}') as facet_tag_ids
from public.marketplace_listings l
where l.status = 'active' and l.overview_eligible
with data;

-- Unique index: required for REFRESH ... CONCURRENTLY, and the join key for tag facets.
create unique index marketplace_facet_base_id_uidx on api_private.marketplace_facet_base (id);

revoke all on api_private.marketplace_facet_base from public, anon, authenticated;

create or replace function public.run_marketplace_facet_base_refresh()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := clock_timestamp();
begin
  refresh materialized view concurrently api_private.marketplace_facet_base;
  return jsonb_build_object(
    'rows', (select count(*) from api_private.marketplace_facet_base),
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000)
  );
end;
$$;

revoke all on function public.run_marketplace_facet_base_refresh() from public, anon, authenticated;
grant execute on function public.run_marketplace_facet_base_refresh() to service_role;

create or replace function api_private.get_marketplace_department_counts(p_include_adult boolean default false)
returns table(department text, count bigint)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  SELECT department, count(*)::bigint AS count
  FROM api_private.marketplace_facet_base
  WHERE department IS NOT NULL AND department <> 'other'
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY department
  ORDER BY count(*) DESC;
$$;

create or replace function api_private.get_marketplace_subcategory_counts(p_include_adult boolean default false)
returns table(slug text, count bigint)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  SELECT subcategory_slug AS slug, count(*)::bigint AS count
  FROM api_private.marketplace_facet_base
  WHERE subcategory_slug IS NOT NULL AND subcategory_slug <> ''
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY subcategory_slug
  HAVING count(*) >= 3
  ORDER BY count(*) DESC;
$$;

create or replace function api_private.get_marketplace_attribute_facets(
  p_department text default null::text,
  p_subcategory_group text default null::text,
  p_include_adult boolean default false
)
returns table(kind text, slug text, count bigint)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  WITH scoped AS (
    SELECT l.sizes, l.colors, l.attributes
    FROM api_private.marketplace_facet_base l
    WHERE (p_include_adult OR l.content_rating IN ('sfw','suggestive'))
      AND (p_department IS NULL OR l.department = p_department)
      AND (p_subcategory_group IS NULL OR l.subcategory_group = p_subcategory_group)
  )
  SELECT kind, slug, count(*)::bigint
  FROM (
    SELECT 'size' AS kind, unnest(s.sizes) AS slug FROM scoped s WHERE s.sizes IS NOT NULL
    UNION ALL
    SELECT 'color', unnest(s.colors) FROM scoped s WHERE s.colors IS NOT NULL
    UNION ALL
    SELECT 'material', jsonb_array_elements_text(s.attributes->'material') FROM scoped s WHERE jsonb_typeof(s.attributes->'material') = 'array'
    UNION ALL
    SELECT 'genre', jsonb_array_elements_text(s.attributes->'genre') FROM scoped s WHERE jsonb_typeof(s.attributes->'genre') = 'array'
    UNION ALL
    SELECT 'fit', jsonb_array_elements_text(s.attributes->'fit') FROM scoped s WHERE jsonb_typeof(s.attributes->'fit') = 'array'
  ) x
  GROUP BY kind, slug
  ORDER BY kind, count(*) DESC;
$$;

create or replace function api_private.get_marketplace_tag_facets(
  p_department text default null::text,
  p_subcategory_group text default null::text,
  p_include_adult boolean default false,
  p_in_stock boolean default true
)
returns table(slug text, name text, kind text, count bigint)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  WITH tags AS MATERIALIZED (
    SELECT ut.id, ut.slug, ut.name
    FROM public.unified_tags ut
    WHERE ut.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
      AND ut.status = 'active'
  ),
  counts AS (
    SELECT u.tag_id, count(*) AS c
    FROM api_private.marketplace_facet_base ml
    CROSS JOIN LATERAL unnest(ml.facet_tag_ids) AS u(tag_id)
    WHERE (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (coalesce(p_in_stock, true) IS NOT TRUE
           OR ml.availability IS NULL OR ml.availability <> 'out_of_stock')
      AND (p_department IS NULL OR ml.department = p_department)
      AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
    GROUP BY u.tag_id
  )
  SELECT t.slug, t.name,
         CASE split_part(t.slug, '-', 1)
           WHEN 'mat'   THEN 'material'
           WHEN 'occ'   THEN 'occasion'
           WHEN 'vibe'  THEN 'vibe'
           WHEN 'color' THEN 'color'
           WHEN 'size'  THEN 'size'
           WHEN 'genre' THEN 'genre'
           WHEN 'fit'   THEN 'fit'
         END AS kind,
         sum(c.c)::bigint AS count
  FROM counts c
  JOIN tags t ON t.id = c.tag_id
  GROUP BY t.slug, t.name
  ORDER BY sum(c.c) DESC
  LIMIT 80;
$$;

create or replace function api_private.get_marketplace_facets(
  p_category text default null::text,
  p_subcategory text default null::text,
  p_business_type text default null::text,
  p_category_id uuid default null::uuid,
  p_include_adult boolean default false
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_sub_slug text := lower(regexp_replace(coalesce(p_subcategory, ''), '[\s\-]+', '_', 'g'));
  v_total bigint;
  v_by_cat jsonb;
  v_by_sub jsonb;
  v_by_bt jsonb;
  v_by_dept jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM api_private.marketplace_facet_base ml
  WHERE (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    AND (p_category IS NULL OR ml.category = p_category)
    AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
    AND (p_business_type IS NULL OR ml.business_type = p_business_type)
    AND (p_category_id IS NULL OR ml.category_id = p_category_id);

  SELECT coalesce(jsonb_object_agg(category, c), '{}'::jsonb) INTO v_by_cat
  FROM (
    SELECT ml.category, count(*)::bigint AS c
    FROM api_private.marketplace_facet_base ml
    WHERE ml.category IS NOT NULL
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.category
  ) s;

  SELECT coalesce(jsonb_object_agg(subcategory_slug, c), '{}'::jsonb) INTO v_by_sub
  FROM (
    SELECT ml.subcategory_slug, count(*)::bigint AS c
    FROM api_private.marketplace_facet_base ml
    WHERE ml.subcategory_slug IS NOT NULL AND ml.subcategory_slug <> ''
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.subcategory_slug
  ) s;

  SELECT coalesce(jsonb_object_agg(business_type, c), '{}'::jsonb) INTO v_by_bt
  FROM (
    SELECT ml.business_type, count(*)::bigint AS c
    FROM api_private.marketplace_facet_base ml
    WHERE ml.business_type IS NOT NULL
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (v_sub_slug = '' OR ml.subcategory_slug = v_sub_slug)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.business_type
  ) s;

  SELECT coalesce(jsonb_object_agg(department, c), '{}'::jsonb) INTO v_by_dept
  FROM (
    SELECT ml.department, count(*)::bigint AS c
    FROM api_private.marketplace_facet_base ml
    WHERE ml.department IS NOT NULL AND ml.department <> 'other'
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (p_category IS NULL OR ml.category = p_category)
      AND (p_business_type IS NULL OR ml.business_type = p_business_type)
      AND (p_category_id IS NULL OR ml.category_id = p_category_id)
    GROUP BY ml.department
  ) s;

  RETURN jsonb_build_object(
    'total', v_total, 'by_category', v_by_cat, 'by_subcategory', v_by_sub,
    'by_business_type', v_by_bt, 'by_department', v_by_dept);
END;
$$;

-- Refresh registered in the automation registry (registry of record) and
-- scheduled here, as every rpc-type automation is: sync_automations_to_cron()
-- cannot create a cron for a row with no action.command.
insert into public.admin_automations (slug, name, description, managed_by, trigger, action, schedule, enabled)
values (
  'marketplace_facet_base_refresh',
  'Marketplace facet counts refresh',
  'Refreshes api_private.marketplace_facet_base, the narrow view the marketplace sidebar facet/count RPCs read. Counts lag listings by at most one interval.',
  'system',
  '{"type":"schedule"}'::jsonb,
  '{"type":"rpc","fn":"run_marketplace_facet_base_refresh"}'::jsonb,
  '*/10 * * * *',
  true
)
on conflict (slug) do nothing;

select cron.schedule(
  'marketplace_facet_base_refresh',
  '*/10 * * * *',
  $cron$set statement_timeout='60s'; select public.run_marketplace_facet_base_refresh();$cron$
);

do $verify$
declare
  v_mv bigint;
  v_base bigint;
  v_src text;
begin
  select count(*) into v_mv from api_private.marketplace_facet_base;
  select count(*) into v_base from public.marketplace_listings where status = 'active' and overview_eligible;
  -- 1% tolerance: listings are written continuously, so an exact match can
  -- race a concurrent commit between the two statements and abort db push.
  if abs(v_mv - v_base) > greatest(10, v_base / 100) then
    raise exception 'P1 failed: facet base has % rows, live active+eligible listings %', v_mv, v_base;
  end if;
  if v_mv = 0 then
    raise exception 'P1b failed: facet base is empty, so every facet would read zero';
  end if;

  -- P2: all five functions read the view and none still scans the base table.
  select string_agg(p.prosrc, ' ') into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api_private'
    and p.proname in ('get_marketplace_department_counts','get_marketplace_attribute_facets',
                      'get_marketplace_tag_facets','get_marketplace_facets','get_marketplace_subcategory_counts');
  if (length(v_src) - length(replace(v_src, 'marketplace_facet_base', ''))) / length('marketplace_facet_base') < 9 then
    raise exception 'P2 failed: not every facet query reads api_private.marketplace_facet_base';
  end if;
  if position('public.marketplace_listings' in v_src) > 0 then
    raise exception 'P2b failed: a facet function still scans public.marketplace_listings';
  end if;

  if not exists (select 1 from cron.job where jobname = 'marketplace_facet_base_refresh' and active) then
    raise exception 'P3 failed: refresh cron is not scheduled';
  end if;
end;
$verify$;
