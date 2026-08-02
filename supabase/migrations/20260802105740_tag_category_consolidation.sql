do $do$
declare v_deleted int;
begin
  -- All 19 rows are human_reviewed=true. log_unified_tag_change() RAISES when a
  -- 'system:%' actor touches a human_reviewed tag, and the trigger cascade from
  -- the DELETE below writes unified_tags.is_adult. Without this the entire
  -- migration rolls back.
  perform set_config('app.actor', 'admin:tag-quality-20260802', true);

  delete from public.tag_category_assignments a
   where a.tag_id in (
     select t.id from public.unified_tags t
      where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-')
     and a.category_id in (
       select tc.id from public.tag_categories tc
       left join public.tag_categories tcp on tcp.id = tc.parent_id
        where tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink');

  get diagnostics v_deleted = row_count;
  raise notice 'removed % bogus Sexuality & Kink assignments', v_deleted;

  update public.unified_tags t
     set category_id = null
   where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-'
     and t.category_id is not null
     and not exists (select 1 from public.tag_category_assignments a
                     where a.tag_id = t.id and a.category_id = t.category_id);
end $do$;

create or replace function public.run_tag_category_resync(p_batch int default 500)
returns int
language plpgsql security definer
set search_path = public
as $fn$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-category-resync', true);

  with target as (
    select t.id,
           (select tc.name
              from public.tag_category_assignments a
              join public.tag_categories tc on tc.id = a.category_id
             where a.tag_id = t.id
             order by a.is_primary desc nulls last, tc.level desc, tc.name
             limit 1) as want
      from public.unified_tags t
  ), diff as (
    select tg.id, tg.want from target tg
    join public.unified_tags u on u.id = tg.id
    where u.category is distinct from tg.want
    limit greatest(p_batch, 0)
  )
  update public.unified_tags u
     set category = d.want
    from diff d
   where u.id = d.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.run_tag_category_resync(int) from public;
grant execute on function public.run_tag_category_resync(int) to service_role;

create or replace function public.tags_without_category(p_limit int default 200)
returns table (id uuid, slug text, name text, usage_count int)
language sql stable
set search_path = public
as $fn$
  select t.id, t.slug, t.name, t.usage_count
  from public.unified_tags t
  where t.status = 'active'
    and not exists (select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  order by coalesce(t.usage_count, 0) desc
  limit greatest(p_limit, 0);
$fn$;

grant execute on function public.tags_without_category(int) to service_role, authenticated;

do $do$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments a on a.tag_id = t.id
    join public.tag_categories tc on tc.id = a.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
   where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-'
     and (tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink');
  if v_bad > 0 then
    raise exception '% marketplace facet tags still filed under Sexuality & Kink', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug in ('mat-cotton','mat-gold','mat-silicone','mat-lace','vibe-sporty')
     and is_adult;
  if v_bad > 0 then
    raise exception '% marketplace facet tags are still is_adult', v_bad;
  end if;
end $do$;;