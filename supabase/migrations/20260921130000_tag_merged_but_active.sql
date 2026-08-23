-- Found by the end-to-end pass on prod, not by any check that existed.
--
-- `https://queer.guide/tags/charit` returned 200 instead of the 301 it had
-- returned earlier the same day. The redirect row was intact and pointed at an
-- active canonical; the DATA was contradictory:
--
--   charit: status='active', seo_indexable=true, merged_into_id -> charite
--
-- A merged tag whose status says active. The edge resolver is not at fault —
-- a direct slug hit MUST win over the redirect table (10 redirect old_slugs are
-- also live tag slugs, per PR #2828), so it correctly served the row it found.
--
-- Nine tags are in this state, all with zero usage and zero assignments, all
-- seo_indexable. Seven predate this program and they are not obscure:
--
--   pride            -> news-pride            (canonical has 1,386 uses)
--   sports           -> news-sports           (1,451)
--   lgbtq-rights     -> lgbtqia-rights        (2,124)
--   discrimination   -> news-discrimination   (626)
--   education        -> news-education        (578)
--   queere-community -> queer-community       (29)
--   community-center -> community-center-venue
--   charit           -> charite
--   jannik-sch-mann  -> jannik-schumann
--
-- So /tags/pride and /tags/news-pride were BOTH live, indexable, 200 — the
-- duplicate-content outcome the merge engine exists to prevent, sitting in the
-- sitemap. The invariant `merged_into_id IS NOT NULL implies status='merged'`
-- was never enforced anywhere.
--
-- community-center is deliberately NOT repaired: its canonical
-- community-center-venue is DEPRECATED, so flipping it would turn a live page
-- into a 301 that lands on a 404 — the exact defect PR #2828 fixed. Leaving it
-- as a live duplicate is the lesser fault, and the new hygiene counter keeps it
-- visible instead of silently accepted.

do $$
declare v_fixed int; v_left int;
begin
  perform set_config('app.actor', 'migration:20260921130000_tag_merged_but_active', true);

  update unified_tags d
     set status = 'merged',
         seo_indexable = false,
         deprecated_at = coalesce(d.deprecated_at, now()),
         deprecation_reason = coalesce(d.deprecation_reason,
           'merged tag whose status had drifted back to active; repaired 20260921130000')
    from unified_tags c
   where c.id = d.merged_into_id
     and d.status <> 'merged'
     -- Never create a 301 into a 404.
     and c.status = 'active'
     and c.merged_into_id is null;
  get diagnostics v_fixed = row_count;

  select count(*) into v_left from unified_tags
   where merged_into_id is not null and status <> 'merged';

  raise notice 'merged-but-active repair: % fixed, % left (canonical not active)', v_fixed, v_left;
end $$;

-- Track the invariant so it cannot regrow unseen. Deliberately counts ALL of
-- them, including the one this migration refuses to repair — a counter that
-- excluded the hard case would read as clean while the duplicate page stayed up.
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),
    'commons_image_without_license', (
      select count(*) from active
       where image_url like 'https://upload.wikimedia.org/%' and image_license is null),
    'image_alt_column_empty', (
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    -- A merged tag still serving its own 200 page, so both it and its canonical
    -- are live and indexable. Found on prod by /tags/charit answering 200.
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (
        select 1 from unified_tags u
         where lower(u.name) = e.s or lower(u.slug) = e.s))
  ) into v;

  return v;
end;
$fn$;
