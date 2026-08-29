-- Tag glossary content quality, phase 5: the sentinels.
--
-- Restates tag_hygiene_stats() from its latest definition (20261007163100 —
-- verified the newest restatement across main AND every sibling worktree
-- before touching it; two branches restating this function silently drop each
-- other's keys) and appends six counters for the classes the 2026-08-29
-- programme repaired, so they cannot regrow unseen:
--
--   alias_equals_name        0-invariant — an alias identical to its own
--                            tag's name asserts nothing (47 deleted).
--   alias_mojibake           0-invariant — U+FFFD in an alias is transport
--                            corruption, never a spelling ("M?Llerian").
--   refusal_prose_active     0-invariant — "No information available" stamps
--                            and LLM refusal essays published as definitions
--                            (175 + 38 nulled by 20261012090000).
--   unreviewed_typed_alias   advisory — typed (non-multilingual) alias rows
--                            still review_status='auto': displayed nowhere,
--                            trusted by nothing, awaiting human review.
--   relations_pending_review advisory — tag_relations rows awaiting review
--                            ('pending' from the LLM verifier + legacy 'auto'
--                            related rows the display gate now hides). A
--                            queue depth, not an invariant.
--   prose_unreviewed         advisory — active prose-bearing tags the
--                            mode='prose' pass has not visited yet. Drains
--                            ~300/day; new tags refill it. Age would be the
--                            hard-gate form (the uncategorized_active lesson).

create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  -- A short description shared by many tags is a bulk-import stamp, not a
  -- definition. See the header of 20261007163100.
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
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- The junction is the source of truth; this counts rows where it says one
    -- thing and the denormalised column says nothing. Zero after 20261007163100.
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    -- A bulk-import stamp published as a definition. Invisible to
    -- indexable_without_description, which only sees an EMPTY description.
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
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
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    -- ── 2026-08-29 glossary content-quality keys ─────────────────────────
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
       where description is not null and prose_reviewed_at is null)
  ) into v;

  return v;
end;
$function$;

-- The keys the earlier migrations in this wave rely on must survive this
-- restatement (the collision-surface rule cuts both ways).
do $verify$
begin
  if not (public.tag_hygiene_stats() ? 'denorm_category_missing') then
    raise exception 'glossary keys: tag_hygiene_stats() lost denorm_category_missing';
  end if;
  if not (public.tag_hygiene_stats() ? 'placeholder_description_active') then
    raise exception 'glossary keys: tag_hygiene_stats() lost placeholder_description_active';
  end if;
  if not (public.tag_hygiene_stats() ? 'alias_equals_name') then
    raise exception 'glossary keys: tag_hygiene_stats() did not gain alias_equals_name';
  end if;
end $verify$;
