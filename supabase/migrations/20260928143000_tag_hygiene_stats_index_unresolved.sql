-- `tag_hygiene_stats()` sat on the PostgREST statement_timeout and lost ~half the
-- time, failing `Critical data-quality gates` on unrelated PRs.
--
-- ## It was ONE counter, and not the one it looked like
--
-- Measured on prod 2026-08-24, EXPLAIN (ANALYZE, BUFFERS) per counter:
--
--     event_tag_strings_unresolved   6437 ms   <- 95% of the function
--     the other 13 counters (total)   214 ms
--     events_with_tags_unlinked       124 ms
--
-- `events_with_tags_unlinked` was the obvious suspect — it anti-joins 35k events
-- against 172k assignments — and it is innocent: the planner already picks a Hash
-- Right Anti Join fed by an index-only scan on
-- `idx_unified_tag_assignments_entity`. Do not "optimize" it.
--
-- Nor was this I/O. The slow counter reported `Buffers: shared hit=18792 read=0`
-- — fully cached, on a 126 MB `events` heap. It was pure CPU:
--
--     Nested Loop Anti Join
--       Join Filter: lower(u.name) = s OR lower(u.slug) = s
--       Rows Removed by Join Filter: 4045647
--
-- 538 distinct tag strings x a materialized 9,546-row `unified_tags`, ~8M
-- `lower()` calls. `unified_tags` has `UNIQUE (slug)` (raw, not `lower()`), a
-- trgm GIN on `name`, and no btree on `name` at all, so neither side of the OR
-- was indexable — and the `OR` itself blocks a hash join, which is what forced
-- the nested loop.
--
-- ## The fix is an identity, not a heuristic
--
-- `NOT (A OR B)` is `NOT A AND NOT B`. Split that way each arm gets its own
-- index scan. Verified equal on prod in ONE statement against ONE snapshot, so
-- the equivalence cannot be a timing artifact between two reads:
--
--     distinct_strings 538 | old_form 365 | new_form 365
--
-- Result: 6437 ms -> 147 ms (44x). The residual 143 ms is the unnest over
-- `events` building the 538 distinct strings, which is irreducible here.
-- Whole function: ~6.8 s -> ~0.5 s, i.e. 16x under the 8 s ceiling instead of
-- 0.85x-1.5x over it.
--
-- ## Why indexes and not the other two options
--
-- Splitting the function so CI reads only the cheap counters would have worked
-- (both event counters are `_advisory` and cannot fail the gate), but it drops
-- the two numbers that exist precisely to be watched — `events_with_tags_unlinked`
-- is the drain gauge for `run_event_tag_link` and is supposed to reach 0 and stay
-- there. A precomputed stats table would have added a writer and a staleness
-- window to a disk-constrained DB for a query that is 147 ms once indexed.
--
-- The two indexes are 328 kB each.
--
-- The timeout is NOT raised and the gate is NOT made non-blocking: the counts are
-- real and the gate is critical.

create index if not exists idx_unified_tags_lower_name on public.unified_tags (lower(name));
create index if not exists idx_unified_tags_lower_slug on public.unified_tags (lower(slug));

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
