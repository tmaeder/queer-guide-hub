-- Bring `tag_hygiene_stats()` back into the repo. Prod is one counter ahead of
-- every migration in this tree, and that gap has the whole repo deadlocked.
--
-- WHAT HAPPENED. `indexable_marketplace_facet` was added to the live function
-- out of band -- it appears in NO migration here, and `pg_get_functiondef` on
-- prod returns 27 top-level keys where the newest defining migration
-- (20261211120300) has 26. The diff is exactly that one key; nothing else in the
-- body differs, which is what makes copying the live definition a safe repair
-- rather than a guess.
--
-- WHY IT BLOCKS EVERYTHING. `scripts/check-tag-hygiene.mjs` errors on any prod
-- stats key with no baseline entry -- deliberately, because a counter with no
-- baseline is "how a new gate silently does nothing". So `Critical data-quality
-- gates` has been red on EVERY open PR since that SQL landed, for a change none
-- of their authors made.
--
-- AND THE OBVIOUS FIX IS REFUSED, CORRECTLY. Adding the key to the baseline
-- alone fails `src/lib/__tests__/tagHygienePanelMetrics.test.ts`, a THREE-WAY pin
-- across the SQL, the baseline and the admin panel's `HYGIENE_METRICS`. Two PRs
-- reached for that shortcut independently (#3369, and this author on #3359 before
-- reverting it) and the pin caught both. The three layers have to move together,
-- which is why this migration ships beside the panel and baseline edits rather
-- than on its own.
--
-- The body below is `pg_get_functiondef()` output copied verbatim from prod, not
-- retyped -- the drift-recovery rule from `recover_drifted_migration_as_bytes`.
-- Re-running it against prod is a provable no-op; against any other environment
-- it closes the same gap.

CREATE OR REPLACE FUNCTION public.tag_hygiene_stats()
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

-- Assert the repair rather than trusting it: the function this migration just
-- defined must expose the counter that the baseline and the panel now carry.
do $verify$
begin
  if not (public.tag_hygiene_stats() ? 'indexable_marketplace_facet') then
    raise exception 'tag hygiene drift repair: the key is still missing after CREATE OR REPLACE';
  end if;
end
$verify$;
