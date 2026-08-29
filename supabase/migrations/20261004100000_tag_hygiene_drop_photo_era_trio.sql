-- ============================================================================
-- Drop the photo-era hygiene trio (2026-08-29)
-- ----------------------------------------------------------------------------
-- image_without_license / commons_image_without_license / image_alt_column_empty
-- measured the glossary photo corpus, which 20261003100000 cleared wholesale
-- (all three have read a structural 0 since). They were kept through that
-- migration deliberately: the CI gate measures PROD on pull_request, so
-- removing them in the same PR would have failed every PR run until the
-- migration applied. That window is closed — this replacement removes them,
-- with scripts/tag-hygiene-baseline.json and src/lib/tagHygieneMetrics.ts
-- moving in lockstep (pinned by src/lib/__tests__/tagHygienePanelMetrics.test.ts).
--
-- This function replacement is applied LIVE before its PR merges, for the
-- inverse of the same deadlock: the gate fails on any stats key missing from
-- the baseline, so prod must stop returning the trio before a baseline
-- without it can pass. Pure CREATE OR REPLACE, no data change.
--
-- `active_tags_with_image_url` stays — the zero-invariant that guards against
-- any writer reintroducing photos.
--
-- Body otherwise byte-identical to 20261003100000, including the OR-split in
-- event_tag_strings_unresolved (re-merging it restores a 4M-row nested loop
-- and the PostgREST timeout) and the 4-space key indentation the drift test's
-- key scan depends on.

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
            where a.entity_id = e.id and a.entity_type = 'event'))
  ) into v;

  return v;
end;
$fn$;
