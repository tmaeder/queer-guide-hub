-- Re-assert tag_hygiene_stats so REPLAY order matches what prod actually runs.
--
-- 20260904104115 was applied by MCP apply_migration, which stamps the version
-- from real call time (2026-09-04). This repo dates migrations into the future,
-- so that version sorts BELOW 20261211120300_tag_hygiene_language_sentinels.
--
-- Both are already applied, and prod today returns the 26-key definition WITH
-- indexable_marketplace_facet (measured) — but only because 104115 was applied
-- LAST IN WALL-CLOCK. Version order and application order disagree, so a replay
-- from zero runs 104115 first and 20261211120300 second, ending on the 25-key
-- definition with the facet counter gone. Nothing is pending that would clobber
-- the live database; the divergence is between prod and the repo as a program.
--
-- That divergence is not theoretical: tagHygienePanelMetrics.test.ts scans the
-- LAST migration by version that defines this function, so the repo already
-- disagrees with prod, the baseline and the admin panel about whether the
-- counter exists.
--
-- The definitions do not conflict: 104115 is a strict SUPERSET (26 keys vs 25,
-- delta exactly indexable_marketplace_facet) because it was authored on top of
-- the language sentinels. This re-issues that body verbatim above the repo max
-- so replay converges on prod. enforce_tag_facet_page_gate and
-- trg_tag_facet_page_gate are untouched by the language migration and need no
-- re-assertion (both verified live).
create or replace function public.tag_hygiene_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  stamps as (
    select btrim(description) as d
      from unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and not public.is_marketplace_facet(slug, entity_kind)),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
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
    'indexable_marketplace_facet', (
      select count(*) from active
       where seo_indexable
         and public.is_marketplace_facet(slug, entity_kind)),
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    'event_tag_pairs_unlinked', (
      with vocab as (
        select lower(u.name) as key, u.id as tag_id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.name) <> ''
        union
        select lower(u.slug), u.id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.slug) <> ''
      ), unambiguous as (
        select key, (array_agg(tag_id))[1] as tag_id
          from vocab group by key having count(distinct tag_id) = 1
      ), pairs as (
        select distinct e.id as entity_id, v.tag_id
          from events e
          cross join lateral unnest(e.tags) as t
          join unambiguous v on v.key = lower(btrim(t))
         where e.created_at < now() - interval '1 hour'
      )
      select count(*) from pairs p
       where not exists (
         select 1 from unified_tag_assignments a
          where a.entity_id = p.entity_id and a.tag_id = p.tag_id
            and a.entity_type = 'event')),
    'alias_equals_name', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where lower(a.alias_name) = lower(t.name)),
    'alias_mojibake', (
      select count(*) from tag_aliases
       where position(chr(65533) in alias_name) > 0),
    'refusal_prose_active', (
      select count(*) from active a
       where lower(btrim(coalesce(a.short_description, ''))) = 'no information available'
          or btrim(coalesce(a.long_description, '')) ~* '^there is no information available'),
    'unreviewed_typed_alias', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where a.alias_type <> 'multilingual'
         and a.review_status = 'auto'
         and t.status = 'active'),
    'relations_pending_review', (
      select count(*) from tag_relations
       where review_status = 'pending'
          or (review_status = 'auto' and relation_type = 'related')),
    'prose_unreviewed', (
      select count(*) from active
       where description is not null and prose_reviewed_at is null),
    'slug_diacritic_lossy', (
      select count(*) from unified_tags
       where status <> 'merged'
         and name ~ '[^\x00-\x7F]'
         and slug is distinct from public.normalize_tag_slug(name)),
    'name_mojibake', (
      select count(*) from unified_tags
       where status <> 'merged'
         and position(chr(65533) in name) > 0),
    'name_contains_hashtag', (
      select count(*) from unified_tags
       where status = 'active' and name like '%#%'),
    'non_latin_name', (
      select count(*) from unified_tags
       where name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]')
  ) into v;

  return v;
end;
$function$;
